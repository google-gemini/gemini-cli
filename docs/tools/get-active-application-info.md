# Get Active Application Info Tool

The `getActiveApplicationInfo` tool retrieves information about the currently active (foreground) application window on the user's desktop.

## Functionality

This tool provides the following details for the active window:

-   **Window Title:** The title text of the foreground window.
-   **Process ID (PID):** The ID of the process that owns the window.
-   **Executable Path:** The full file system path to the executable file of the process.

## Platform Specificity

**This tool is Windows-specific.** It relies on Windows APIs to gather the required information and will not function on other operating systems (e.g., macOS, Linux). Attempting to use it on a non-Windows platform will result in an error.

## Use Cases

-   Identifying the application the user is currently interacting with.
-   Debugging or logging application context.
-   Integrating with other tools that might need to know the foreground application details on Windows.

## Parameters

This tool takes no parameters.

## Output Structure (JSON)

The tool outputs a JSON object with the following structure:

```json
{
  "pid": 1234,
  "title": "Example Window Title - Notepad",
  "executablePath": "C:\\Windows\\System32\\notepad.exe"
}
```

## Implementation Details

The Node.js tool (`GetActiveApplicationInfoTool`) internally calls a compiled C# utility (`ActiveWindowInfo.exe`). This native utility uses Windows APIs such as `GetForegroundWindow`, `GetWindowTextW`, `GetWindowThreadProcessId`, `OpenProcess`, and `QueryFullProcessImageNameW` to fetch the application details. The C# utility then outputs this information as a JSON string to its standard output, which is captured and parsed by the Node.js tool.

## Build and Packaging

The `ActiveWindowInfo.exe` utility must be compiled from its C# source and be available at a path accessible by the Gemini CLI during runtime. The exact packaging and distribution mechanism will ensure this utility is correctly located. Currently, it's expected to be found relative to the `get-active-application-info.ts` tool file, but this might be subject to change based on the final build process.
If the utility is not found, the tool will fail with an error indicating that `ActiveWindowInfo.exe` could not be started.

## Error Handling

-   If run on a non-Windows system, an error is thrown.
-   If the native utility (`ActiveWindowInfo.exe`) cannot be spawned (e.g., not found, permissions issue), an error is thrown.
-   If the native utility exits with a non-zero status code, an error is thrown, including any error messages from the utility's stderr.
-   If the output from the native utility is not valid JSON, an error is thrown.
-   If the tool execution is aborted via an `AbortSignal`, an error is thrown.
