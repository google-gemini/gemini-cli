# Get started with Agent Skills

Agent Skills extend Gemini CLI with specialized expertise. In this guide, you'll
learn how to create your first skill, bundle custom scripts, and activate them
during a session.

## How to create a skill

A skill is defined by a directory containing a `SKILL.md` file. Let's create an
**API Auditor** skill that helps you verify if local or remote endpoints are
responding correctly.

### Create the directory structure

1.  Run the following command to create the folders:

    **macOS/Linux**

    ```bash
    mkdir -p .gemini/skills/api-auditor/scripts
    ```

    **Windows (PowerShell)**

    ```powershell
    New-Item -ItemType Directory -Force -Path ".gemini\skills\api-auditor\scripts"
    ```

### Create the definition

1.  Create a file at `.gemini/skills/api-auditor/SKILL.md`. This tells the agent
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

    1.  **Audit**: Use the bundled `scripts/audit.js` utility to check the
        status of the provided URL.
    2.  **Report**: Analyze the output (status codes, latency) and explain any
        failures in plain English.
    3.  **Secure**: Remind the user if they are testing a sensitive endpoint
        without an `https://` protocol.
    ```

### Add the tool logic

Skills can bundle resources like scripts.

1.  Create a file at `.gemini/skills/api-auditor/scripts/audit.js`. This is the
    code the agent will run.

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

## How to verify discovery

Gemini CLI automatically discovers skills in the `.gemini/skills` directory. You
can also use `.agents/skills` as a more generic alternative. Check that it found
your new skill.

**Command:** `/skills list`

You should see `api-auditor` in the list of available skills.

### If your skill doesn't appear

If `/skills list` doesn't show your skill, run through this checklist:

1.  **The folder must be trusted (workspace skills only).** Skills under
    `<workspace>/.gemini/skills/` are only loaded when the workspace folder is
    marked as trusted. Run `/trust` and restart the session if needed. Skills
    under `~/.gemini/skills/` (user scope) are not affected by trust.
2.  **Check the path layout.** `SKILL.md` must live exactly one directory deep,
    like `.gemini/skills/<skill-name>/SKILL.md`. Files placed directly in
    `.gemini/skills/SKILL.md`, or nested more than one directory deep, are not
    discovered.
3.  **The filename must be `SKILL.md` exactly.** Capitalization matters on
    case-sensitive filesystems (Linux, and macOS when configured as such):
    `skill.md` or `Skill.md` will be ignored.
4.  **Frontmatter must include both `name:` and `description:`.** A `SKILL.md`
    is silently skipped if either field is missing or if the frontmatter
    delimiters (`---` on their own lines) are absent.
5.  **The skill name comes from the `name:` field, not the directory name.** If
    your frontmatter says `name: foo`, the skill appears as `foo` in
    `/skills list` regardless of what its parent directory is called. The
    characters `: \ / < > * ? " |` in the name are replaced with `-`.

## How to use the skill

Now, try it out. Start a new session and ask a question that triggers the
skill's description.

**User:** "Can you audit http://geminicli.com"

Gemini recognizes the request matches the `api-auditor` description and asks for
permission to activate it.

**Model:** (After calling `activate_skill`) "I've activated the **api-auditor**
skill. I'll run the audit script now..."

Gemini then uses the `run_shell_command` tool to execute your bundled Node
script:

`node .gemini/skills/api-auditor/scripts/audit.js http://geminili.com`

## Next steps

- Explore the
  [Agent Skills Authoring Guide](../../cli/skills.md#creating-a-skill) to learn
  about more advanced features.
- Learn how to share skills via [Extensions](../../extensions/index.md).
