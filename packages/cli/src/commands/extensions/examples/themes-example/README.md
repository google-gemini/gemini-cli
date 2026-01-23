# Themes Example

This is an example of a Gemini CLI extension that adds a custom theme.

## How to use

1.  Link this extension:

    ```bash
    gemini extensions link packages/cli/src/commands/extensions/examples/themes-example
    ```

2.  Set the theme in your settings file (`~/.gemini/settings.json`):

    ```json
    {
      "ui": {
        "theme": "themes-example: My-Awesome-Theme"
      }
    }
    ```

    Alternatively, you can set it through the UI by running `gemini` and then
    pressing `t`.

3.  **Observe the Changes:**

    After setting the theme, you should see the changes reflected in the Gemini
    CLI's UI. The primary text color should now be magenta (`#FF00FF`), as
    defined in the `themes-example`'s `gemini-extension.json` file.
