# Earlier conversation, the band and the status line hide; /streamer off brings them back.
Source common.tape
Output ../media/toggle.gif
Hide
Type "./launch.sh" Enter
Sleep 8s
Type "In one sentence, what does src/app.ts do?" Enter
Wait+Screen@120s /charge/
Sleep 4s
Show
Sleep 2s
Type "/streamer" Sleep 400ms Enter
Sleep 4s
Screenshot toggle-on.png
Type "/streamer off" Sleep 400ms Enter
Sleep 4s
Screenshot toggle-off.png
Hide
Ctrl+C Ctrl+C
Sleep 1s
