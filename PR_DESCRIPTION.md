# Pull Request: Critical Security Vulnerability Fixes

## Overview

This PR fixes 8 CRITICAL and HIGH severity vulnerabilities reported in Google VRP-440782380 that could lead to complete ecosystem compromise.

## Security Impact

**BEFORE:** Zero-interaction RCE via malicious configuration files
**AFTER:** Commands validated, dangerous operations require explicit trust

## Vulnerabilities Fixed

### CVE-PENDING-001: MCP Server Command Injection (CRITICAL - CVSS 9.8)
- **Impact:** Remote Code Execution, Complete System Compromise
- **Fix:** Command validation with dangerous command blocking
- **Details:** Blocks bash, sh, python, curl, wget by default. Requires `--trust` flag.

### CVE-PENDING-002: Environment Variable Injection (HIGH - CVSS 7.5)
- **Impact:** Code Injection, Privilege Escalation
- **Fix:** Environment variable validation and sanitization
- **Details:** Blocks LD_PRELOAD, NODE_OPTIONS, and other injection vectors

### CVE-PENDING-003: Configuration File RCE (CRITICAL - CVSS 9.8)
- **Impact:** Remote Code Execution via toolDiscoveryCommand
- **Fix:** Comprehensive configuration validation on load
- **Details:** Validates all configuration before execution

### CVE-PENDING-004: OAuth Credential Plaintext Storage (HIGH - CVSS 8.1)
- **Impact:** Credential Theft, Account Takeover
- **Fix:** AES-256-GCM encryption for stored credentials
- **Details:** PBKDF2 key derivation with authentication tags

### Additional Fixes
- CVE-PENDING-005: Configuration File Tampering (MEDIUM)
- CVE-PENDING-006: Path Traversal in File Operations (MEDIUM)
- CVE-PENDING-007: Shell Metacharacter Injection (HIGH)
- CVE-PENDING-008: Cross-Cloud Credential Exposure (HIGH)

## New Security Modules

### 1. `packages/core/src/security/command-validator.ts`
- Validates commands and arguments before execution
- Blocks dangerous command patterns
- Detects shell injection attempts
- Path traversal prevention

### 2. `packages/core/src/security/credential-encryption.ts`
- AES-256-GCM encryption for sensitive data
- Secure key management with restricted permissions
- Secure file wiping capabilities

### 3. `packages/core/src/security/config-validator.ts`
- Comprehensive MCP server configuration validation
- URL and header validation
- Configuration signing and verification
- Warning system for security issues

## Modified Files

### `packages/core/src/tools/mcp-client.ts`
- Integrated command validation before StdioClientTransport creation
- Added environment variable validation
- Clear error messages for security violations

## Breaking Changes

⚠️ **BREAKING:** Existing MCP server configurations using dangerous commands will be blocked.

**Migration Required:**

```bash
# Old (now blocked):
gemini mcp add server bash -c "node /path/server.js"

# New Option 1 (recommended):
gemini mcp add server node /path/server.js

# New Option 2 (if you trust the server):
gemini mcp add server bash -c "node /path/server.js" --trust
```

## Testing

- [x] Unit tests for command validation
- [x] Unit tests for credential encryption
- [x] Unit tests for configuration validation
- [x] Integration tests for MCP client
- [x] Manual testing of attack scenarios
- [x] Verified all attack vectors are blocked

## Attack Scenarios Tested

✅ Malicious configuration file → BLOCKED
✅ Environment variable injection → BLOCKED
✅ Shell metacharacter injection → BLOCKED
✅ Path traversal attempts → BLOCKED
✅ Configuration tampering → DETECTED

## Documentation

- [x] SECURITY_FIXES.md - Complete vulnerability documentation (442 lines)
- [x] Inline code comments explaining security decisions
- [x] Migration guide for breaking changes
- [x] User-facing error messages with remediation steps

## Security Review

This PR has been:
- [x] Reviewed for security implications
- [x] Tested against all reported attack vectors
- [x] Validated for defense-in-depth architecture
- [x] Documented for future security audits

## VRP Information

**Google VRP Report:** #440782380
**Reporter:** David Amber "WebDUH LLC" Weatherspoon
**Status:** Accepted (P0/S0 Critical)
**Date Reported:** August 23, 2025
**Date Fixed:** November 10, 2025

## Coordinated Disclosure

This fix is being disclosed as part of Google's coordinated vulnerability disclosure policy. Public disclosure is planned for 90 days after vendor notification (approximately February 8, 2026).

## Reviewer Checklist

- [ ] Security implications reviewed
- [ ] Breaking changes documented
- [ ] Migration path provided for users
- [ ] Tests pass
- [ ] Documentation complete
- [ ] CVE numbers assigned (if applicable)

---

**Discovered and Fixed By:** David Amber "WebDUH LLC" Weatherspoon
**Contact:** reconsumeralization@gmail.com
**GPG Key:** [If applicable]
