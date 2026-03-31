# Gemini CLI Memory & Performance Diagnostic Skills

A suite of Gemini CLI skills for Node.js memory analysis, CPU profiling,
and performance diagnostics — directly in your terminal.

## Skills Included

| Skill | Description |
|---|---|
| `memory-analyzer` | Master skill: heap analysis, leak detection, root cause |
| `three-snapshot-technique` | Automated 3-snapshot leak detection |
| `cpu-profiler` | CPU profiling and hotspot analysis |
| `perfetto-exporter` | Export to Perfetto format for ui.perfetto.dev |

## Quick Setup

### 1. Copy skills to your Gemini CLI workspace

**For use in a specific project:**
```powershell
# Windows
xcopy /E /I gemini-memory-skills D:\your-project\.gemini\skills\memory-diagnostics

# macOS/Linux
cp -r gemini-memory-skills/* /your-project/.gemini/skills/
```

**For global use across all projects:**
```powershell
# Windows
xcopy /E /I gemini-memory-skills "$env:USERPROFILE\.gemini\skills\memory-diagnostics"

# macOS/Linux
cp -r gemini-memory-skills/* ~/.gemini/skills/
```

### 2. Install the `ws` dependency (required for CDP)
```bash
npm install ws
```

### 3. Verify skills are loaded
Start Gemini CLI and run:
```
/skills
```
You should see `memory-analyzer`, `three-snapshot-technique`, `cpu-profiler`,
and `perfetto-exporter` listed.

## Usage Examples

Once installed, just talk to Gemini CLI naturally:

```
> Analyze this heap snapshot: ./heap-A.heapsnapshot

> My Node.js server has a memory leak. Can you help me find it?

> Profile the CPU usage of npm run build for 30 seconds

> Export my heap snapshot to Perfetto format
```

Gemini will automatically activate the right skill.

## Manual Script Usage

You can also run the scripts directly:

### Capture a heap snapshot
```bash
# From a running process on port 9229
node .gemini/skills/memory-analyzer/scripts/capture_snapshot.js --port 9229

# Launch and capture from a script
node .gemini/skills/memory-analyzer/scripts/capture_snapshot.js --script src/app.js
```

### Analyze a snapshot
```bash
node .gemini/skills/memory-analyzer/scripts/analyze_snapshot.js heap.heapsnapshot

# Diff two snapshots
node .gemini/skills/memory-analyzer/scripts/analyze_snapshot.js snap-A.heapsnapshot snap-B.heapsnapshot

# 3-snapshot diff
node .gemini/skills/memory-analyzer/scripts/analyze_snapshot.js snap-A.heapsnapshot snap-B.heapsnapshot snap-C.heapsnapshot
```

### Run the 3-snapshot technique
```bash
node .gemini/skills/memory-analyzer/scripts/three_snapshot.js \
  --port 9229 \
  --interval 5000 \
  --output ./snapshots
```

### Profile CPU
```bash
node .gemini/skills/memory-analyzer/scripts/cpu_profiler.js \
  --port 9229 \
  --duration 15000
```

### Export to Perfetto
```bash
node .gemini/skills/memory-analyzer/scripts/perfetto_export.js \
  --heap heap.heapsnapshot \
  --cpu profile.cpuprofile
```

## Diagnosing Gemini CLI's Own Memory Issues

This skill suite was built partly to diagnose the OOM errors seen during
`npm run build`. Here's how to use it:

```bash
cd D:\gemini-cli

# 1. Start the build with inspector enabled
$env:NODE_OPTIONS="--inspect=9229 --max-old-space-size=4096"
npm run build &

# 2. While it runs, profile CPU (in another terminal)
node .gemini/skills/memory-analyzer/scripts/cpu_profiler.js \
  --port 9229 \
  --duration 60000 \
  --output ./build-diagnostics

# 3. Capture heap snapshots during the build
node .gemini/skills/memory-analyzer/scripts/capture_snapshot.js \
  --port 9229 \
  --label "mid-build"
```

## File Structure

```
gemini-memory-skills/
├── memory-analyzer/
│   ├── SKILL.md                    ← Master skill instructions
│   └── scripts/
│       ├── capture_snapshot.js     ← Capture heap snapshot via CDP
│       ├── analyze_snapshot.js     ← Analyze & diff .heapsnapshot files
│       ├── three_snapshot.js       ← Automated 3-snapshot technique
│       ├── cpu_profiler.js         ← CPU profiling via CDP
│       └── perfetto_export.js      ← Export to Perfetto format
├── three-snapshot-technique/
│   └── SKILL.md
├── cpu-profiler/
│   └── SKILL.md
└── perfetto-exporter/
    └── SKILL.md
```

## Requirements

- Node.js 18+
- `ws` npm package (`npm install ws`)
- For heap capture: target process running with `--inspect`
- For Perfetto viewing: browser access to https://ui.perfetto.dev

## Contributing

This skill suite is designed as a contribution to the Gemini CLI project.
The scripts follow the CLI-first philosophy: no GUI dependencies, scriptable,
composable, and directly usable from the terminal or via Gemini CLI's
`run_shell_command` tool.
