# PM Agent — AI-powered Product Management for OSS

A [Gemini CLI](https://github.com/google-gemini/gemini-cli) Extension that
provides AI-powered Product Management capabilities for any GitHub repository.
It analyzes existing project artifacts (Issues, PRs, commits) and surfaces
structured PM insights — no dedicated PM, no new tooling, no core modifications
required.

This is an ecosystem extension contribution built entirely on the Gemini CLI
extension platform (MCP server + Skills + custom commands). It is the MVP
implementation of
[Issue #20503](https://github.com/google-gemini/gemini-cli/issues/20503).

## What it does

| Command          | Description                                                          |
| ---------------- | -------------------------------------------------------------------- |
| `/pm:analyze`    | Full PM analysis: SWOT, top user pain points, RICE-scored priorities |
| `/pm:health`     | Project health scorecard: velocity trends, open counts, risk flags   |
| `/pm:roadmap`    | Generate a Now/Next/Later roadmap from issue and commit activity     |
| `/pm:prioritize` | Prioritize open issues using RICE scoring + MoSCoW classification    |

## Requirements

- [Gemini CLI](https://github.com/google-gemini/gemini-cli)
- [GitHub CLI (`gh`)](https://cli.github.com/) on PATH, authenticated
  (`gh auth login`)
- Node.js 18+

## Installation

```bash
# From the gemini-cli repository root (or a local clone of this extension)
gemini extensions link /path/to/extensions/pm-agent
```

The MCP server dependencies are installed automatically on first link. If you
need to install them manually:

```bash
cd /path/to/extensions/pm-agent
npm install
```

## How it works

The extension has three layers:

### 1. MCP Tools (`mcp-server/server.js`)

A Node.js MCP server that fetches raw GitHub data and returns structured JSON.
All tools require explicit `owner` and `repo` parameters; the local working
directory is never inspected.

| Tool                      | What it fetches                                             | Returns                                               |
| ------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| `analyze_project_issues`  | Issues via `gh issue list`                                  | Categorized issue groups with reaction/comment counts |
| `analyze_commit_velocity` | Commits via GitHub Commits API                              | Per-period commit counts and velocity trend           |
| `check_project_health`    | Issues + PRs via GitHub Search API; commits via Commits API | Aggregated health metrics with risk flags             |

### 2. Skills (`skills/`)

Markdown files that specialize the LLM's behavior for PM workflows. Gemini
activates a skill automatically when the user's request matches the skill
description.

| Skill                   | Activates when...                                                                |
| ----------------------- | -------------------------------------------------------------------------------- |
| `requirements-analyzer` | User asks to analyze requirements, extract user stories, or "what do users want" |
| `roadmap-generator`     | User asks to create/update a roadmap or "what should we build next"              |
| `backlog-prioritizer`   | User asks to prioritize, rank features, or "what's most important"               |

### 3. Custom Commands (`commands/pm/`)

TOML files that define slash commands. Each command collects data via `!{shell}`
expressions and passes it to the LLM with a structured prompt.

## Security model

- **No shell injection**: All `gh` calls use `execFile` with explicit argv
  arrays. User inputs (`owner`, `repo`, etc.) are validated against strict regex
  patterns before use.
- **No shell string concatenation**: Command arguments are never built by string
  interpolation; they are passed as separate array elements.
- **Local git never used**: Commit and contributor data is fetched from the
  GitHub API, not from the local extension directory.

## Assumptions and limitations

- **`gh` must be authenticated** with read access to the target repository.
- **Commit velocity analysis** fetches up to `months × 100` commits per
  paginated request. Very active repositories (>100 commits/period) will still
  report correct totals thanks to pagination, but may be slower.
- **Active contributor count** is an approximation: it reports the unique author
  count within the largest single API page. Cross-page deduplication is not
  performed.
- **Label categorization** uses normalized regex matching that handles common
  conventions (`kind/`, `type:`, `area/`, hyphen/underscore variants). Unusual
  label taxonomies may result in more issues landing in the `other` category.
- **Search API rate limits**: `check_project_health` makes four GitHub Search
  API calls. At GitHub's default rate of 10 search requests/minute for
  authenticated users, back-to-back runs may hit rate limits.
- **GitHub Search API includes PRs in issue counts**: `open_issues_count` on the
  repo object includes both issues and PRs. This extension uses separate search
  queries to separate them accurately.

## MCP tool reference

### `analyze_project_issues`

```
owner        string   Repository owner
repo         string   Repository name
limit        integer  Issues to fetch (1–500, default 50)
labels       string   Comma-separated label filter (optional)
state        enum     open | closed | all (default: open)
```

Returns a categorized breakdown of issues. Categories: `featureRequests`,
`bugs`, `uxFeedback`, `techDebt`, `documentation`, `other`. Each issue includes
`number`, `title`, `author`, `reactionCount`, `commentCount`, `labels`.

### `analyze_commit_velocity`

```
owner        string   Repository owner
repo         string   Repository name
months       integer  30-day periods to analyze (1–12, default 3)
```

Returns per-period commit counts and a trend indicator (`accelerating` /
`stable` / `decelerating`).

### `check_project_health`

```
owner        string   Repository owner
repo         string   Repository name
```

Returns open issue count, closed-last-30-days count, open PR count,
merged-last-30-days count, commit velocity (this month vs last month), active
contributor count, and a list of risk flags. Any metrics that could not be
fetched appear as `null` with an explanation in `dataErrors`.

## PM frameworks

Skills apply established frameworks to project data:

- **RICE** (Reach × Impact × Confidence / Effort) — quantitative issue
  prioritization
- **MoSCoW** (Must / Should / Could / Won't) — categorical classification
- **SWOT** (Strengths / Weaknesses / Opportunities / Threats) — strategic
  project analysis

Reference files are in `references/frameworks/`.

## Running tests

```bash
node --test extensions/pm-agent/mcp-server/server.test.js
```

## Architecture

```
pm-agent/
├── gemini-extension.json          # Extension manifest
├── GEMINI.md                      # PM context injected into Gemini sessions
├── package.json                   # MCP server dependencies
├── mcp-server/
│   ├── server.js                  # MCP server (3 tools, no build step)
│   └── server.test.js             # Unit tests (node:test)
├── skills/
│   ├── requirements-analyzer/     # Requirements extraction workflow
│   ├── roadmap-generator/         # Roadmap generation workflow
│   └── backlog-prioritizer/       # RICE/MoSCoW prioritization workflow
├── commands/pm/
│   ├── analyze.toml               # /pm:analyze
│   ├── health.toml                # /pm:health
│   ├── roadmap.toml               # /pm:roadmap
│   └── prioritize.toml            # /pm:prioritize
└── references/frameworks/
    ├── swot.md
    ├── moscow.md
    └── rice-scoring.md
```

## Related

- [Gemini CLI Extension docs](https://github.com/google-gemini/gemini-cli/tree/main/packages/cli/src/commands/extensions/examples)
- [Issue #20503](https://github.com/google-gemini/gemini-cli/issues/20503) —
  Original proposal

## License

Apache-2.0
