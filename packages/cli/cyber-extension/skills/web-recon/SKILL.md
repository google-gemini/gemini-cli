---
name: web-recon
description: Web application security assessment using HATS web scanning tools (gobuster, nikto, ffuf, nuclei, whatweb).
---

# Web Application Recon Skill

## Prerequisites
- Target must be a URL (http:// or https://)
- Run `hats_check_tools` to verify web tools are installed

## Methodology

### 1. Technology Fingerprinting
Run `hats_whatweb(url)` to identify:
- Web server (Apache, Nginx, IIS)
- Programming language (PHP, Python, Java, Node.js)
- Framework (WordPress, Django, Spring, Express)
- CMS and version numbers
- JavaScript libraries

### 2. Directory & Path Enumeration
Run in parallel:
- `hats_gobuster(url, wordlist="/usr/share/wordlists/dirb/common.txt")`
- `hats_ffuf(url + "/FUZZ", wordlist="/usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt")`

Look for:
- Admin panels (/admin, /wp-admin, /administrator)
- API endpoints (/api, /v1, /graphql)
- Backup files (.bak, .old, .swp, ~)
- Configuration files (.env, config.php, web.config)
- Git exposure (/.git/HEAD)

### 3. Vulnerability Scanning
- `hats_nikto(url)` — server misconfigurations, dangerous files, outdated software
- `hats_nuclei(url, severity="critical,high")` — CVEs and template-based detection

### 4. Common Web Vulnerability Checklist

Check for these manually or guide the user:

| Vulnerability | Test Method | HATS Tool |
|---|---|---|
| SQL Injection | `hats_sqlmap(url_with_params)` | sqlmap |
| XSS | Manual payloads in parameters | Manual |
| LFI/RFI | Path traversal in file parameters | Manual |
| SSRF | Internal URL in URL parameters | Manual |
| IDOR | Increment/change ID values | Manual |
| File Upload | Upload test files | Manual |
| Authentication Bypass | Default creds, brute force | hydra |
| Information Disclosure | Error pages, headers, comments | nikto/whatweb |

### 5. CMS-Specific Testing

- **WordPress**: Check for `/wp-login.php`, enumerate users via `/?author=1`, check plugin versions
- **Joomla**: Check `/administrator`, enumerate components
- **Drupal**: Check `/CHANGELOG.txt` for version, `/user/login`

### 6. Output

Generate a web assessment table:
```
## Web Assessment — <url>

### Technology Stack
| Component | Value |

### Discovered Paths
| Path | Status | Type |

### Vulnerabilities
| Finding | Severity | Evidence | Remediation |
```
