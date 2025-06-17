# Themes

Gemini CLI supports a variety of themes to customize its color scheme and appearance. You can change the theme to suit your preferences via the `/theme` command.

## Available Themes

The CLI comes with a selection of pre-defined themes. As seen in `theme-manager.ts`, these typically include:

- **Dark Themes:**
  - `AtomOneDark`
  - `Dracula`
  - `VS2015` (Default)
  - `GitHub` (Dark variant usually)
- **Light Themes:**
  - `VS` (Visual Studio Light)
  - `GoogleCode`
  - `XCode` (Light variant usually)
- **ANSI:**
  - `ANSI`: A theme that primarily uses the terminal's native ANSI color capabilities.

_(The exact list and their appearance can be confirmed by running the `/theme` command within the CLI.)_

### Changing Themes

1.  Type the `/theme` command in the CLI.
2.  A dialog or selection prompt (`ThemeDialog.tsx`) will appear, listing the available themes.
3.  You can typically navigate (e.g., with arrow keys) and select a theme. Some interfaces might offer a live preview or highlight as you select.
4.  Confirm your selection (often with Enter) to apply the theme. You can usually cancel out of the selection (e.g., with Escape).

### Theme Persistence

Selected themes are usually saved in the CLI's configuration (see [CLI Configuration](./docs/cli/configuration.md)) so your preference is remembered across sessions.

## Dark Themes

### ANSI

<img src="../assets/theme-ansi.png" alt="ANSI theme" width="600" />

### Atom OneDark

<img src="../assets/theme-atom-one.png" alt="Atom One theme" width="600">

### Ayu

<img src="../assets/theme-ayu.png" alt="Ayu theme" width="600">

### Default

<img src="../assets/theme-default.png" alt="Default theme" width="600">

### Dracula

<img src="../assets/theme-dracula.png" alt="Dracula theme" width="600">

### GitHub

<img src="../assets/theme-github.png" alt="GitHub theme" width="600">

## Light Themes

### ANSI Light

<img src="../assets/theme-ansi-light.png" alt="ANSI Light theme" width="600">

### Ayu Light

<img src="../assets/theme-ayu-light.png" alt="Ayu Light theme" width="600">

### Default Light

<img src="../assets/theme-default-light.png" alt="Default Light theme" width="600">

### GitHub Light

<img src="../assets/theme-github-light.png" alt="GitHub Light theme" width="600">

### Google Code

<img src="../assets/theme-google-light.png" alt="Google Code theme" width="600">

### Xcode

<img src="../assets/theme-xcode-light.png" alt="Xcode Light theme" width="600">
