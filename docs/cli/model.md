# Gemini CLI model selection (`/model` command)

Select your Gemini CLI model. The `/model` command lets you configure the model
used by Gemini CLI, giving you more control over your results. Use **Pro**
models for complex tasks and reasoning, **Flash** models for high speed results,
or the (recommended) **Auto** setting to choose the best model for your tasks.

> **Note:** The `/model` command (and the `--model` flag) does not override the
> model used by sub-agents. Consequently, even when using the `/model` flag you
> may see other models used in your model usage reports.

## How to use the `/model` command

Use the following command in Gemini CLI:

```
/model
```

Running this command will open a dialog with your options:

| Option            | Description                                                    | Models                                                                 |
| ----------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Auto (Gemini 3)   | Let the system choose the best Gemini 3 model for your task.   | gemini-3-pro-preview (if enabled), gemini-3-flash-preview (if enabled) |
| Auto (Gemini 2.5) | Let the system choose the best Gemini 2.5 model for your task. | gemini-2.5-pro, gemini-2.5-flash                                       |
| Manual            | Select a specific model.                                       | Any available model.                                                   |

We recommend selecting one of the above **Auto** options. However, you can
select **Manual** to select a specific model from those available.

### Gemini 3 and preview features

> **Note:** Gemini 3 is not currently available on all account types. To learn
> more about Gemini 3 access, refer to
> [Gemini 3 on Gemini CLI](../get-started/gemini-3.md).

To enable Gemini 3 Pro and Gemini 3 Flash (if available), enable
[**Preview Features** by using the `settings` command](../cli/settings.md).

You can also use the `--model` flag to specify a particular Gemini model on
startup. For more details, refer to the
[configuration documentation](../get-started/configuration.md).

Changes to these settings will be applied to all subsequent interactions with
Gemini CLI.

## Best practices for model selection

- **Default to Auto.** For most users, the _Auto_ option model provides a
  balance between speed and performance, automatically selecting the correct
  model based on the complexity of the task. Example: Developing a web
  application could include a mix of complex tasks (building architecture and
  scaffolding the project) and simple tasks (generating CSS).

- **Switch to Pro if you aren't getting the results you want.** If you think you
  need your model to be a little "smarter," you can manually select Pro. Pro
  will provide you with the highest levels of reasoning and creativity. Example:
  A complex or multi-stage debugging task.

- **Switch to Flash or Flash-Lite if you need faster results.** If you need a
  simple response quickly, Flash or Flash-Lite is the best option. Example:
  Converting a JSON object to a YAML string.
