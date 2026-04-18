---
name: recon
description: Authorized reconnaissance workflow for ethical security testing. Use for host discovery, service enumeration, and initial risk triage.
---

# Recon Skill

Use this skill for defensive reconnaissance in authorized environments.

## Rules
- Confirm target scope and authorization before running active checks.
- Prefer structured MCP outputs (HATS tools) over unstructured shell output.
- Keep scans minimally invasive first, then deepen only as needed.

## Workflow
1. Scope confirmation and assumptions.
2. Host and port discovery.
3. Service fingerprinting and version extraction.
4. Vulnerability correlation (CVE/CWE mapping).
5. Findings summary with severity, confidence, and remediation-first recommendations.

