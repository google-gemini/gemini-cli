# Getting Started with Agent Skills

Agent Skills allow you to extend Gemini CLI with specialized expertise. This
tutorial will guide you through creating your first skill and using it in a
session.

## 1. Create your first skill

A skill is a directory containing a `SKILL.md` file. Let's create an **API
Auditor** skill that helps you verify if local or remote endpoints are
responding correctly.

1.  **Create the skill directory structure:**

    ```bash
    mkdir -p .gemini/skills/api-auditor/scripts
    ```

2.  **Create the `SKILL.md` file:** Create a file at
    `.gemini/skills/api-auditor/SKILL.md` with the following content:

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

3.  **Create the bundled Node.js script:** Create a file at
    `.gemini/skills/api-auditor/scripts/audit.js`. This script will be used by
    the agent to perform the actual check:

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

## 2. Verify the skill is discovered

Use the `/skills` slash command (or `gemini skills list` from your terminal) to
see if Gemini CLI has found your new skill.

In a Gemini CLI session:

```
/skills list
```

You should see `api-auditor` in the list of available skills.

## 3. Use the skill in a chat

Now, let's see the skill in action. Start a new session and ask a question about
an endpoint.

**User:** "Can you audit http://geminili.com"

Gemini will recognize the request matches the `api-auditor` description and will
ask for your permission to activate it.

**Model:** (After calling `activate_skill`) "I've activated the **api-auditor**
skill. I'll run the audit script now..."

Gemini will then use the `run_shell_command` tool to execute your bundled Node
script:

`node .gemini/skills/api-auditor/scripts/audit.js http://geminili.com`

## Next Steps

- Explore [Agent Skills Authoring Guide](../skills.md#creating-a-skill) to learn
  about more advanced skill features.
- Learn how to share skills via [Extensions](../../extensions/index.md).
