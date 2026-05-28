---
name: virtual-machine-ops
description: Advanced guidelines for executing and validating operating systems inside emulators (like QEMU).
---

# Virtual Machine & OS Environment Validation Guidelines

When configuring, booting, or running operating systems inside emulators (such as QEMU), you must adhere to the following defensive validation rules to prevent stale-state loops and false positive verifications:

## 1. Stale State Protection (Mandatory Screen Cleanup)
Prior to executing a new framebuffer check, taking a screenshot, or taking a QEMU monitor screendump, you MUST explicitly delete or purge any pre-existing screenshot/screendump files in your workspace:
```bash
rm -f /app/screen.ppm /app/screen.png
```
*   **Why:** If QEMU crashed or connection failed, a naive script might quietly fail to write the new image and instead read a cached image from a previous turn, leading to false-positive desktop boot verifications.

## 2. Robust Verification Exit Codes
Any verification script you write (e.g. python or node socket connection monitors) MUST exit with a non-zero exit code (e.g., `sys.exit(1)`) if a socket error, QMP connection failure, timeout, or visual check failure occurs. Never catch exceptions silently and default to a success output.

## 3. Non-Grep Liveness Scanning
When scanning active background processes, do NOT use raw shell pipelines containing grep on the command itself:
```bash
# ❌ AVOID: Matches the grep command itself, yielding false positive exit code 0
ps aux | grep qemu
```
Instead, you MUST use non-grep specific check tools:
```bash
#   PREFERRED:
pgrep -x qemu-system-x86_64
pidof qemu-system-x86_64
ps aux | grep [q]emu
```

## 4. Network Configuration
Configure guest network adapters explicitly (e.g. using PCI ethernet cards like `ne2k_pci`) to bypass default OS boot-up driver warning prompts, preventing VM boots from stalling indefinitely on input dialogs.
