/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The base macOS Seatbelt (SBPL) profile for tool execution.
 *
 * This uses a strict allowlist (deny default) but imports Apple's base system profile
 * to handle undocumented internal dependencies, sysctls, and IPC mach ports required
 * by standard tools to avoid "Abort trap: 6".
 */
export const BASE_SEATBELT_PROFILE = `(version 1)
(deny default)

(import "system.sb")

; Core execution requirements
(allow process-exec)
(allow process-fork)
(allow signal (target same-sandbox))
(allow process-info* (target same-sandbox))

; Allow basic read access to system frameworks and libraries required to run
(allow file-read*
  (subpath "/System")
  (subpath "/usr/lib")
  (subpath "/usr/share")
  (subpath "/usr/bin")
  (subpath "/bin")
  (subpath "/sbin")
  (subpath "/usr/local/bin")
  (subpath "/opt/homebrew")
  (subpath "/Library")
  (subpath "/private/var/run")
  (subpath "/private/var/db")
  (subpath "/private/etc")
)

; PTY and Terminal support
(allow pseudo-tty)
(allow file-read* file-write* file-ioctl (literal "/dev/ptmx"))
(allow file-read* file-write* file-ioctl (regex #"^/dev/ttys[0-9]+"))

; Allow read/write access to temporary directories and common device nodes
(allow file-read* file-write*
  (literal "/dev/null")
  (literal "/dev/zero")
  (subpath "/tmp")
  (subpath "/private/tmp")
  (subpath (param "TMPDIR"))
)

; Workspace access using parameterized paths
(allow file-read* file-write*
  (subpath (param "WORKSPACE"))
)
`;

/**
 * The network-specific macOS Seatbelt (SBPL) profile rules.
 *
 * These rules are appended to the base profile when network access is enabled,
 * allowing standard socket creation, DNS resolution, and TLS certificate validation.
 */
export const NETWORK_SEATBELT_PROFILE = `
; Network Access
(allow network*)

(allow system-socket
  (require-all
    (socket-domain AF_SYSTEM)
    (socket-protocol 2)
  )
)

(allow mach-lookup
    (global-name "com.apple.bsd.dirhelper")
    (global-name "com.apple.system.opendirectoryd.membership")
    (global-name "com.apple.SecurityServer")
    (global-name "com.apple.networkd")
    (global-name "com.apple.ocspd")
    (global-name "com.apple.trustd.agent")
    (global-name "com.apple.mDNSResponder")
    (global-name "com.apple.mDNSResponderHelper")
    (global-name "com.apple.SystemConfiguration.DNSConfiguration")
    (global-name "com.apple.SystemConfiguration.configd")
)

(allow sysctl-read
  (sysctl-name-regex #"^net.routetable")
)
`;
