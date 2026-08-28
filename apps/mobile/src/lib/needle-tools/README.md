# Quick actions

Fifty tools the on-device model can call: log a food, log a recipe, create a
preset, reorder them, delete one. Every tool is a plain function over
`QuickActionDeps`, so the whole catalogue runs in tests without a Convex server,
a WebView or a render. `wire.ts` is the only file that knows the app exists.

```ts
const session = await needleQuickActions({
  navigate,
  scopes: ["food"],            // the screen you are on — see below
  confirm: (calls) => askUser(calls),
})
await session.run("200g of greek yoghurt for breakfast")
```

## Scope the toolbox to the screen

Past five tools Needle switches to retrieval: only the five best-scoring schemas
enter the grammar, and an unselected tool is _unreachable_, not merely unlikely.
Retrieval accuracy therefore falls as the catalogue grows. Measured against the
real engine:

| prompt                        | 50 tools                            | scoped                      |
| ----------------------------- | ----------------------------------- | --------------------------- |
| `delete my push day preset`   | empty call, conf 1.0                | fires at 0.71–1.0           |
| `take me to my shopping list` | `add_grocery_item("shopping list")` | `show_grocery_list()`, 0.86 |
| `I drank a glass of water`    | 0.67                                | 0.92                        |

Twelve representative prompts against scoped toolboxes: 14 of 15 picked the
expected tool. The same prompts against all fifty: roughly half. Use
`QUICK_ACTION_SCOPES`.

## Four things that cost real accuracy

Every one of these was found by running the engine, not by reading the docs.

**No tool takes an id.** Arguments may only carry values evidenced by the input,
and nobody says `k57d8...`. As `delete_preset({ presetId })` the model answered
"delete my push day preset" with the empty call; `reorder_presets` came back as
`presetIds: ["legs first"]` — it reached for the only evidence it had. Tools take
names and resolve them with `matchByName`. A test asserts no argument ends in
`Id`.

**No example values in argument descriptions.** `nameArg` used to render
`e.g. "Push A"`. "Start my push workout" then came back as
`start_workout({ preset: "Push A" })` for a user whose preset is called _Push
Day_ — in context, an example looks exactly like evidence. Same bug twice: the
size list `"…litre 1000ml"` on `log_water` turned "a glass of water" into
`amountMl: 1000`. Examples go in the tool description, never the argument.

**Enums where a string will be filled in anyway.** `meal` was a free string,
because meal categories are user-configurable. "Log a pot of greek yoghurt" came
back as `meal: "greek yoghurt"` — with nothing constraining it the model takes
the nearest noun. Four literals compile into the grammar and make that
undecodable.

**Descriptions are retrieval input, not documentation.** They are what the user's
sentence is embedded against. `add_grocery_item` said "Add something to the
shopping list", so "take me to my shopping list" added an item called _shopping
list_. Dropping the noun and leading `open_screen` with the verbs people say —
open, show, go to, take me to — fixed both.

## Destructive tools

Six are marked `destructive`, and the mark is enforced rather than advisory:
`toolbox.execute` refuses without `{ confirmed: true }`, and `session.run()`
stops with `stop: "unconfirmed"` and the calls in `pending` when no `confirm`
handler is wired. Forgetting the handler cannot be the thing that deletes a
preset.

A retrieval miss on a destructive tool is a refusal, never a wrong delete — which
is why the one prompt still missing (`delete my push day preset`, where the
possessive and the trailing noun both fight it) is a nuisance rather than a
hazard. Other phrasings of the same request fire at 0.9–1.0.
