#!/usr/bin/env bash
# version-check.sh — Booze Baton soft reminder to bump APP_VERSION before a deploy.
#
# Fires when a `firebase deploy` is about to run. If front-end files changed since the
# last commit but APP_VERSION (app.js) wasn't touched, it prints a reminder.
# This NEVER blocks — it always exits 0. It's a nudge, not a gate.

input=$(cat)

# Extract the command (PreToolUse tool_input.command). python3 for safe JSON parse; fail open.
cmd=$(printf '%s' "$input" | python3 -c 'import sys, json
try:
    print(json.load(sys.stdin).get("tool_input", {}).get("command", ""))
except Exception:
    print("")' 2>/dev/null)

# Only nudge on a firebase deploy.
case "$cmd" in
  *"firebase deploy"*) ;;
  *) exit 0 ;;
esac

repo="${CLAUDE_PROJECT_DIR:-$PWD}"

# Did any user-facing front-end file change since the last commit (staged or unstaged)?
changed=$(git -C "$repo" diff HEAD --name-only -- index.html app.js styles.css 2>/dev/null)
[ -z "$changed" ] && exit 0

# Was the APP_VERSION line itself changed? Only count ADDED diff lines (prefix '+'),
# not context lines — otherwise the unchanged version line shown next to an edit
# would be mistaken for a bump.
if ! git -C "$repo" diff HEAD -- app.js 2>/dev/null | grep -Eq '^\+.*APP_VERSION'; then
  {
    echo "REMINDER — version not bumped."
    echo "Front-end files changed ($(echo "$changed" | tr '\n' ' ')) but APP_VERSION (app.js, ~line 20) wasn't updated."
    echo "Bump APP_VERSION and LAST_UPDATED before deploying user-facing changes, so the live version label is correct."
    echo "(This is only a reminder — the deploy will proceed.)"
  } >&2
fi

exit 0
