---
name: reporting
description: Generate professional penetration testing reports aligned with PTES/OWASP standards.
---

# Pentest Report Writing Skill

## Report Structure (PTES-aligned)

### 1. Executive Summary
- **Audience**: C-level, non-technical stakeholders
- **Content**: Overall risk level, critical findings count, business impact
- **Length**: 1 page maximum
- **Tone**: Business impact focused, no technical jargon

### 2. Scope & Authorization
- Target systems/networks tested
- Testing dates and duration
- Authorization documentation reference
- Out-of-scope exclusions

### 3. Methodology
- PTES / OWASP Testing Guide reference
- Tools used (list HATS tools and manual techniques)
- Testing approach (black-box, gray-box, white-box)

### 4. Findings Summary Table
```
| # | Finding | Severity | CVSS | Status | Affected Asset |
|---|---------|----------|------|--------|----------------|
| 1 | ... | Critical | 9.8 | Open | 10.10.10.5:443 |
```

### 5. Detailed Findings
For each finding use this template:

```
### F-<number>: <Finding Title>

**Severity**: Critical / High / Medium / Low / Informational
**CVSS 3.1 Score**: X.X (Vector: AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H)
**Affected Asset**: IP:Port or URL
**CWE**: CWE-XXX
**CVE**: CVE-YYYY-XXXX (if applicable)

#### Description
What the vulnerability is and why it matters.

#### Impact
What an attacker could do if this vulnerability is exploited.

#### Proof of Concept
- Command executed:
  ```
  <command>
  ```
- Output:
  ```
  <output>
  ```

#### Remediation
Specific, actionable steps to fix this vulnerability.
- **Immediate**: Quick mitigation
- **Long-term**: Proper fix

#### References
- CVE link
- Vendor advisory
- OWASP reference
```

### 6. Remediation Priority Matrix
```
| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| P1 — Fix Now | ... | Low | Critical |
```

### 7. Appendix
- Full scan outputs (reference filenames)
- Tool versions used
- Testing timeline

## Severity Classification (CVSS 3.1)
| Score | Rating | Color |
|---|---|---|
| 9.0–10.0 | Critical | 🔴 |
| 7.0–8.9 | High | 🟠 |
| 4.0–6.9 | Medium | 🟡 |
| 0.1–3.9 | Low | 🟢 |
| 0.0 | Informational | 🔵 |
