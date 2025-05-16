# Shell Tool

This document provides details on the shell tool available.

## `execute_bash_command`

- **Purpose:** Executes a given shell command using `bash -c <command>`. This tool is essential for interacting with the underlying operating system, running scripts, or performing command-line operations.
- **Arguments:**
  - `command` (string, required): The exact bash command to execute.
  - `description` (string, optional): A brief description of the command's purpose, which will be shown to the user.
  - `directory` (string, optional): The directory (relative to the project root) in which to execute the command. If not provided, the command runs in the project root.
- **Behavior:**
  - The command is executed as a subprocess.
  - It can start background processes using `&`.
  - The tool returns detailed information about the execution, including:
    - `Command`: The command that was executed.
    - `Directory`: The directory where the command was run.
    - `Stdout`: Output from the standard output stream.
    - `Stderr`: Output from the standard error stream.
    - `Error`: Any error message reported by the subprocess.
    - `Exit Code`: The exit code of the command.
    - `Signal`: The signal number if the command was terminated by a signal.
    - `Background PIDs`: A list of PIDs for any background processes started.
- **Examples:**
  - Listing files in the current directory:
    ```
    execute_bash_command(command="ls -la")
    ```
  - Running a script in a specific directory:
    ```
    execute_bash_command(command="./my_script.sh", directory="scripts", description="Run my custom script")
    ```
  - Starting a background server:
    ```
    execute_bash_command(command="npm run dev &", description="Start development server in background")
    ```
- **Important Notes:**
  - **Security:** Be cautious when executing commands, especially those constructed from user input, to prevent security vulnerabilities.
  - **Interactive Commands:** Avoid commands that require interactive user input, as this can cause the tool to hang. Use non-interactive flags if available (e.g., `npm init -y`).
  - **Error Handling:** Check the `Stderr`, `Error`, and `Exit Code` fields to determine if a command executed successfully.
