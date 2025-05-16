# Gemini CLI Tools: Overview

The Gemini CLI is equipped with a powerful set of built-in tools that the Gemini model can utilize to interact with your local environment, access information, and perform actions. These tools significantly enhance the CLI's capabilities, allowing it to go beyond text generation and assist with a wide range of tasks.

## What are Tools?

In the context of the Gemini CLI, tools are specific functions or modules that the Gemini model can request to be executed. For example, if you ask Gemini to "Summarize the contents of `my_document.txt`," the model will likely identify the need to read that file and will request the execution of the `read_file` tool.

The server component (`packages/server`) manages these tools, presents their definitions (schemas) to the Gemini model, executes them when requested, and returns the results to the model for further processing into a user-facing response.

## Why are Tools Important?

- **Access to Local Information:** Tools allow Gemini to access your local file system, read file contents, list directories, etc.
- **Execution of Commands:** With tools like `execute_bash_command`, Gemini can run shell commands (with appropriate safety measures and user confirmation).
- **Interaction with the Web:** Tools can fetch content from URLs.
- **Action Taking:** Tools can modify files, write new files, or perform other actions on your system (again, typically with safeguards).
- **Grounding Responses:** By using tools to fetch real-time or specific local data, Gemini's responses can be more accurate, relevant, and grounded in your actual context.

## How Tools are Used

1.  You provide a prompt to the Gemini CLI.
2.  The CLI sends the prompt to the server.
3.  The server, along with your prompt and conversation history, sends a list of available tools and their descriptions/schemas to the Gemini API.
4.  The Gemini model analyzes your request. If it determines that a tool is needed, its response will include a request to execute a specific tool with certain parameters.
5.  The server receives this tool request, validates it, and (often after user confirmation for sensitive operations) executes the tool.
6.  The output from the tool is sent back to the Gemini model.
7.  The Gemini model uses the tool's output to formulate its final answer, which is then sent back through the server to the CLI and displayed to you.

You will typically see messages in the CLI indicating when a tool is being called and whether it succeeded or failed.

## Security and Confirmation

Many tools, especially those that can modify your file system or execute commands (`write_file`, `edit`, `execute_bash_command`), are designed with safety in mind. The Gemini CLI will typically:

- **Require Confirmation:** Prompt you before executing potentially sensitive operations, showing you what action is about to be taken.
- **Utilize Sandboxing:** For tools like `execute_bash_command`, sandboxing mechanisms (configurable via settings) are employed to limit the potential impact of the command.

It's important to always review confirmation prompts carefully before allowing a tool to proceed.

## Categories of Built-in Tools

The built-in tools can be broadly categorized as follows:

- **[File System Tools](./file-system.md):** For interacting with files and directories (reading, writing, listing, searching, etc.).
- **[Shell Tool](./shell.md):** For executing shell commands.
- **[Web Fetch Tool](./web.md):** For retrieving content from URLs.
- **[Multi-File Read Tool](./multi-file.md):** A specialized tool for reading content from multiple files or directories, often used by the `@` command.

Understanding the available tools and how they work will help you make the most effective use of the Gemini CLI.
