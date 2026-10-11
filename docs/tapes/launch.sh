#!/bin/bash
# Starts Claude Code in the demo project as a fresh top-level session, with this repo's
# streamer-mode loaded from disk and a stand-in status line.
TAPES="$(cd "$(dirname "$0")" && pwd)"
D="${DEMO_DIR:-$HOME/tools/streamer-demo}"
cd "$D"
cat > "$TAPES/.settings.json" <<JSON
{ "statusLine": { "type": "command", "command": "bash $TAPES/statusline.sh", "refreshInterval": 1 } }
JSON
exec env -i HOME="$HOME" USER="$USER" PATH="$PATH" TERM=xterm-256color LANG=en_US.UTF-8 COLORTERM=truecolor \
  claude --settings "$TAPES/.settings.json" --plugin-dir "$TAPES/../../streamer-mode" "$@"
