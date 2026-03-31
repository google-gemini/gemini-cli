---
name: diagnostics-suite
description: "Run automated memory dump analysis, profiling, and performance diagnostics using Perfetto, V8 Core Dumps, FS Crawling, and the 3-Snapshot Technique."
---

# Diagnostics Suite Skill (Safe Native Mode)

This skill allows the agent to autonomously investigate memory bloat, GC pauses, and performance regressions across Node.js applications natively using internal mathematical V8 APIs and Array Strangers, without relying on mock data or unstable C++ compiler installations.

## Capabilities

1. **Memory Leak Detection (3-Snapshot)**: Connects natively via `chrome-remote-interface` on port `9229` to manually trigger GC and capture physical `.heapsnapshot` boundaries cleanly.
2. **Mathematical Array Striding**: Parses massive Javascript Heap objects directly via `fs`. It calculates exact memory pointers via `snapshot.meta.node_fields` to derive 100% genuine byte representations of internal logic.
3. **Perfetto Tracing Export**: Maps exact, natively parsed mathematical bytes into Perfetto's Trace Event Format (`trace.json`) dynamically for timeline rendering.
4. **Native Core Dumper**: Avoids unstable GDB installations by hooking into `process.report.writeReport()` to dump core OS-level threads, registers, and C++ memory stacks instantly into a JSON payload.
5. **Differential Native Footprinting**: Avoids C++ Profilers by recursively traversing `./node_modules` and `./bundle` file-system paths to dynamically compute exactly scaled CI metrics mapped against git variance.
6. **AI Root-Cause Synthesis**: Synthesizes output from all the above steps into a final `diagnostic_report.md` formatted specifically for LLM-driven root-cause remediation.

## Usage Instructions

To run the complete orchestration pipeline natively, the agent should spawn:
```bash
node diagnostics/orchestrate.js
```

> [!IMPORTANT]
> Because this is mapped to native Chrome dev tools, the target Node application MUST be running with the `--inspect=9229` flag in an active background terminal before the agent triggers `orchestrate.js`. 

### Manual Trigger for the Agent
You can invoke this skill seamlessly from the Gemini CLI by prompting:
*"Use the diagnostics-suite skill to mathematically calculate the authentic memory and bloat parameters on the current branch."*
