# Demo Background Agent

A pretend background agent that does not actually process tasks in the background. Configure in your settings.json with:

```javascript
 "backgroundAgents": {
    "demo-background-agent": {
      "command": "npm",
      "args": [
        "run",
        "start:demo-background-agent",
        "--workspace=@google/gemini-cli-examples"
      ]
    }
  },
```
