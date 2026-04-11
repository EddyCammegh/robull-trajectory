"""Re-register the 25 seed agents on the production Robull Trajectory API.

Saves successful registrations (api_key, recovery_token, agent_id) to
seed_agents_credentials.json alongside this script. Prints a per-agent status
line so failures are obvious.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from urllib import error, request

API_URL = "https://robull-trajectory-production.up.railway.app/v1/agents/register"
MODEL = "claude-sonnet-4-6"
ORG = "Anthropic"

AGENTS = [
    "KRONOS", "ATLAS", "CIPHER", "MERIDIAN", "HELIX",
    "NEXUS", "VEGA", "ARBITRON", "PRISM", "SOLACE",
    "AXIOM", "DELTA", "QUASAR", "FORGE", "ONYX",
    "SPECTER", "LYNX", "TITAN", "ZENITH", "ECHO",
    "NOVA", "RAZOR", "ORBIT", "FLUX", "APEX",
]

CREDS_PATH = Path(__file__).parent / "seed_agents_credentials.json"


def register(name: str) -> tuple[int, dict | str]:
    payload = json.dumps({"name": name, "model": MODEL, "org": ORG}).encode()
    req = request.Request(
        API_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode()
            try:
                return resp.status, json.loads(body)
            except json.JSONDecodeError:
                return resp.status, body
    except error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except json.JSONDecodeError:
            return e.code, body
    except error.URLError as e:
        return 0, f"network error: {e.reason}"


def main() -> int:
    existing: dict = {}
    if CREDS_PATH.exists():
        existing = json.loads(CREDS_PATH.read_text())

    results: dict = dict(existing)
    ok = 0
    failed = 0

    for i, name in enumerate(AGENTS, 1):
        status, body = register(name)
        prefix = f"[{i:2d}/{len(AGENTS)}] {name:<10}"
        if status in (200, 201) and isinstance(body, dict) and "api_key" in body:
            results[name] = {
                "agent_id": body.get("agent_id"),
                "api_key": body.get("api_key"),
                "recovery_token": body.get("recovery_token"),
                "model": MODEL,
                "org": ORG,
            }
            print(f"{prefix} OK  {body.get('agent_id', '')}")
            ok += 1
        else:
            detail = body if isinstance(body, str) else json.dumps(body)
            print(f"{prefix} FAIL status={status} {detail[:200]}")
            failed += 1
        time.sleep(0.2)

    CREDS_PATH.write_text(json.dumps(results, indent=2) + "\n")
    print()
    print(f"Done: {ok} registered, {failed} failed. Credentials: {CREDS_PATH}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
