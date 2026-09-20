#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SERVICE="$ROOT/services/unoq-agent"
PORT="${PORT:-8799}"
HUB="http://localhost:${PORT}"
HUB_PID=""
AGENT_PID=""

cleanup() {
  if [[ -n "$AGENT_PID" ]]; then kill -- "-$AGENT_PID" 2>/dev/null || true; fi
  if [[ -n "$HUB_PID" ]]; then kill -- "-$HUB_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "$HOME/.nvm/nvm.sh"
fi

setsid sh -c "cd '$ROOT' && exec env PORT='$PORT' pnpm --filter stream-hub start" &
HUB_PID=$!

for _ in $(seq 1 40); do
  if curl -fsS "$HUB/health" >/dev/null 2>&1; then break; fi
  sleep 0.25
done
curl -fsS "$HUB/health" >/dev/null

if [[ ! -x "$SERVICE/.venv/bin/python" ]]; then
  python3 -m venv "$SERVICE/.venv"
  "$SERVICE/.venv/bin/pip" install -r "$SERVICE/requirements.txt"
fi

setsid sh -c "cd '$SERVICE' && exec '$SERVICE/.venv/bin/python' agent.py --mock --hub '$HUB' --board uno_q" &
AGENT_PID=$!

JOB_ID="$(
  curl -fsS -X POST "$HUB/probe/jobs" \
    -H 'content-type: application/json' \
    -d '{"board":"uno_q","probes":[{"pin":"A0","mode":"analogRead","expect":{"min":100,"max":950}},{"pin":"D9","mode":"pulse","expect":{"value":1}}]}' |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])'
)"

RESULT=""
for _ in $(seq 1 40); do
  JOB_JSON="$(curl -fsS "$HUB/probe/jobs/$JOB_ID")"
  if RESULT="$(JOB_JSON="$JOB_JSON" python3 -c 'import json,os; job=json.loads(os.environ["JOB_JSON"]); print(json.dumps(job["result"]) if job.get("result") is not None else "")')" && [[ -n "$RESULT" ]]; then
    break
  fi
  sleep 0.25
done

RESULT="$RESULT" python3 -c '
import json, os, sys
result = json.loads(os.environ["RESULT"])
if len(result) != 2 or any(not isinstance(item.get("value"), (int, float)) for item in result):
    print("FAIL: unexpected probe result", file=sys.stderr)
    raise SystemExit(1)
'
echo "PASS: mock agent completed A0 and D9 probes"

if [[ -n "${WEB_URL:-}" ]]; then
  curl -fsS -X POST "$WEB_URL/api/probe" \
    -H 'content-type: application/json' \
    -d '{"manualId":"night_light","step":3}' >/dev/null
  echo "PASS: web route responded via WEB_URL"
fi
