"""Cut each example's tool list down to what the runtime would actually declare.

The raw data inlines all fifteen schemas per example, which renders as a
~5,000-token prompt. The trainer masks everything but the answer and then
truncates at --max-len, so the answer falls off the end and the loss is
exactly zero: sixteen steps of gradients from nothing. Five tools is also
what inference looks like — NEEDLE_FAMILIES never declares more.

    python prepare.py more-data.jsonl prepared.jsonl
"""
import json
import sys

KEEP = 5

source, destination = sys.argv[1], sys.argv[2]
with open(source) as handle, open(destination, "w") as out:
    for line in handle:
        line = line.strip()
        if not line:
            continue
        example = json.loads(line)
        called = {answer["name"] for answer in example.get("answers", [])}
        tools = example.get("tools", [])
        # The tools the answer names first, then whatever fills the slate —
        # a lineup with no distractors teaches the model there are none.
        wanted = [tool for tool in tools if tool["name"] in called]
        wanted += [tool for tool in tools if tool["name"] not in called][
            : KEEP - len(wanted)
        ]
        example["tools"] = wanted[:KEEP]
        out.write(json.dumps(example) + "\n")
