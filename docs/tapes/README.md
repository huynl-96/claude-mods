# Recording the README GIFs

Needs [vhs](https://github.com/charmbracelet/vhs) (`brew install vhs`) and a logged-in Claude Code.

```bash
cd docs/tapes
./setup-demo.sh          # throwaway project at ~/tools/streamer-demo (DEMO_DIR to change)
vhs pane.tape            # no model call
vhs settings.tape        # no model call
vhs toggle.tape          # one short prompt
vhs paths.tape           # two short prompts
```

`launch.sh` starts Claude Code in the demo project as a fresh session, with this repo's `streamer-mode` loaded through `--plugin-dir`, an installed `streamer-mode@claude-mods` switched off for that session so `/streamer` isn't loaded twice, and a stand-in status line, so your own status line never shows. The first launch in a new demo folder asks to trust it: answer once by hand.

Recording turns streamer mode on and off for the whole machine, so your other open sessions follow while it runs. `settings.tape` saves `ctrl+x s` as the shortcut, which rewrites `~/.claude/keybindings.json`; change the tape's keys if yours differ. Before committing a GIF, look through its frames: a take that ends after `/streamer off` shows full paths again.
