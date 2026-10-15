# A private pane (Filetree) is covered, then comes back as it was.
Source common.tape
Output ../media/pane.gif
Hide
Type "./launch.sh" Enter
Sleep 9s
Type "/filetree" Sleep 400ms Enter
Sleep 3s
Escape
Sleep 1s
Screenshot pane-pre.png
Show
Sleep 2s
Type "/curtain" Sleep 400ms Enter
Sleep 4s
Screenshot pane-on.png
Type "/curtain off" Sleep 400ms Enter
Sleep 4s
Hide
Ctrl+C Ctrl+C
Sleep 1s
