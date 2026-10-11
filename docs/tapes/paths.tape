# While it's on, new rows show with the home folder as ~; older rows stay hidden.
Source common.tape
Output ../media/paths.gif
Hide
Type "./launch.sh" Enter
Sleep 8s
Type "List the files in src, one line." Enter
Wait+Screen@120s /payments/
Sleep 4s
Type "/streamer" Sleep 400ms Enter
Sleep 3s
Show
Sleep 1s
Type "Print the absolute path of src/app.ts. Output only the path, nothing else." Enter
Wait+Screen@120s /streamer-demo\/src\/app/
Sleep 4s
Screenshot paths.png
Hide
Type "/streamer off" Sleep 400ms Enter
Sleep 2s
Ctrl+C Ctrl+C
Sleep 1s
