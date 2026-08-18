#!/usr/bin/env python3
"""Prints "<phone-udid> <watch-udid>" for one paired simulator, or nothing.

Reads the JSON listing rather than the plain-text one, whose interleaved
Watch: and Phone: lines are easy to grep apart and reassemble wrongly, leaving
you with the watch from one pair and the phone from another. Prefers an active
pair: an inactive one still boots, but WatchConnectivity never comes up on it.

Set ONEREP_PAIR=<pair-udid> to force a particular pair.
"""

import json
import os
import subprocess
import sys

pairs = json.loads(
    subprocess.run(
        ["xcrun", "simctl", "list", "pairs", "-j"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
)["pairs"]

wanted = os.environ.get("ONEREP_PAIR")
if wanted:
    pairs = {udid: pair for udid, pair in pairs.items() if udid == wanted}

for _, pair in sorted(pairs.items(), key=lambda kv: kv[1].get("state") != "active"):
    print(pair["phone"]["udid"], pair["watch"]["udid"])
    sys.exit(0)

sys.exit(1)
