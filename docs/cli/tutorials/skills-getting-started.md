# Get started with Agent Skills

Agent Skills extend Gemini CLI with specialized expertise. In this tutorial,
you'll learn how to create your first skill, bundle custom logic, and activate
it during a session.

## Create your first skill

A skill is defined by a directory containing a `SKILL.md` file and
subdirectories containing reference materials or scripts used by the skill.
Let's create an **API Auditor** skill that runs a script to help you verify if
local or remote endpoints are responding correctly.

### 1. Create the directory structure

The first step is to create the necessary folders for your skill and its
scripts.

**macOS/Linux**

```bash
mkdir -p .gemini/skills/api-auditor/scripts
```

**Windows (PowerShell)**

```powershell
New-Item -ItemType Directory -Force -Path ".gemini\skills\api-auditor\scripts"
```

### 2. Create the definition (`SKILL.md`)

The `SKILL.md` file defines the skill's purpose and instructions for the agent.
Create a file at `.gemini/skills/api-auditor/SKILL.md`. This tells the agent
_when_ to use the skill and _how_ to behave.

```markdown
---
name: api-auditor
description:
  Expertise in auditing and testing API endpoints. Use when the user asks to
  "check", "test", or "audit" a URL or API.
---

# API Auditor Instructions

You act as a QA engineer specialized in API reliability. When this skill is
active, you MUST:

1.  **Audit**: Use the bundled `scripts/audit.js` utility to check the status of
    the provided URL.
2.  **Report**: Analyze the output (status codes, latency) and explain any
    failures in plain English.
3.  **Secure**: Remind the user if they are testing a sensitive endpoint without
    an `https://` protocol.
```

### 3. Add the tool logic

Skills can bundle resources like scripts to perform deterministic tasks. Create
a file at `.gemini/skills/api-auditor/scripts/audit.js`. This is the code the
agent will run.

```javascript
// .gemini/skills/api-auditor/scripts/audit.js
const url = process.argv[2];

if (!url) {
  console.error('Usage: node audit.js <url>');
  process.exit(1);
}

console.log(`Auditing ${url}...`);
fetch(url, { method: 'HEAD' })
  .then((r) => console.log(`Result: Success (Status ${r.status})`))
  .catch((e) => console.error(`Result: Failed (${e.message})`));
```

## Verify discovery

Gemini CLI automatically discovers skills in the `.gemini/skills` directory (as
well as the `.agents/skills` alias).

To check if Gemini CLI found your new skill, use the `/skills list` command
within an interactive session:

```bash
/skills list
```

You should see `api-auditor` in the list of available skills. If you just added
the files, you can run `/skills reload` to refresh the list without restarting
the session.

## Use the skill

Now that the skill is discovered, you can trigger its activation by asking a
relevant question.

1.  **Trigger**: Start a new session and ask: "Can you audit https://google.com"
2.  **Activation**: Gemini identifies that the request matches the `api-auditor`
    description and calls the `activate_skill` tool.
3.  **Consent**: You will see a confirmation prompt. Type **y** to approve.
4.  **Execution**: Once activated, Gemini uses the `run_shell_command` tool to
    execute your bundled script:
    `node .gemini/skills/api-auditor/scripts/audit.js https://google.com`

## Pro tip: Use the skill-creator

If you don't want to create the files manually, you can use the built-in
`skill-creator` skill. Simply ask Gemini:

> "Create a new skill called 'api-auditor' that tests if URLs are responding."

The `skill-creator` will handle the directory structure and boilerplate for you.

## Manage skills

You can also manage skills using the `gemini skills` command from your terminal:

- **Install**: `gemini skills install <url-or-path>`
- **Link**: `gemini skills link <path>` (useful for local development)
- **Uninstall**: `gemini skills uninstall <name>`

## Next steps

- [Creating Agent Skills](../creating-skills.md): Detailed guide on advanced
  skill features and metadata.
- [Using Agent Skills](../using-agent-skills.md): More ways to discover and
  manage your skill library.
- [Skill best practices](../skills-best-practices.md): Learn how to design
  reliable and effective expertise.
