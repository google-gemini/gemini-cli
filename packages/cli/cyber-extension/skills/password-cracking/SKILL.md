---
name: password-cracking
description: Hash identification and password cracking workflow using john, hashcat, and hydra.
---

# Password Cracking Skill

## Step 1: Identify the Hash

Run `hats_hashid("<hash_string>")` to determine the hash type.

Common hash formats:
| Pattern | Likely Type | Hashcat Mode | John Format |
|---|---|---|---|
| 32 hex chars | MD5 | 0 | raw-md5 |
| 40 hex chars | SHA1 | 100 | raw-sha1 |
| 64 hex chars | SHA256 | 1400 | raw-sha256 |
| 128 hex chars | SHA512 | 1700 | raw-sha512 |
| `$1$...` | md5crypt | 500 | md5crypt |
| `$5$...` | sha256crypt | 7400 | sha256crypt |
| `$6$...` | sha512crypt | 1800 | sha512crypt |
| `$2a$`/`$2b$` | bcrypt | 3200 | bcrypt |
| 32 hex (NTLM) | NTLM | 1000 | nt |
| `$krb5tgs$` | Kerberoast | 13100 | krb5tgs |

## Step 2: Choose Attack Strategy

### Wordlist Attack (try first)
- `hats_john(hash_file, wordlist="/usr/share/wordlists/rockyou.txt")`
- `hats_hashcat(hash_file, mode="<mode>", wordlist="/usr/share/wordlists/rockyou.txt")`

### Wordlist Selection Guide
| Wordlist | Size | Use Case |
|---|---|---|
| `/usr/share/wordlists/rockyou.txt` | 14M | General passwords |
| `/usr/share/wordlists/dirb/common.txt` | 4.6K | Quick test |
| `/usr/share/seclists/Passwords/` | Various | Specialized lists |
| Custom (via `cewl`) | Variable | Target-specific words |

### Rule-Based Attack (if wordlist fails)
John: `--rules=best64` or `--rules=all`
Hashcat: `-r /usr/share/hashcat/rules/best64.rule`

### Online Brute Force
`hats_hydra(target, service, username, password_list, threads="4")`
- Keep threads LOW (1-4) to avoid lockouts
- Monitor for account lockout policies
- Try common credentials first (admin:admin, admin:password)

## Step 3: Results

Document cracked credentials:
```
### Cracked Credentials
| Hash | Plaintext | Hash Type | Source |
```

**IMPORTANT**: Never use cracked credentials to access systems beyond the authorized scope.
