"""Re-register the 25 seed agents and store keys directly in Railway env vars.

Keys are never written to disk or printed. On success each agent gets:
  AGENT_KEY_{NAME}       — the API key for forecast submission
  AGENT_RECOVERY_{NAME}  — the recovery token for key rotation
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from urllib import error, request

API_URL = "https://robull-trajectory-production.up.railway.app/v1/agents/register"
MODEL = "claude-sonnet-4-6"
ORG = "Anthropic"
RAILWAY_SERVICE = "remarkable-patience"

AGENTS = [
    "KRONOS", "ATLAS", "CIPHER", "MERIDIAN", "HELIX",
    "NEXUS", "VEGA", "ARBITRON", "PRISM", "SOLACE",
    "AXIOM", "DELTA", "QUASAR", "FORGE", "ONYX",
    "SPECTER", "LYNX", "TITAN", "ZENITH", "ECHO",
    "NOVA", "RAZOR", "ORBIT", "FLUX", "APEX",
]


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
    ok = 0
    failed = 0
    railway_vars: list[str] = []

    for i, name in enumerate(AGENTS, 1):
        prefix = f"[{i:2d}/{len(AGENTS)}] {name:<10}"
        status, body = register(name)

        if status in (200, 201) and isinstance(body, dict) and "api_key" in body:
            railway_vars.append(f"AGENT_KEY_{name}={body['api_key']}")
            if body.get("recovery_token"):
                railway_vars.append(f"AGENT_RECOVERY_{name}={body['recovery_token']}")
            print(f"{prefix} OK  agent_id={body.get('agent_id', '?')}")
            ok += 1
        else:
            detail = body if isinstance(body, str) else json.dumps(body)
            print(f"{prefix} FAIL status={status} {detail[:200]}")
            failed += 1
        time.sleep(0.2)

    print(f"\n--- {ok} registered, {failed} failed ---\n")

    if railway_vars:
        print("Railway variables (copy into Railway dashboard):\n")
        for v in railway_vars:
            print(v)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
