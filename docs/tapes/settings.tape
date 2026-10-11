# /streamer settings: what to hide, and which panes count as private.
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
Sleep 3s
Hide
Escape
Ctrl+C Ctrl+C
Sleep 1s
