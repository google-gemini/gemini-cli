# Getting Started with Agent Skills

This tutorial will guide you through creating and using your first Agent Skill
to give Gemini specialized expertise.

## Prerequisites

- Gemini CLI installed.
- `experimental.skills` enabled in your
  [`settings.json`](../../get-started/configuration.md).

```json
{
  "experimental": {
    "skills": true
  }
}
```

## Step 1: Create a Skill

A skill is a directory containing a `SKILL.md` file and any supporting resources
(like scripts or data files).

Run the following commands to create the `weather-agent` directory:

```bash
mkdir -p .gemini/skills/weather-agent
```

### 1. Create the helper script

Create `.gemini/skills/weather-agent/get_weather.sh` with the following content:

```bash
#!/bin/bash
# Fetch weather for a city using wttr.in (no API key required)
curl -s "wttr.in/$1?format=3"
```

And make it executable:

```bash
chmod +x .gemini/skills/weather-agent/get_weather.sh
```

### 2. Define the expertise

Create `.gemini/skills/weather-agent/SKILL.md` with the following content:

```markdown
---
name: weather-agent
description:
  Expertise in fetching and summarizing weather information using local tools.
---

# Weather Agent Instructions

When asked about the weather:

1. Use the provided \`get_weather.sh\` script to fetch the current weather for
   the requested city.
2. Summarize the output for the user.
3. If the script is unable to find the location, fall back to using
   \`google_web_search\`.
```

## Step 2: Verify Discovery

Launch Gemini CLI and run the `/skills` command to ensure your skill is
discovered.

```cli
/skills
```

You should see `weather-agent` listed under "Available Agent Skills" with a
checkmark indicating it is enabled.

## Step 3: Use the Skill

Now, simply ask Gemini for a task that matches the skill's description. You
don't need to explicitly tell it to use the skill; it will recognize the need
for its specialized expertise.

> "What's the weather like in Seattle?"

Gemini will identify that the `weather-agent` skill is relevant and will request
permission to employ it. Once you approve, it will follow the specialized
instructions you defined in `SKILL.md`.

## Next Steps

- **Add Resources:** Put reference dictionaries or style guides in the skill
  directory. Gemini will see these files when the skill is in use.
- **Project-Specific Workflows:** Add skills to your project's `.gemini/skills`
  folder and commit them to Git so your entire team has the same capabilities.
- **Global Expertise:** Move your favorite skills to `~/.gemini/skills/` to have
  them available in every session.
