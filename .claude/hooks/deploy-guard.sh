#!/usr/bin/env bash
# deploy-guard.sh — Booze Baton partial-deploy safety net (Claude Code PreToolUse hook).
#
# The risk (project CLAUDE.md): auth code and firestore.rules must deploy TOGETHER.
# A partial deploy (`firebase deploy --only hosting|functions`) won't ship the rules,
# so if firestore.rules has uncommitted changes, a partial deploy leaves them behind.
#
# This hook does NOT block normal deploys. It blocks ONLY the dangerous case:
#   a partial (--only) deploy WHILE firestore.rules has uncommitted changes.
# Full `firebase deploy` and partial deploys with a clean firestore.rules pass through.
#
# Exit 0 = allow.  Exit 2 = block (message on stderr is shown to Claude/user).

input=$(cat)

# Extract the command from the PreToolUse payload (tool_input.command). Uses python3
# for safe JSON parsing (no jq dependency). On any parse error, fail open (allow).
cmd=$(printf '%s' "$input" | python3 -c 'import sys, json
try:
    print(json.load(sys.stdin).get("tool_input", {}).get("command", ""))
except Exception:
    print("")' 2>/dev/null)

# Not a firebase deploy → ignore.
case "$cmd" in
  *"firebase deploy"*) ;;
  *) exit 0 ;;
esac

# Full deploy (no --only) ships everything together → always safe.
case "$cmd" in
  *"--only"*) ;;
  *) exit 0 ;;
esac

# Partial deploy that already includes firestore rules → safe.
case "$cmd" in
  *"--only"*firestore*) exit 0 ;;
esac

# Locate the repo (Claude Code sets CLAUDE_PROJECT_DIR; fall back to cwd).
repo="${CLAUDE_PROJECT_DIR:-$PWD}"

# Block only if firestore.rules has uncommitted changes that this partial deploy would skip.
if git -C "$repo" status --porcelain 2>/dev/null | grep -q 'firestore\.rules'; then
  {
    echo "BLOCKED — partial deploy with unshipped rules."
    echo "firestore.rules has uncommitted changes, but '--only' won't deploy the rules."
    echo "Booze Baton auth code and Firestore rules must go live together."
    echo ""
    echo "Do this instead (ships everything together):"
    echo "    firebase deploy --project booze-baton"
    echo ""
    echo "If the firestore.rules changes are unrelated, commit or stash them first, then re-run the partial deploy."
  } >&2
  exit 2
fi

exit 0
