# Windows-Specific Tools

This section describes tools that are designed to run specifically on the Windows operating system. These tools leverage native Windows APIs to provide functionalities not available cross-platform.

## `listOpenWindows`

- **Description:** Lists all currently open and visible top-level windows on the user's desktop. For each window, it provides the window title and the process ID (PID) of the application that owns the window.
- **Use Case:** Useful for understanding the user's current desktop environment, identifying running applications, or for tasks that require knowledge of active windows.
- **Parameters:** None.
- **Output:** A JSON object containing a list of windows, where each window object has:
    - `Title`: The title of the window (string).
    - `ProcessId`: The process ID of the window owner (number).
- **Example Output:**
  ```json
  {
    "windows": [
      {
        "Title": "Untitled - Notepad",
        "ProcessId": 1234
      },
      {
        "Title": "Calculator",
        "ProcessId": 5678
      }
    ]
  }
  ```
- **Important Notes:**
    - This tool is **Windows-only**. It will not function on macOS or Linux.
    - The tool relies on a native executable (`ListOpenWindows.exe`) that must be present in the `native_tools/windows/` directory at the root of the project.
    - It only lists visible, top-level windows. Minimized windows or windows without titles might not be fully represented or may have empty titles.
