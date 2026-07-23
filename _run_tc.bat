@echo off 
set PATH=c:\Users\ari20\AppData\Local\Programs\cursor\resources\app\node_modules\@vscode\ripgrep\bin;C:\WINDOWS\system32;C:\WINDOWS;C:\WINDOWS\System32\Wbem;C:\WINDOWS\System32\WindowsPowerShell\v1.0\;C:\WINDOWS\System32\OpenSSH\;C:\Program Files\Inkscape\bin;C:\Program Files\nodejs\;C:\Program Files\PuTTY\;C:\Program Files\Git\cmd;C:\Users\ari20\AppData\Local\Programs\Python\Python313\Scripts\;C:\Users\ari20\AppData\Local\Programs\Python\Python313\;C:\Users\ari20\AppData\Local\Programs\Python\Python311\Scripts\;C:\Users\ari20\AppData\Local\Programs\Python\Python311\;C:\Users\ari20\AppData\Local\Programs\Python\Launcher\;C:\Users\ari20\AppData\Local\Microsoft\WindowsApps;C:\Users\ari20\AppData\Local\Programs\Microsoft VS Code\bin;C:\Users\ari20\AppData\Roaming\npm;C:\Users\ari20\AppData\Local\Programs\cursor\resources\app\bin;C:\Users\ari20\AppData\Local\Programs\Ollama 
where npm> c:\velvet\_where_npm.txt 2>& 
where node> c:\velvet\_where_node.txt 2>& 
cd /d c:\velvet 
npm run typecheck > c:\velvet\_typecheck_log.txt 2>& 
echo %0%> c:\velvet\_tc_el.txt 
echo done> c:\velvet\_tc_finished.txt
