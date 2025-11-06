# Gemini CLI Model Selection (`/model` Command)

Select your Gemini CLI model. The `/model` command opens a dialog where you can
configure the model used by Gemini CLI, giving you more control over your
results.

## How to use the `/model` command

Use the following command in Gemini CLI:

```
/model
```

Running this command will open a dialog with your model options:

- **Auto (recommended):** Let the system choose the best model for your task.
  Typically, this is the best option.
- **Pro:** For complex tasks that require deep reasoning and creativity. The Pro
  model may take longer to return a response.
- **Flash:** For tasks that need a balance of speed and reasoning. The Flash
  model will usually return a faster response than Pro.
- **Flash-Lite:** For simple tasks that need to be done quickly. The Flash-Lite
  model is typically the fastest.

Changes to these settings will be applied to all subsequent interactions with
Gemini CLI.

## Best practices for model selection

- **Default to Auto (recommended).** For most users, the _Auto (recommended)_
  model provides a balance between speed and performance, automatically
  selecting the correct model based on the complexity of the task. Example:
  Developing a web application could include a mix of complex tasks (building
  architecture and scaffolding the project) and simple tasks (generating CSS).

- **Switch to Pro if you aren't getting the results you want.** If you think you
  need your model to be a little "smarter," use Pro. Pro will provide you with
  the highest levels of reasoning and creativity. Example: A complex or
  multi-stage debugging task.

- **Switch to Flash or Flash-Lite if you need faster results.** If you need a
  simple response quickly, Flash or Flash-Lite is the best option. Example:
  Converting a JSON object to a YAML string.
