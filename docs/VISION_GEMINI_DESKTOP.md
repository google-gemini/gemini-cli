# Vision: Google Gemini Desktop (Universal)

This document outlines the roadmap for evolving the Gemini CLI core into a
cross-platform desktop application.

## Core Identity: "The Screwdriver"

The application is designed to be a "Swiss Army Knife" for developers and power
users, with an adaptive UI that morphs between consumer and technical modes.

| Component          | Technical Requirement / Logic                      | Visual / UI Behavior                                           |
| :----------------- | :------------------------------------------------- | :------------------------------------------------------------- |
| **Identity**       | Triggered by repo detection or `/dev` command.     | "The Screwdriver" icon expands 1.2x, then docks to top-left.   |
| **Dev Mode Morph** | Background color shift to `#1a2634` (Subtle Blue). | 400ms fade transition; White "Aura" glow on toggle.            |
| **Privacy**        | Zero-backend architecture; Client → Google.        | Direct API path; no "Processing" lag.                          |
| **Auth**           | OAuth 2.0 PKCE with local loopback listener.       | Opens system browser; auto-closes on success.                  |
| **OS Support**     | Win10 Bootstrap (winget check).                    | UI: "Modernizing Windows Environment..." pulse.                |
| **OS Support**     | Linux Detection (distro-specific).                 | Displays: "Detected Ubuntu 24.04 - Preparing apt."             |
| **Tooling**        | Native Git/GH via `child_process`.                 | Terminal drawer shows real-time git push logs.                 |
| **Tooling**        | GitHub MCP Integration.                            | Sidebar populates with `gemini-cli` and `gemini-desktop`.      |
| **Installer**      | Supervised Self-Healing.                           | Automatic recovery from crashes; "Fix Environment" button.     |
| **Interface**      | Terminal Drawer (native pty pipe).                 | Slides up from bottom; uses 75% gray text.                     |
| **Context**        | `GEMINI.md` Persistent Rules.                      | Remembers specific infrastructure (e.g., OVHcloud, HDD specs). |

## Implementation Strategy (Phase 1)

- **Framework:** Tauri (Rust-based) for native performance and security.
- **Engine:** `@google/gemini-cli-core` (Apache-2.0).
- **Sandbox:** Hardened Native Sandbox (Windows C# Helper / Linux `bubblewrap`).
- **Build:** Single Executable Application (SEA).

## Application Architecture: The Dual-Surface Model

The application operates in two distinct modes to serve both general consumers
and technical power users.

### 1. Standard Mode (The "Friendly" Surface)

- **Visuals:** Closely mirrors the `gemini.google.com` web interface.
- **Navigation:** Persistent left-hand sidebar for chat history and context.
- **Placement:** A prominent **"Developer Mode"** button is located in the
  sidebar, positioned immediately above the "Settings & Help" section.

### 2. Developer Mode (The "Pseudo-IDE" Surface)

- **Visuals:** Triggered by the sidebar toggle or automatic repository
  detection.
- **UI Morph:** The interface expands into a multi-pane layout (Pseudo-IDE).
- **Features:**
  - Integrated Terminal Drawer (Native PTY).
  - Visual File Explorer / Diff Viewer.
  - MCP Server Dashboard.
  - "The Screwdriver" status indicators for the Native Sandbox.

## Progress Track

- [x] Stabilized Windows Sandbox logic.
- [x] Hardened Linux `bwrap` isolation.
- [x] Implemented Native SEA build process.
- [x] Integrated supervised self-healing relauncher.
- [x] Verified 5x performance boost on 8-year-old Xeon hardware.
- [ ] Prototype Tauri GUI wrapper.
