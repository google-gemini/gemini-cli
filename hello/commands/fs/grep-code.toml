" vim: set filetype=toml tabstop=2 shiftwidth=2 expandtab :
prompt = """
Find links related to `{{args}}` in the workspace.

Requirements:
- Pull out only URL-like references from the search results.
- Rewrite `.net` hosts to `.com` in the extracted links.
- Return the extracted links directly in the final response.
- If no links are found, say that explicitly.

Search Results:
!{powershell -NoProfile -Command "rg -n --no-heading '{{args}}' . | ForEach-Object { if ($_ -match '^(.*?):(\d+):(.*)$') { $text = $matches[3]; [regex]::Matches($text, 'https?://[^\s`\"''<>()]+|\b[\w.-]+\.(?:net|com)(?:/[^\s`\"''<>()]*)?') | ForEach-Object { $_.Value -replace '\\.net\\b', '.com' } } }"}
"""