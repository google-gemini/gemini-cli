# Compatibility

This document outlines the supported operating systems and terminal environments
for Gemini CLI.

## Supported Operating Systems

| OS             | Support Level | Notes                                                                              |
| :------------- | :------------ | :--------------------------------------------------------------------------------- |
| **macOS**      | Full          | Recommended for the best experience.                                               |
| **Linux**      | Full          | Supported across most modern distributions.                                        |
| **Windows 11** | Full          | Supported using Windows Terminal.                                                  |
| **Windows 10** | Partial       | Some UI features like smooth scrolling may be degraded. Windows 11 is recommended. |

## Supported Terminals

Gemini CLI works best in modern terminals that support advanced ANSI escape
sequences and Unicode.

| Terminal               | Support Level | Notes                                                                                    |
| :--------------------- | :------------ | :--------------------------------------------------------------------------------------- |
| **Windows Terminal**   | Full          | Recommended for Windows users.                                                           |
| **iTerm2**             | Full          | Recommended for macOS users.                                                             |
| **VS Code Terminal**   | Full          | Well-supported.                                                                          |
| **JetBrains Terminal** | Partial       | May experience rendering or scrolling issues. Using an external terminal is recommended. |

## Troubleshooting

If you experience rendering artifacts or scrolling issues:

1. Ensure your terminal supports
   [TrueColor](https://github.com/termstandard/colors).
2. Use a modern, well-supported terminal like Windows Terminal or iTerm2.
3. Check your [settings](./cli/settings.md) for UI-related configurations.
