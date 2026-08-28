# @repo/needle

Needle 2 on the device: 45M parameters at two bits a weight, 14 MB of engine,
13 MB of weights, about 28 MB of peak session RAM. It runs on the CPU, wants
nothing from CoreML or the ANE, and never touches the network once the files are
in place.

It is not a chat model. It has no free-text mode at all — the context declares
what may be called and every turn comes back as JSON, either a list of calls or
the empty call meaning "nothing declared here serves this". Extraction is the
same operation with one tool declared. That constraint is why it fits on a phone
and why this package has no `message` type anywhere in it.

```ts
import { createNeedleSession, defineTool } from "@repo/needle";
import * as z from "zod";

const needle = await createNeedleSession({
  baseUrl: "/needle",
  system: "date: 2026-08-26 Wed 14:30; locale: en-GB; device: phone",
  minConfidence: 0.6,
});

needle.toolbox.register(
  defineTool({
    name: "log_food",
    description: "Add a food to today's diary",
    input: z.object({ name: z.string(), grams: z.number().positive() }),
    execute: (input) => logFood(input),
  }),
);

const { calls, stop } = await needle.run("200g of chicken breast");
```

## What is where

|                         |                                                                             |
| ----------------------- | --------------------------------------------------------------------------- |
| `src/types.ts`          | The shapes that cross the boundary, and the `NeedleRuntime` contract        |
| `src/tools.ts`          | `NeedleToolbox`, `defineTool`, and zod → grammar-ready JSON Schema          |
| `src/session.ts`        | The loop, the queue that serialises it, `run` / `complete` / `extract`      |
| `src/turn.ts`           | Reads the engine's JSON. Never throws — a truncated buffer is a failed turn |
| `src/runtime-wasm.ts`   | Browser: `needle.js` + `needle.wasm`                                        |
| `src/runtime-native.ts` | Capacitor: in front of `NeedlePlugin.swift` and `NeedlePlugin.kt`           |
| `src/agent-tools.ts`    | `fromAgentTools`: reuse the coach's existing `ToolSet` unchanged            |
| `src/graph.ts`          | The same loop as a LangGraph, for when you need to interrupt it             |

## Reusing the coach's tools

`convex/ai/provider.ts` already defines every coach tool as a description, a zod
schema and an `execute` — `buildFormCoachTools(capture)` alone is thirteen
measurements over a pose capture. Those are the same measurements a local model
wants, so `fromAgentTools` takes that record and hands back Needle tools with
the schema converted and the zod parse kept in front of the handler.

```ts
import { fromAgentTools } from "@repo/needle/agent-tools";

needle.toolbox.register(...fromAgentTools(buildFormCoachTools(capture)));
```

Nothing about the cloud coach changes, and nothing here calls into it. The tool
definitions are the shared thing; the loop around them is not.

## run() or the graph?

`session.run()` is right almost always. `createNeedleGraph()` is the other ten
per cent: it can be checkpointed, streamed step by step into a UI, interrupted
before the node that writes (`approve`), and composed into a larger LangGraph
next to the cloud agent, which is already built that way. Both go through the
same `session.complete()` and the same toolbox, so there is no second loop to
keep in step.

## Confidence

`confidence` is the minimum of a calibrated head and the decode probability of
the call tokens, so the two have to agree before anything runs. The contract is
that you pick a threshold: act at or above it, re-ask or escalate to the cloud
coach below it. `minConfidence` is checked _before_ execution, because a
low-confidence call that has already written to the diary is not something a
caller can escalate out of.

Calibration holds for the base weights only. Tuned weights report `null`, and a
`null` never blocks — you cannot threshold on a number that does not exist.

## Where the weights come from

Not the same place on every platform, and the difference is worth knowing.

`libneedle.a` is two object files: 421 KB of hand-written NEON kernels, and
13.7 MB that is `needle2.cact` embedded verbatim as `needle_weights`. The kernel
object references that symbol as _undefined_ — it reads the linked-in weights
directly. So an iPhone or an Android device has the whole model the moment the
app is installed, and `needle_load` is the override for tuned weights rather
than the setup step. Nothing is downloaded and nothing is cached.

`needle.wasm` is 333 KB, kernels only. On the web the `.cact` is a real fetch,
and there is no way around it.

`createNeedleSession` picks the right one from the runtime's platform. Pass
`weights` yourself only when you are running a tuned `.cact`.

## Getting the files

```
bun run needle:fetch           # needle.js, needle.wasm, needle2.cact → apps/mobile/public/needle
bun run needle:fetch:native    # the four static archives            → apps/mobile/vendor/needle
bun run needle:fetch:all       # both, which is what a dev machine wants
```

`--native` selects _instead of_, not _in addition to_. `cap sync` copies
everything under `apps/mobile/public` into the app bundle — the pose models are
28 MB in there already — so a native build that also fetched the web assets
would ship a second, unread copy of the model in every IPA and APK. The native
jobs fetch only what they link against.

Ninety megabytes of build artifacts from the model repo, pinned to one commit
and checksummed on the way in — see `scripts/needle/manifest.json`. None of it
is committed, for the same reasons the pose weights are not.

## Wiring the native adapters

**Android** is wired already. `app/build.gradle` builds `src/main/cpp` — a JNI
shim over `libneedle.a`, because Kotlin cannot call into a static archive — for
`arm64-v8a` and `armeabi-v7a`, the only two slices the engine ships. Missing
archives stop CMake with one line rather than a wall of undefined symbols.
`MainActivity` registers the plugin.

**iOS** needs two clicks, once. `libneedle.a` has no module map, so Swift needs
a bridging header, and Xcode build settings do not live in a file `cap sync`
respects. In Xcode, select the **App** target → **Info** → set **Based on
Configuration File** to `Needle.xcconfig` for both Debug and Release. That file
carries the library search paths (device and simulator are both arm64 and need
different archives), the header search path, `-lneedle -lc++`, and the bridging
header.

`-lc++` is not optional: the engine is C++ behind a C interface, and without it
the link fails on `___cxa_throw` and a few dozen `std::` symbols, which reads
like a corrupt archive rather than a missing flag.

## The thing to know about the engine

There is one instance per process, behind four free C functions — `needle_reset()`
takes no handle and returns nothing. Two overlapping completions do not race on
a lock somebody forgot to take; they interleave inside one KV cache and come
back with each other's arguments. `NeedleSession` serialises every call through
one queue, and both native plugins do the same on their side. Do not construct a
second session expecting a second model.
