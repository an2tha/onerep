"""Generate multi-step tool-calling data for Needle 2, through OpenRouter.

The shipped `needle generate-data` writes one call per query, which is exactly
the model we already have: it logs a yoghurt and stops. What is missing from
the training set is the *sequence* — look the food up, then log what came back;
read the diary, then remove the entry you found; list the presets, then start
one. Those are the runs where a small model falls apart, because step two has
to be conditioned on step one rather than on the sentence.

    export OPENROUTER_API_KEY=sk-or-...
    python generate.py --count 600 --out chains.jsonl

Output is the trainer's format, one JSON object per line:

    {"query": ..., "reasoning": ..., "answers": [{"name","arguments"}, ...],
     "tools": [<the declared schemas, at most five>]}

Every row is validated against schema.json before it is written — names,
required arguments, unknown arguments, enum members, types — because a
generator that is trusted produces a training set that teaches the model to
call tools that do not exist. Rows that fail are dropped and counted, not
repaired: a silently corrected example is a lie about what the model asked for.

The tools declared per row mirror `NEEDLE_FAMILIES` in
apps/mobile/src/lib/needle-tools/index.ts, which is what the app actually puts
in front of the model. Training on all fifty while inference sees five teaches
a retrieval problem that does not exist at run time.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).parent
SCHEMA_PATH = HERE / "schema.json"
ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
# Free tier, 256k context, and it writes JSON without being talked into it.
# `--model` takes any OpenRouter slug if this one starts refusing batches.
DEFAULT_MODEL = "cohere/north-mini-code:free"

# Mirrors NEEDLE_FAMILIES. Kept here rather than parsed out of the TypeScript
# because a regex over source is a worse dependency than a list that fails
# loudly — `check_families` below refuses to run if a name has drifted.
FAMILIES: dict[str, list[str]] = {
    "food": [
        "log_food",
        "log_quick_food",
        "log_food_by_barcode",
        "search_food",
        "remove_food_entry",
    ],
    "diary": ["list_food_log", "repeat_meal_from_day"],
    "meals": [
        "log_meal_preset",
        "save_meal_preset",
        "list_meal_presets",
        "delete_meal_preset",
    ],
    "recipes": ["log_recipe", "list_recipes"],
    "hydration": ["log_water", "undo_last_water"],
    "fasting": ["start_fast", "stop_fast"],
    "supplements": ["list_supplements", "log_supplement", "skip_supplement"],
    "body": ["log_weight", "log_body_measurements", "log_daily_metric"],
    "workout": [
        "start_workout",
        "show_active_workout",
        "finish_workout",
        "abort_workout",
    ],
    "restDays": ["mark_rest_day", "unmark_rest_day", "show_workout_history"],
    "routines": [
        "list_presets",
        "create_preset",
        "rename_preset",
        "delete_preset",
    ],
    "routineOrder": ["reorder_presets", "move_preset_to_position"],
    "schedule": [
        "schedule_preset_on_day",
        "clear_scheduled_day",
        "show_weekly_routine",
    ],
    "groceries": [
        "add_grocery_item",
        "show_grocery_list",
        "check_off_grocery_item",
        "clear_checked_groceries",
    ],
    "mealPrep": ["list_meal_prep", "consume_meal_prep"],
    "repeats": [
        "create_repeat_meal",
        "list_repeat_meals",
        "pause_repeat_meal",
        "delete_repeat_meal",
    ],
}

# Families with no plausible two-step story are left out entirely rather than
# asked for chains they cannot support. `hydration` earns its place on "log a
# glass now and another with dinner"; `navigation` does not — one screen, one
# call, and it competes with every writer it sits beside.
CHAINABLE = [
    "food",
    "diary",
    "meals",
    "recipes",
    "hydration",
    "supplements",
    "body",
    "workout",
    "restDays",
    "routines",
    "routineOrder",
    "schedule",
    "groceries",
    "mealPrep",
    "repeats",
]

SYSTEM = """\
You write training data for a 45M-parameter on-device tool-calling model. It \
has no free-text mode: every turn it produces is a JSON list of calls, or an \
empty list meaning nothing it was given serves the request.

You are given the exact tools it will see. Write realistic things a person \
would say to a fitness and food diary app, together with the calls that \
answer them.

The point of this batch is SEQUENCES. Every example must need two or more \
calls, and the calls must be ordered — a later call should depend on what an \
earlier one returned, or be a second write the same sentence asked for. Good \
shapes:

  - read, then act on what was read: search a food then log it; list the diary \
    then remove an entry from it; show the grocery list then check something off
  - two writes one sentence asked for: log the water and the supplement; log \
    two foods; mark the rest day and look at the history
  - correct then redo: remove the wrong entry, log the right one

Rules, all of them load-bearing:
  - Use ONLY the tools given. Never invent a name or an argument.
  - Include every required argument. Omit arguments the sentence does not \
    license — do not invent a portion, a date or a meal that was not said.
  - Vary the phrasing hard: terse ("greek yog 200g, then log it"), verbose, \
    lowercase, typos, British and American spelling, times of day, past days.
  - `reasoning` is one short sentence saying why this order.
  - No example may repeat a query you have already written in this batch.

Answer with a JSON array of objects, nothing else:
[{"query": "...", "reasoning": "...", "answers": [{"name": "...", \
"arguments": {...}}, ...]}]
"""

NEGATIVE_SYSTEM = """\
You write training data for a 45M-parameter on-device tool-calling model whose \
hardest failure is doing something when it was asked to do nothing.

You are given the exact tools it will see. Write realistic sentences a person \
would say to a fitness and food diary app where the correct answer is THE \
EMPTY LIST — nothing in these tools serves the request. Cover: negation ("I \
skipped lunch", "don't log that"), questions the tools cannot answer ("how \
many calories are in an avocado?"), chat ("thanks"), requests about things \
outside the declared tools, and half-sentences.

`answers` must be an empty array for every example. `reasoning` is one short \
sentence saying what was asked and why nothing fits.

Answer with a JSON array of objects, nothing else:
[{"query": "...", "reasoning": "...", "answers": []}]
"""


def load_schema() -> dict[str, dict]:
    tools = json.loads(SCHEMA_PATH.read_text())
    return {tool["name"]: tool for tool in tools}


def check_families(catalogue: dict[str, dict]) -> None:
    """Refuse to run against a table that has drifted from the tool surface.

    A misspelt family member is not a typo here, it is a whole family quietly
    declaring four tools instead of five and a training set that never sees
    the fifth.
    """
    missing = [
        name
        for family in FAMILIES.values()
        for name in family
        if name not in catalogue
    ]
    if missing:
        raise SystemExit(
            "generate: these names are in FAMILIES but not in schema.json — "
            + ", ".join(sorted(set(missing)))
            + "\nThe table mirrors NEEDLE_FAMILIES; one of the two moved."
        )


def post(payload: dict, key: str, timeout: int) -> dict:
    request = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            # OpenRouter attributes traffic by these; without them the request
            # still works but lands in an anonymous bucket.
            "HTTP-Referer": "https://onerep.life",
            "X-Title": "OneRep Needle 2 data",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read())


def ask(payload: dict, key: str, attempts: int, timeout: int) -> str | None:
    """One call, with backoff. Returns None rather than raising: a batch that
    lost three of forty requests is still a batch."""
    for attempt in range(attempts):
        try:
            body = post(payload, key, timeout)
            return body["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as error:
            # 429 and 5xx are worth waiting out; 400 and 401 never are.
            if error.code not in (408, 429, 500, 502, 503, 504):
                sys.stderr.write(
                    f"  http {error.code}: {error.read()[:200]!r}\n"
                )
                return None
        except Exception as error:  # noqa: BLE001 - network, json, key shape
            sys.stderr.write(f"  {type(error).__name__}: {error}\n")
        if attempt < attempts - 1:
            time.sleep(2**attempt + random.random())
    return None


def extract_json(text: str):
    """The array, however the model wrapped it.

    Models fence JSON, prefix it with a sentence, or both. Cheaper to cut the
    array out than to argue about response_format across providers.
    """
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None


def argument_problem(
    call: dict, catalogue: dict[str, dict], declared: set[str]
) -> str | None:
    """Why this call could not have come from the tools we declared."""
    name = call.get("name")
    if not isinstance(name, str) or name not in declared:
        return f"undeclared tool {name!r}"
    arguments = call.get("arguments")
    if not isinstance(arguments, dict):
        return f"{name}: arguments is not an object"

    parameters = catalogue[name].get("parameters", {})
    properties = parameters.get("properties", {})
    for required in parameters.get("required", []):
        if required not in arguments:
            return f"{name}: missing required {required!r}"
    for key, value in arguments.items():
        spec = properties.get(key)
        if spec is None:
            return f"{name}: unknown argument {key!r}"
        expected = spec.get("type")
        if expected == "string" and not isinstance(value, str):
            return f"{name}: {key} should be a string"
        if expected in ("number", "integer") and not isinstance(
            value, (int, float)
        ):
            return f"{name}: {key} should be a number"
        if expected == "boolean" and not isinstance(value, bool):
            return f"{name}: {key} should be a boolean"
        if expected == "array" and not isinstance(value, list):
            return f"{name}: {key} should be an array"
        allowed = spec.get("enum")
        if allowed and value not in allowed:
            return f"{name}: {key}={value!r} is not one of {allowed}"
    return None


def validate(
    row: dict,
    tools: list[dict],
    catalogue: dict[str, dict],
    min_calls: int,
) -> str | None:
    if not isinstance(row, dict):
        return "not an object"
    query = row.get("query")
    if not isinstance(query, str) or len(query.strip()) < 3:
        return "no query"
    reasoning = row.get("reasoning")
    if not isinstance(reasoning, str) or not reasoning.strip():
        return "no reasoning"
    answers = row.get("answers")
    if not isinstance(answers, list):
        return "answers is not a list"
    if len(answers) < min_calls:
        return f"{len(answers)} call(s), wanted at least {min_calls}"

    declared = {tool["name"] for tool in tools}
    for call in answers:
        if not isinstance(call, dict):
            return "a call is not an object"
        problem = argument_problem(call, catalogue, declared)
        if problem:
            return problem
    return None


def batch(
    family: str,
    count: int,
    catalogue: dict[str, dict],
    key: str,
    model: str,
    temperature: float,
    negative: bool,
    attempts: int,
    timeout: int,
) -> tuple[list[dict], list[str]]:
    tools = [catalogue[name] for name in FAMILIES[family]]
    tools_json = json.dumps(tools, indent=2)
    want = "sentences that need no call at all" if negative else "examples"
    content = ask(
        {
            "model": model,
            "temperature": temperature,
            "messages": [
                {
                    "role": "system",
                    "content": NEGATIVE_SYSTEM if negative else SYSTEM,
                },
                {
                    "role": "user",
                    "content": (
                        f"Tools available to the model:\n{tools_json}\n\n"
                        f"Write {count} {want}."
                    ),
                },
            ],
        },
        key,
        attempts,
        timeout,
    )
    if content is None:
        return [], [f"{family}: no response"]

    parsed = extract_json(content)
    if not isinstance(parsed, list):
        return [], [f"{family}: response was not a JSON array"]

    kept: list[dict] = []
    dropped: list[str] = []
    for row in parsed:
        problem = validate(row, tools, catalogue, 0 if negative else 2)
        if problem:
            dropped.append(f"{family}: {problem}")
            continue
        kept.append(
            {
                "query": row["query"].strip(),
                "reasoning": row["reasoning"].strip(),
                "answers": row["answers"],
                "tools": tools,
            }
        )
    return kept, dropped


def out_hint(dropped: list[str]) -> str:
    """The single most common reason, which is nearly always the whole story."""
    if not dropped:
        return ""
    tally: dict[str, int] = {}
    for problem in dropped:
        tally[problem] = tally.get(problem, 0) + 1
    worst = max(tally.items(), key=lambda pair: pair[1])
    return f"Most common: {worst[0]} ({worst[1]}×)"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="chains.jsonl")
    parser.add_argument(
        "--count", type=int, default=400, help="How many rows to keep."
    )
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument(
        "--batch-size", type=int, default=10, help="Examples per request."
    )
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--temperature", type=float, default=1.0)
    parser.add_argument(
        "--families",
        default="",
        help="Comma-separated subset. Default is every chainable family.",
    )
    parser.add_argument(
        "--negatives",
        type=float,
        default=0.0,
        help=(
            "Fraction of the batch that should be sentences whose right answer "
            "is the empty call. The tuned model's worst failure is logging "
            "food for 'I skipped lunch'; this is the only thing that teaches "
            "it otherwise. Off by default because it is not multi-step data."
        ),
    )
    parser.add_argument("--attempts", type=int, default=4)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not key:
        raise SystemExit("set OPENROUTER_API_KEY")

    catalogue = load_schema()
    check_families(catalogue)

    families = (
        [f.strip() for f in args.families.split(",") if f.strip()]
        or CHAINABLE
    )
    unknown = [f for f in families if f not in FAMILIES]
    if unknown:
        raise SystemExit("unknown families: " + ", ".join(unknown))

    random.seed(args.seed)
    rounds = max(1, -(-args.count // args.batch_size))
    plan = [families[i % len(families)] for i in range(rounds)]
    negatives_wanted = int(rounds * args.negatives)
    kinds = [True] * negatives_wanted + [False] * (rounds - negatives_wanted)
    random.shuffle(kinds)

    print(f"  {'model':<10} {args.model}")
    print(f"  {'plan':<10} {rounds} requests × {args.batch_size} → {args.count}")
    print(f"  {'families':<10} {len(families)}")
    if negatives_wanted:
        print(f"  {'negatives':<10} {negatives_wanted} of {rounds} requests")

    seen: set[str] = set()
    rows: list[dict] = []
    dropped: list[str] = []

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(
                batch,
                family,
                args.batch_size,
                catalogue,
                key,
                args.model,
                args.temperature,
                negative,
                args.attempts,
                args.timeout,
            ): family
            for family, negative in zip(plan, kinds)
        }
        for future in as_completed(futures):
            kept, problems = future.result()
            dropped.extend(problems)
            for row in kept:
                fingerprint = re.sub(r"\W+", " ", row["query"].lower()).strip()
                if fingerprint in seen:
                    dropped.append("duplicate query")
                    continue
                seen.add(fingerprint)
                rows.append(row)
            print(
                f"  {'kept':<10} {len(rows)}/{args.count}"
                f"  (dropped {len(dropped)})",
                end="\r",
                flush=True,
            )

    rows = rows[: args.count]
    if not rows:
        # Every request failed. Writing the empty file anyway would truncate
        # whatever was there from the last run, which is the one thing worse
        # than generating nothing.
        raise SystemExit(
            f"\n  nothing survived validation ({len(dropped)} dropped). "
            f"{out_hint(dropped)}"
        )
    out = Path(args.out)
    with out.open("w") as handle:
        for row in rows:
            handle.write(json.dumps(row) + "\n")

    chains = sum(1 for row in rows if len(row["answers"]) >= 2)
    print(f"\n  {'wrote':<10} {len(rows)} rows  {out}")
    print(f"  {'chains':<10} {chains}  ({len(rows) - chains} single or empty)")
    print(f"  {'dropped':<10} {len(dropped)}")
    # The tally, not the list: forty "missing required food" lines say one
    # thing, and it is worth reading before another six dollars of generation.
    if dropped:
        tally: dict[str, int] = {}
        for problem in dropped:
            tally[problem] = tally.get(problem, 0) + 1
        for problem, times in sorted(
            tally.items(), key=lambda pair: -pair[1]
        )[:8]:
            print(f"    {times:>4}  {problem}")
    print(f"\n  next      python prepare.py {out} prepared.jsonl")


if __name__ == "__main__":
    main()
