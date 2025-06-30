using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;
using System.ComponentModel;
using System.IO;

public class ActiveWindowInfo
{
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint processAccess, bool bInheritHandle, uint processId);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool QueryFullProcessImageName(IntPtr hProcess, uint dwFlags, StringBuilder lpExeName, ref uint lpdwSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr hObject);

    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    public static void Main(string[] args)
    {
        IntPtr hWnd = GetForegroundWindow();
        if (hWnd == IntPtr.Zero)
        {
            Console.Error.WriteLine("Error: Could not get foreground window.");
            return;
        }

        StringBuilder windowTitle = new StringBuilder(256);
        if (GetWindowText(hWnd, windowTitle, windowTitle.Capacity) == 0)
        {
            // Error or empty title, proceed with empty title
        }

        uint processId;
        GetWindowThreadProcessId(hWnd, out processId);
        if (processId == 0)
        {
            Console.Error.WriteLine("Error: Could not get process ID.");
            return;
        }

        string executablePath = GetProcessExecutablePath(processId);

        Console.WriteLine($"{{\"title\":\"{JsonEscape(windowTitle.ToString())}\",\"pid\":{processId},\"executablePath\":\"{JsonEscape(executablePath)}\"}}");
    }

    private static string GetProcessExecutablePath(uint processId)
    {
        IntPtr hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, processId);
        if (hProcess == IntPtr.Zero)
        {
            // Cannot open process (e.g. access denied)
            return "N/A";
        }

        try
        {
            StringBuilder exePath = new StringBuilder(1024);
            uint size = (uint)exePath.Capacity;
            if (QueryFullProcessImageName(hProcess, 0, exePath, ref size))
            {
                return exePath.ToString();
            }
            else
            {
                 // Could not query process image name
                return "N/A";
            }
        }
        finally
        {
            CloseHandle(hProcess);
        }
    }

    private static string JsonEscape(string str)
    {
        if (string.IsNullOrEmpty(str))
        {
            return string.Empty;
        }
        return str.Replace("\\", "\\\\").Replace("\"", "\\\"");
    }
}
