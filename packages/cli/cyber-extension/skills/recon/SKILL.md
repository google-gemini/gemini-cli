---
name: recon
description: Active reconnaissance playbook for authorized targets using the HATS MCP tools and Kali Linux ecosystem.
---

# Reconnaissance Skill — Full Playbook

You are executing an authorized reconnaissance engagement. Follow this structured methodology.

## Step 1: Target Classification

Identify what was provided:
- **IP address** (e.g., 10.10.10.5) → direct host scan
- **CIDR range** (e.g., 192.168.1.0/24) → network sweep first
- **Domain** (e.g., target.com) → DNS recon + web recon
- **URL** (e.g., http://target.com/app) → web-specific path

## Step 2: Tool Availability Check

Run `hats_check_tools` first. If critical tools are missing, inform the user and suggest the install command.

## Step 3: Passive Reconnaissance

Before touching the target:
1. Use Google Search grounding to look up the target organization, technology stack, known breaches
2. If a domain is provided, run `hats_dnsrecon` for zone transfer attempts, subdomain enumeration, MX/NS records
3. Note all discovered subdomains and IPs for in-scope targeting

## Step 4: Active Port Scanning

Use a two-phase approach:
1. **Fast sweep**: `hats_masscan(target, ports="1-65535", rate="1000")` — finds all open ports in seconds
2. **Targeted deep scan**: `hats_nmap_scan(target, ports="<discovered_ports>", flags="-sV -sC -O")` — service versions, scripts, OS detection

If masscan is unavailable, use `hats_nmap_scan(target, ports="1-10000")` directly.

## Step 5: Service-Specific Enumeration

Based on discovered ports, branch into specialized enumeration:

### Web Ports (80, 443, 8080, 8443, 3000, 5000, 8000, 8888)
- Run `hats_whatweb` for technology fingerprinting
- Activate the `web-recon` skill for deep web assessment

### SMB/AD Ports (139, 445)
- Run `hats_enum4linux` for user/share/group enumeration
- Run `hats_smbclient` for null session share listing
- Run `hats_smbmap` for permission mapping

### SSH (22)
- Note version for searchsploit lookup
- Check for password authentication vs key-only

### FTP (21)
- Check for anonymous login
- Note version for known vulnerabilities

### DNS (53)
- Attempt zone transfer with `hats_dnsrecon(domain, record_type="axfr")`

### Database Ports (3306, 5432, 1433, 27017)
- Note service version
- Check for default credentials

### Other Services
- Run `hats_netcat_banner(target, port)` for banner grabbing
- Run `hats_searchsploit(service_version)` for exploit lookup

## Step 6: Exploit Research

For every discovered service+version:
1. Run `hats_searchsploit("<service> <version>")` 
2. Cross-reference with nuclei findings if web services present
3. Prioritize by severity: Critical → High → Medium → Low

## Step 7: Output Format

Create a structured recon summary:

```
## Recon Summary — <target>

### Host Discovery
| IP | OS | Ports Open | Key Services |

### Service Details
| Port | Service | Version | Notes |

### Vulnerability Leads
| Service | CVE/Exploit | Severity | Source |

### Recommended Next Steps
1. ...
2. ...
```

## Decision Tree Reference

```
Target provided
├── Is it a domain?
│   ├── YES → DNS recon → resolve IPs → scan IPs
│   └── NO → direct IP scan
├── Port 80/443/8080 open?
│   └── YES → activate web-recon skill
├── Port 445/139 open?
│   └── YES → SMB/AD enumeration chain
├── Port 22 open + password auth?
│   └── YES → note for potential hydra (with authorization)
├── Port 21 open?
│   └── YES → check anonymous FTP
└── For ALL discovered services
    └── searchsploit version lookup
```
