# /streamer settings: what to hide, the shortcut, and which panes count as private.
Source common.tape
Output ../media/settings.gif
Hide
Type "./launch.sh" Enter
Sleep 9s
Show
Sleep 1s
Type "/streamer settings" Sleep 400ms Enter
Sleep 3s
Screenshot settings.png
Type "3"
Sleep 1500ms
Type "3"
Sleep 1500ms
Type "s"
Sleep 3s
Type "s"
Sleep 2s
Screenshot settings-pre-key.png
Down Down Down Down Down Down Down Down
Sleep 800ms
Type "ctrl+x s"
Sleep 600ms
Enter
Sleep 3s
Screenshot settings-key.png
Hide
Escape
Ctrl+C Ctrl+C
Sleep 1s
