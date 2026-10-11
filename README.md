# claude-mods

[Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview) by huynl-96. Needs Claude Code 2.1.287 or newer.

```
claude plugin marketplace add huynl-96/claude-mods
claude plugin install streamer-mode@claude-mods
```

Run `/reload-plugins` in any open session, or start a new one.

## streamer-mode

`/streamer` hides what you don't want on a shared screen: other mods' panes (a file tree, a browser), the bands above the prompt, and your status line.

| Command | What it does |
|---|---|
| `/streamer` | Turn streamer mode on or off |
| `/streamer on` / `/streamer off` | Set it directly |
| `/streamer settings` | Pick what to hide |

While it's on:

- **Panes** you've marked private close, and can't reopen until you turn it off. Filetree (`filetree`) and Terminal Browser (`browser`) are marked by default.
- **Bands** above the prompt are replaced by one line: `● streamer mode · /streamer off to stop`.
- **Status line** shows only `● streamer mode`, once you add the snippet below.

### Pick your own panes

Open `/streamer settings`. Every pane opened while the mod is loaded is listed there; tick the ones to hide. Mods can't list each other's panes up front, so open a pane once for it to show up. Your choices are saved across sessions.

### Hide your status line

A mod can't redraw a custom status line, so the mod writes `~/.claude/streamer-mode` and your status line script reads it. Add this right after your script reads its input:

```bash
[ -s ~/.claude/streamer-mode ] && { echo "● streamer mode"; exit 0; }
```

Status lines only rerun on session events, so add `"refreshInterval": 2` to `statusLine` in `~/.claude/settings.json` for the switch to show within 2 seconds.

The flag file is shared by every session: turning streamer mode on in one hides the status line in all of them, and it stays on after a restart until you run `/streamer off`.

### What it doesn't hide

The conversation itself. Anything already printed stays visible, so run `/clear` or start a new session before you share. For masking names and secrets in the conversation, see [screen-guard](https://github.com/danyuchn/claude-mods).

### What it can do

`claude plugin validate ./streamer-mode` lists it. It hooks session start, its own command, pane opening, and drawing panes and the band above the prompt. It reads `HOME`, writes only `~/.claude/streamer-mode`, and makes no network calls and runs no programs.

## License

MIT
