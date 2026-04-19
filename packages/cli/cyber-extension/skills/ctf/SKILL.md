---
name: ctf
description: Capture The Flag and HackTheBox methodology for practice environments.
---

# CTF / HackTheBox Skill

## Mindset

In CTF/HTB environments, the objective is to find flag files (usually `user.txt` and `root.txt`). The approach is more aggressive than production pentesting.

## Enumeration-First Methodology

### Phase 1: Initial Scan (always start here)
```
hats_nmap_scan(target, ports="1-65535", flags="-sV -sC -O")
```
Or the faster approach:
```
hats_masscan(target, ports="1-65535", rate="1000")
→ then hats_nmap_scan on discovered ports with -sV -sC
```

### Phase 2: Service-Specific Enumeration

For EVERY open port:
1. Note the service and exact version
2. `hats_searchsploit("<service> <version>")`
3. Google: `<service> <version> exploit`

### Phase 3: Common CTF Patterns

| Port/Service | Common CTF Vector |
|---|---|
| 80/443 HTTP | Directory brute-force, source code review, file upload, LFI, SQLi |
| 21 FTP | Anonymous login, version exploit |
| 22 SSH | Credentials from elsewhere, key files |
| 139/445 SMB | Null session, anonymous shares, EternalBlue |
| 3306 MySQL | Default creds, SQLi from web app |
| 6379 Redis | Unauthenticated access, SSH key write |
| 27017 MongoDB | Unauthenticated access |
| 9200 Elasticsearch | Unauthenticated access, data dump |
| Custom high ports | Always investigate — often custom apps |

### Phase 4: Web Application (if HTTP found)
1. `hats_whatweb(url)` — identify CMS/framework
2. `hats_gobuster(url)` — find hidden directories
3. View source code of every page
4. Check `/robots.txt`, `/.git/HEAD`, `/sitemap.xml`
5. Look for login forms → try default creds → SQLi
6. Check for file upload → attempt webshell
7. Check for LFI → read `/etc/passwd`, SSH keys, source code

### Phase 5: Gaining Access
- Use found credentials to SSH/login
- Exploit discovered CVEs
- Upload reverse shells via file upload
- Chain vulnerabilities (info disclosure → credential → access)

### Phase 6: Privilege Escalation
- Activate the `privesc` skill
- `hats_linpeas()` is your best friend
- Check `sudo -l` immediately
- Look for SUID binaries and cron jobs

## Flag Locations
- **user.txt**: Usually in `/home/<username>/user.txt`
- **root.txt**: Usually in `/root/root.txt`

## CTF-Specific Tools
- `hats_steghide(file)` — check images for hidden data
- `hats_binwalk(file)` — check binaries for embedded files
- `hats_strings(file)` — extract readable text from binaries
- CyberChef (browser) — encoding/decoding chains
