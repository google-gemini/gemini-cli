# Themes

Gemini CLI supports a variety of themes to customize its color scheme and
appearance. You can change the theme to suit your preferences via the `/theme`
command or `"theme":` configuration setting.

## Available themes

Gemini CLI comes with a selection of pre-defined themes, which you can list
using the `/theme` command within Gemini CLI:

- **Dark themes:**
  - `ANSI`
  - `Atom One`
  - `Ayu`
  - `Default`
  - `Dracula`
  - `GitHub`
  - `Solarized Dark`
- **Light themes:**
  - `ANSI Light`
  - `Ayu Light`
  - `Default Light`
  - `GitHub Light`
  - `Google Code`
  - `Solarized Light`
  - `Xcode`

### Changing themes

1.  Enter `/theme` into Gemini CLI.
2.  A dialog or selection prompt appears, listing the available themes.
3.  Using the arrow keys, select a theme. Some interfaces might offer a live
    preview or highlight as you select.
4.  Confirm your selection to apply the theme.

**Note:** If a theme is defined in your `settings.json` file (either by name or
by a file path), you must remove the `"theme"` setting from the file before you
can change the theme using the `/theme` command.

### Theme persistence

Selected themes are saved in Gemini CLI's
[configuration](../reference/configuration.md) so your preference is remembered
across sessions.

---

## Custom color themes

Gemini CLI lets you create your own custom color themes by specifying them in
your `settings.json` file. This gives you full control over the color palette
used in the CLI.

### How to define a custom theme

Add a `customThemes` block to your user, project, or system `settings.json`
file. Each custom theme is defined as an object with a unique name and a set of
nested configuration objects. For example:

```json
{
  "ui": {
    "customThemes": {
      "MyCustomTheme": {
        "name": "MyCustomTheme",
        "type": "custom",
        "background": {
          "primary": "#181818"
        },
        "text": {
          "primary": "#f0f0f0",
          "secondary": "#a0a0a0"
        }
      }
    }
  }
}
```

**Configuration objects:**

- **`text`**: Defines text colors.
  - `primary`: The default text color.
  - `secondary`: Used for less prominent text.
  - `link`: Color for URLs and links.
  - `accent`: Used for highlights and emphasis.
  - `response`: Precedence over `primary` for rendering model responses.
- **`background`**: Defines background colors.
  - `primary`: The main background color of the UI.
  - `diff.added`: Background for added lines in diffs.
  - `diff.removed`: Background for removed lines in diffs.
- **`border`**: Defines border colors.
  - `default`: The standard border color.
  - `focused`: Border color when an element is focused.
- **`status`**: Colors for status indicators.
  - `success`: Used for successful operations.
  - `warning`: Used for warnings.
  - `error`: Used for errors.
- **`ui`**: Other UI elements.
  - `comment`: Color for code comments.
  - `symbol`: Color for code symbols and operators.
  - `gradient`: An array of colors used for gradient effects.

**Required properties:**

- `name` (must match the key in the `customThemes` object and be a string)
- `type` (must be the string `"custom"`)

While all sub-properties are technically optional, we recommend providing at
least `background.primary`, `text.primary`, `text.secondary`, and the various
accent colors via `text.link`, `text.accent`, and `status` to ensure a cohesive
UI.

You can use either hex codes (e.g., `#FF0000`) **or** standard CSS color names
(e.g., `coral`, `teal`, `blue`) for any color value. See
[CSS color names](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#color_keywords)
for a full list of supported names.

You can define multiple custom themes by adding more entries to the
`customThemes` object.

### Loading themes from a file

In addition to defining custom themes in `settings.json`, you can also load a
theme directly from a JSON file by specifying the file path in your
`settings.json`. This is useful for sharing themes or keeping them separate from
your main configuration.

To load a theme from a file, set the `theme` property in your `settings.json` to
the path of your theme file:

```json
{
  "ui": {
    "theme": "/path/to/your/theme.json"
  }
}
```

The theme file must be a valid JSON file that follows the same structure as a
custom theme defined in `settings.json`.

**Example `my-theme.json`:**

```json
{
  "name": "Gruvbox Dark",
  "type": "custom",
  "background": {
    "primary": "#282828",
    "diff": {
      "added": "#2b3312",
      "removed": "#341212"
    }
  },
  "text": {
    "primary": "#ebdbb2",
    "secondary": "#a89984",
    "link": "#83a598",
    "accent": "#d3869b"
  },
  "border": {
    "default": "#3c3836",
    "focused": "#458588"
  },
  "status": {
    "success": "#b8bb26",
    "warning": "#fabd2f",
    "error": "#fb4934"
  },
  "ui": {
    "comment": "#928374",
    "symbol": "#8ec07c",
    "gradient": ["#cc241d", "#d65d0e", "#d79921"]
  }
}
```

**Security note:** For your safety, Gemini CLI will only load theme files that
are located within your home directory. If you attempt to load a theme from
outside your home directory, a warning will be displayed and the theme will not
be loaded. This is to prevent loading potentially malicious theme files from
untrusted sources.

### Example custom theme

<img src="../assets/theme-custom.png" alt="Custom theme example" width="600" />

### Using your custom theme

- Select your custom theme using the `/theme` command in Gemini CLI. Your custom
  theme will appear in the theme selection dialog.
- Or, set it as the default by adding `"theme": "MyCustomTheme"` to the `ui`
  object in your `settings.json`.
- Custom themes can be set at the user, project, or system level, and follow the
  same [configuration precedence](../reference/configuration.md) as other
  settings.

### Themes from extensions

[Extensions](../extensions/reference.md#themes) can also provide custom themes.
Once an extension is installed and enabled, its themes are automatically added
to the selection list in the `/theme` command.

Themes from extensions appear with the extension name in parentheses to help you
identify their source, for example: `shades-of-green (green-extension)`.

---

## Dark themes

### ANSI

<img src="/assets/theme-ansi.png" alt="ANSI theme" width="600" />

### Atom OneDark

<img src="/assets/theme-atom-one.png" alt="Atom One theme" width="600">

### Ayu

<img src="/assets/theme-ayu.png" alt="Ayu theme" width="600">

### Default

<img src="/assets/theme-default.png" alt="Default theme" width="600">

### Dracula

<img src="/assets/theme-dracula.png" alt="Dracula theme" width="600">

### GitHub

<img src="/assets/theme-github.png" alt="GitHub theme" width="600">

### Solarized Dark

<img src="/assets/theme-solarized-dark.png" alt="Solarized Dark theme" width="600">

## Light themes

### ANSI Light

<img src="/assets/theme-ansi-light.png" alt="ANSI Light theme" width="600">

### Ayu Light

<img src="/assets/theme-ayu-light.png" alt="Ayu Light theme" width="600">

### Default Light

<img src="/assets/theme-default-light.png" alt="Default Light theme" width="600">

### GitHub Light

<img src="/assets/theme-github-light.png" alt="GitHub Light theme" width="600">

### Google Code

<img src="/assets/theme-google-light.png" alt="Google Code theme" width="600">

### Solarized Light

<img src="/assets/theme-solarized-light.png" alt="Solarized Light theme" width="600">

### Xcode

<img src="/assets/theme-xcode-light.png" alt="Xcode Light theme" width="600">
