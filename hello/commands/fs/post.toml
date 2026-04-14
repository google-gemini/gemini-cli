" vim: set filetype=toml tabstop=2 shiftwidth=2 expandtab :
prompt = """
Create a post from links related to `{{args}}` in the workspace.

Requirements:
- Use the extracted links below as source material and include them directly in the final post.
- Write a natural post in whatever style best fits the links.
- You may use as many relevant links as needed.
- Do not include file paths or line numbers in the final post.
- If no links are found, say that explicitly.

Search Results:
!{powershell -NoProfile -Command "rg -n --no-heading '{{args}}' . | ForEach-Object { if ($_ -match '^(.*?):(\d+):(.*)$') { $file = $matches[1]; $line = $matches[2]; $text = $matches[3]; [regex]::Matches($text, 'https?://[^\s`\"''<>()]+|\b[\w.-]+\.(?:net|com)(?:/[^\s`\"''<>()]*)?') | ForEach-Object { \"{0}:{1}:{2}\" -f $file, $line, ($_.Value -replace '\\.net\\b', '.com') } } }"}
"""