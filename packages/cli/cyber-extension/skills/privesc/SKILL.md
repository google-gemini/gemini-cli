---
name: privesc
description: Linux and Windows privilege escalation enumeration using linpeas, manual checks, and HATS tools.
---

# Privilege Escalation Skill

## Linux Privilege Escalation

### Automated Enumeration
Run `hats_linpeas()` and review output for highlighted findings (RED/YELLOW = high priority).

### Manual Checklist (in order of likelihood)

1. **SUID/SGID Binaries**
   ```bash
   find / -perm -4000 -type f 2>/dev/null
   ```
   Cross-reference with GTFOBins (https://gtfobins.github.io/)

2. **Sudo Permissions**
   ```bash
   sudo -l
   ```
   Look for NOPASSWD entries and exploitable binaries

3. **Cron Jobs**
   ```bash
   cat /etc/crontab && ls -la /etc/cron.* && crontab -l
   ```
   Look for writable scripts run as root

4. **Writable /etc/passwd**
   ```bash
   ls -la /etc/passwd
   ```
   If writable, add a root-equivalent user

5. **Kernel Exploits**
   ```bash
   uname -a && cat /etc/os-release
   ```
   Search for kernel version exploits with `hats_searchsploit("linux kernel <version>")`

6. **Credentials in Files**
   ```bash
   find / -name "*.conf" -o -name "*.cfg" -o -name "*.ini" -o -name ".env" 2>/dev/null | head -20
   grep -r "password" /etc/ /opt/ /var/ 2>/dev/null | head -20
   ```

7. **SSH Keys**
   ```bash
   find / -name "id_rsa" -o -name "authorized_keys" 2>/dev/null
   ```

8. **Capabilities**
   ```bash
   getcap -r / 2>/dev/null
   ```
   Look for cap_setuid, cap_dac_override, cap_sys_admin

9. **Docker / LXC Breakout**
   Check if user is in docker group: `id | grep docker`

10. **NFS Root Squashing**
    ```bash
    cat /etc/exports
    ```
    Look for `no_root_squash`

## Windows Privilege Escalation

### Manual Checklist

1. **Service Misconfigurations**: Unquoted service paths, writable service binaries
2. **AlwaysInstallElevated**: Check registry for MSI privilege escalation
3. **Token Impersonation**: SeImpersonatePrivilege → Potato attacks
4. **Stored Credentials**: `cmdkey /list`, registry autologon
5. **Scheduled Tasks**: Writable task scripts running as SYSTEM
6. **DLL Hijacking**: Missing DLLs in PATH directories

## Output

```
### Privilege Escalation Findings
| Vector | Details | Likelihood | Difficulty |
```
