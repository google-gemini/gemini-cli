# Gemini CLI examples

Gemini CLI helps you automate common engineering tasks by combining AI reasoning
with local system tools. This document provides examples of how to use the CLI
for file management, code analysis, and data transformation.

> **Note:** These examples demonstrate potential capabilities. Your actual
> results can vary based on the model used and your project environment.

## Rename your photographs based on content

You can use Gemini CLI to automate file management tasks that require visual
analysis. In this example, Gemini CLI renames images based on their actual
subject matter.

Scenario: You have a folder containing the following files:

```bash
photos/photo1.png
photos/photo2.png
photos/photo3.png
```

Give Gemini the following prompt:

```cli
Rename the photos in my "photos" directory based on their contents.
```

Result: Gemini asks for permission to rename your files.

Select **Allow once** and your files are renamed:

```bash
photos/yellow_flowers.png
photos/antique_dresser.png
photos/green_android_robot.png
```

## Explain a repository by reading its code

Gemini CLI is effective for rapid codebase exploration. The following example
shows how to ask Gemini CLI to fetch, analyze, and summarize a remote project.

Scenario: You want to understand how a popular open-source utility works by
inspecting its code, not just its README.

Give Gemini CLI the following prompt:

```cli
Clone the 'chalk' repository from https://github.com/chalk/chalk, read its key source files, and explain how it works.
```

Result: Gemini performs a sequence of actions to answer your request.

1.  First, it asks for permission to run `git clone` to download the repository.
2.  Next, it finds the important source files and asks for permission to read
    them.
3.  Finally, after analyzing the code, it provides a summary.

Gemini CLI returns an explanation based on the actual source code:

```markdown
The `chalk` library is a popular npm package for styling terminal output with
colors. After analyzing the source code, here's how it works:

- **Core functionality:** The main file sets up a chainable API. Each color or
  modifier (like `bold` or `italic`) is a getter that appends the corresponding
  ANSI escape code to an internal stack.

- **Chainable API:** When you call `chalk.red.bold('Hello')`, you are accessing
  getters. The `red` getter adds the red color code, and the `bold` getter adds
  the bold code.

- **Output generation:** When the chain is treated as a string (e.g., in
  `console.log`), a final `toString()` method is called. This method joins all
  the stored ANSI codes, wraps them around the input string ('Hello'), and adds
  a reset code at the end. This produces the final, styled string that the
  terminal can render.
```

## Combine two spreadsheets into one spreadsheet

Gemini CLI can process and transform data across multiple files. Use this
capability to merge reports or reformat data sets without manual copying.

Scenario: You have two .csv files: `Revenue - 2023.csv` and
`Revenue - 2024.csv`. Each file contains monthly revenue figures.

Give Gemini CLI the following prompt:

```cli
Combine the two .csv files into a single .csv file, with each year a different column.
```

Result: Gemini CLI reads each file and then asks for permission to write a new
file. Provide your permission and Gemini CLI provides the combined data:

```csv
Month,2023,2024
January,0,1000
February,0,1200
March,0,2400
April,900,500
May,1000,800
June,1000,900
July,1200,1000
August,1800,400
September,2000,2000
October,2400,3400
November,3400,1800
December,2100,9000
```

## Run unit tests

Gemini CLI can generate boilerplate code and tests based on your existing
implementation. This example demonstrates how to request code coverage for a
JavaScript component.

Scenario: You've written a simple login page. You wish to write unit tests to
ensure that your login page has code coverage.

Give Gemini CLI the following prompt:

```cli
Write unit tests for Login.js.
```

Result: Gemini CLI asks for permission to write a new file and creates a test
for your login page.

## Next steps

- Follow the [File management](../cli/tutorials/file-management.md) guide to
  start working with your codebase.
- Follow the [Quickstart](./index.md) to start your first session.
- See the [Cheatsheet](../cli/cli-reference.md) for a quick reference of
  available commands.
