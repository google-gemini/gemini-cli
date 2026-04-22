<p align="center">
  <img src="docs/images/gemini-cyber-banner.png" alt="Gemini-Cyber-CLI" width="600">
</p>

<h1 align="center">Gemini-Cyber-CLI</h1>

<p align="center">
  <b>The AI-Powered Ethical Hacking Agent for Kali Linux</b>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#commands">Commands</a> •
  <a href="#skills">Skills</a> •
  <a href="#hats-framework">HATS Framework</a> •
  <a href="#architecture">Architecture</a>
</p>

---

Gemini-Cyber-CLI is a fork of
[Google's Gemini CLI](https://github.com/google-gemini/gemini-cli),
purpose-built for **authorized ethical hacking and penetration testing**. It
brings the power of Gemini AI directly into your Kali Linux terminal as an
autonomous pentest agent — capable of running reconnaissance, identifying
vulnerabilities, chaining tools, and generating professional reports.

## ✨ Features

### 🤖 AI-Powered Pentest Agent

- **Autonomous workflow execution** — describe what you want, and the agent
  chains tools intelligently
- **32 MCP tool endpoints** covering the full Kali Linux pentest lifecycle
- **Smart chains** that orchestrate multi-tool workflows automatically
- **Structured JSON output** — the agent reasons about parsed findings, not raw
  terminal noise

### 🛡️ HATS MCP Bridge

The **HATS (Hacking Automation Tool Suite)** framework is integrated via the
Model Context Protocol (MCP), giving Gemini programmatic access to 50+ Kali
Linux tools with structured, parsed JSON output.

### 🎯 7 Agent Skills

Context-loaded playbooks that teach the AI how to think through each phase of a
penetration test:

| Skill               | Phase             | Description                                                 |
| ------------------- | ----------------- | ----------------------------------------------------------- |
| `recon`             | Reconnaissance    | Full target enumeration with decision trees                 |
| `web-recon`         | Web Testing       | Technology fingerprinting, path enumeration, vuln checklist |
| `exploit`           | Exploitation      | Safe vulnerability verification with evidence collection    |
| `password-cracking` | Credentials       | Hash identification and cracking methodology                |
| `privesc`           | Post-Exploitation | Linux & Windows privilege escalation checklists             |
| `reporting`         | Documentation     | PTES-aligned professional pentest reports                   |
| `ctf`               | Practice          | CTF/HackTheBox-specific methodology                         |

### ⚡ Quick Commands

One-line slash commands for common workflows:

```
/cyber/scan <target>       Full reconnaissance chain
/cyber/enumerate <target>  All ports + service detection
/cyber/web-scan <url>      Web application assessment
/cyber/ad-enum <target>    Active Directory enumeration
/cyber/privesc             Linux privilege escalation check
/cyber/crack <hash>        Hash ID and cracking
/cyber/ctf <target>        CTF/HackTheBox workflow
/cyber/report              Generate pentest report
```

### 🎨 Hacker Green Theme

A built-in "Cyber" theme with Matrix-style green-on-black aesthetics, matching
the hacker terminal experience.

---

## 🔧 Installation

### Prerequisites

- **Node.js** ≥ 20.0.0
- **Python** ≥ 3.9
- **Kali Linux** (native, WSL, or distrobox container)
- A **Gemini API key** or Google Cloud project

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/YourUser/gemini-cyber-cli.git
cd gemini-cyber-cli

# 2. Install Node dependencies
npm install

# 3. Install HATS framework
pip install -e ./hats-repo

# 4. Install MCP dependency
pip install fastmcp

# 5. Build the project
npm run build:all

# 6. Set your API key
export GEMINI_API_KEY="your-api-key-here"

# 7. Launch
./packages/cli/bin/gemini-cyber
```

### Using with Distrobox (Kali on any Linux)

If you run Kali via distrobox:

```bash
# Enter your Kali container
distrobox enter --root kalibox

# Install Kali tools you need
sudo apt install -y nmap masscan gobuster nikto sqlmap hydra john hashcat \
  nuclei whatweb dnsrecon enum4linux smbclient smbmap searchsploit binwalk

# Run gemini-cyber inside the container
cd /path/to/gemini-cyber-cli
./packages/cli/bin/gemini-cyber
```

---

## 🚀 Quick Start

### 1. Check Your Arsenal

```
> Check what tools I have available

The agent runs hats_check_tools and reports installed/missing Kali tools.
```

### 2. Reconnaissance

```
> /cyber/scan scanme.nmap.org

The agent runs a full recon chain: nmap → whatweb → dnsrecon → searchsploit
```

### 3. Web Application Assessment

```
> /cyber/web-scan http://testphp.vulnweb.com

The agent runs: whatweb → gobuster → nikto → nuclei
```

### 4. CTF Mode

```
> /cyber/ctf 10.10.10.5

The agent follows CTF methodology: enumerate → exploit → privesc → flags
```

### 5. Generate a Report

```
> /cyber/report

The agent generates a PTES-aligned markdown pentest report with all findings.
```

---

## 🛠️ Commands

### Cyber Commands

| Command                     | Description                                                    |
| --------------------------- | -------------------------------------------------------------- |
| `/cyber/scan <target>`      | Full reconnaissance chain (nmap → whatweb → searchsploit)      |
| `/cyber/enumerate <target>` | Deep port scan + service/OS detection on all 65535 ports       |
| `/cyber/web-scan <url>`     | Web app assessment (whatweb → gobuster → nikto → nuclei)       |
| `/cyber/ad-enum <target>`   | Active Directory enumeration (enum4linux → smbclient → smbmap) |
| `/cyber/privesc`            | Linux privilege escalation check (linpeas + manual checks)     |
| `/cyber/crack <hash>`       | Hash identification + cracking (hashid → john/hashcat)         |
| `/cyber/ctf <target>`       | Full CTF/HackTheBox workflow                                   |
| `/cyber/report`             | Generate professional pentest report                           |

### Standard CLI Commands

All standard Gemini CLI commands are also available: `/help`, `/about`,
`/model`, `/theme`, `/settings`, `/tools`, etc.

---

## 🧠 Skills

Skills are context-loaded playbooks that activate when the agent enters a
specific pentest phase. They provide structured methodology, decision trees, and
tool-specific guidance.

### Activating Skills

Skills activate automatically based on context, or you can trigger them:

```
> Activate the recon skill and enumerate 10.10.10.5
> Use the ctf skill to hack this box
> Activate the reporting skill and generate a report
```

### Available Skills

- **`recon`** — 6-step reconnaissance methodology with port-based decision trees
- **`web-recon`** — CMS detection, directory brute-force, OWASP Top 10 checklist
- **`exploit`** — SQL injection, brute force, CVE exploitation with safety rules
- **`password-cracking`** — Hash type identification table, wordlist selection,
  attack strategies
- **`privesc`** — SUID, sudo, cron, kernel, capabilities, Docker breakout
  checklists
- **`reporting`** — PTES report template with CVSS 3.1 scoring and remediation
  guidance
- **`ctf`** — Common CTF patterns by port/service, flag location reference

---

## 🔗 HATS Framework

HATS (Hacking Automation Tool Suite) is the Python framework that bridges Kali
Linux tools to the AI agent via MCP. It provides:

- **One-function-per-tool** API: `hats.nmap(target)`, `hats.gobuster(url)`, etc.
- **Structured JSON output** — parsed ports, services, vulnerabilities, not raw
  text
- **Secure subprocess execution** — argument sanitization, timeouts, safe
  defaults
- **YAML-driven tool definitions** — add new tools without code changes

### MCP Tool Endpoints

| Category              | Tools                                                                                |
| --------------------- | ------------------------------------------------------------------------------------ |
| **Health Check**      | `hats_check_tools`                                                                   |
| **Recon / Scanning**  | `hats_nmap_scan`, `hats_masscan`, `hats_whatweb`, `hats_dnsrecon`, `hats_enum4linux` |
| **Web App Testing**   | `hats_gobuster`, `hats_nikto`, `hats_ffuf`, `hats_nuclei`                            |
| **Exploitation**      | `hats_sqlmap`, `hats_hydra`, `hats_searchsploit`, `hats_msfvenom`                    |
| **Password Cracking** | `hats_john`, `hats_hashcat`, `hats_hashid`                                           |
| **Post-Exploitation** | `hats_smbclient`, `hats_smbmap`, `hats_linpeas`                                      |
| **Network Analysis**  | `hats_tcpdump`, `hats_netcat_banner`                                                 |
| **Forensics**         | `hats_binwalk`, `hats_strings`, `hats_steghide`                                      |
| **Smart Chains**      | `hats_full_recon_chain`, `hats_web_recon_chain`, `hats_ad_recon_chain`               |

### Smart Chains

Smart chains orchestrate multi-tool workflows in a single call:

- **`hats_full_recon_chain(target)`** → nmap → whatweb → dnsrecon → consolidated
  findings
- **`hats_web_recon_chain(url)`** → whatweb → gobuster → nikto → nuclei → web
  vuln report
- **`hats_ad_recon_chain(target)`** → enum4linux → smbclient → smbmap → AD
  enumeration

---

## 🏗️ Architecture

```
gemini-cyber-cli/
├── packages/
│   ├── cli/                    # Terminal UI (Ink/React)
│   │   ├── cyber-extension/    # Cyber-specific configuration
│   │   │   ├── GEMINI.md       # Agent persona & mission
│   │   │   ├── gemini-extension.json  # MCP server & theme config
│   │   │   ├── hats_mcp_server.py     # 32-tool MCP bridge
│   │   │   └── skills/        # 7 agent playbooks
│   │   │       ├── recon/
│   │   │       ├── web-recon/
│   │   │       ├── exploit/
│   │   │       ├── password-cracking/
│   │   │       ├── privesc/
│   │   │       ├── reporting/
│   │   │       └── ctf/
│   │   └── src/ui/            # UI components (cyber-branded)
│   └── core/                  # Gemini API orchestration
├── hats-repo/                 # HATS framework (Python)
│   ├── hats/core.py           # Tool execution engine
│   └── configs/tools.yaml     # 50+ Kali tool definitions
└── .gemini/commands/cyber/    # Slash commands
    ├── scan.toml
    ├── enumerate.toml
    ├── web-scan.toml
    ├── ad-enum.toml
    ├── privesc.toml
    ├── crack.toml
    └── ctf.toml
```

### Data Flow

```
User Prompt → Gemini AI → MCP Tool Call → HATS MCP Server → HATS Python API → Kali Tool
                                                                                    ↓
User ← Gemini AI ← Structured JSON ← HATS Parser ← Raw CLI Output ←──────────────┘
```

---

## 🎨 Theme

Gemini-Cyber-CLI ships with a built-in **Cyber** theme (green-on-black hacker
aesthetic) as the default. You can switch themes with `/theme`:

- **Cyber** (default) — Matrix-style green on black
- All standard Gemini CLI themes are also available (Dracula, Tokyo Night,
  Solarized, etc.)

---

## ⚠️ Ethical Use Policy

Gemini-Cyber-CLI is designed **exclusively for authorized security testing**.
The agent:

- ✅ Performs reconnaissance on **authorized targets only**
- ✅ Stops at **proof-of-concept** — demonstrates vulnerability without causing
  damage
- ✅ Generates **remediation guidance** for every finding
- ✅ Creates **professional reports** suitable for stakeholder review
- ❌ Refuses clearly malicious, illegal, or destructive actions
- ❌ Does not exfiltrate sensitive data beyond what's needed for evidence

**Always ensure you have written authorization before testing any system.**

---

## 🤝 Contributing

This project is a fork of
[Google Gemini CLI](https://github.com/google-gemini/gemini-cli). Contributions
to the cyber-specific features are welcome:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-tool`)
3. Follow [Conventional Commits](https://www.conventionalcommits.org/)
4. Submit a pull request

### Development

```bash
npm install           # Install dependencies
npm run build         # Build all packages
npm run start         # Run in development mode
npm run test          # Run tests
npm run preflight     # Full validation (before PRs)
```

---

## 📜 License

This project is licensed under the Apache-2.0 License. See [LICENSE](LICENSE)
for details.

---

<p align="center">
  <b>Built with 🟢 by security researchers, for security researchers.</b>
</p>
