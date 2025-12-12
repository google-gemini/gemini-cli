# Gemini CLI model selection (`/model` command)

Select your Gemini CLI model. The `/model` command opens a dialog where you can
configure the model used by Gemini CLI, giving you more control over your
results.

**Note:** The `/model` command (and the `--model` flag) does not override the
model used by sub-agents. Consequently, even when using the `/model` flag you
may see other models used in your model usage reports.

## How to use the `/model` command

Use the following command in Gemini CLI:

```
/model
```

Running this command will open a dialog with your model options:

| Option             | Description                                                   | Models                                                                                     |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Auto (recommended) | Let the system choose the best model for your task.           | gemini-3-pro-preview (if enabled), gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite |
| Pro                | For complex tasks that require deep reasoning and creativity. | gemini-3-pro-preview (if enabled), gemini-2.5-pro                                          |
| Flash              | For tasks that need a balance of speed and reasoning.         | gemini-2.5-flash                                                                           |
| Flash-Lite         | For simple tasks that need to be done quickly.                | gemini-2.5-flash-lite                                                                      |

### Gemini 3 Pro and preview features

Note: Gemini 3 is not currently available on all account types. To learn more
about Gemini 3 access, refer to
[Gemini 3 Pro on Gemini CLI](../get-started/gemini-3.md).

To enable Gemini 3 Pro (if available), enable
[**Preview features** by using the `settings` command](../cli/settings.md). Once
enabled, Gemini CLI will attempt to use Gemini 3 Pro when you select **Auto** or
**Pro**. Both **Auto** and **Pro** will try to use Gemini 3 Pro before falling
back to Gemini 2.5 Pro.

You can also use the `--model` flag to specify a particular Gemini model on
startup. For more details, refer to the
[configuration documentation](./configuration.md).

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
