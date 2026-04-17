---
name: recon
description: Structured reconnaissance workflow that prioritizes HATS MCP findings for target enumeration.
---

# Recon Skill

Use this skill when the request involves discovery, mapping, or profiling a target.

## Objectives

1. Start with `hats_port_scan` to identify reachable attack surface.
2. Run `hats_service_detection` on discovered ports to fingerprint services and versions.
3. Run `hats_vulnerability_lookup` using discovered service metadata.
4. Report findings as structured evidence with severity and confidence.

## Rules

- Keep scans within authorized scope.
- Prefer structured MCP outputs over inferred assumptions.
- If outputs conflict, gather additional recon data before concluding.
