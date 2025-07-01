using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

public class ListOpenWindows
{
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder strText, int maxCount);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    public static List<WindowInfo> GetOpenWindows()
    {
        List<WindowInfo> windowInfos = new List<WindowInfo>();

        EnumWindows((hWnd, lParam) =>
        {
            if (IsWindowVisible(hWnd))
            {
                StringBuilder sb = new StringBuilder(256);
                GetWindowText(hWnd, sb, sb.Capacity);
                string windowTitle = sb.ToString();

                if (!string.IsNullOrEmpty(windowTitle))
                {
                    uint processId;
                    GetWindowThreadProcessId(hWnd, out processId);
                    windowInfos.Add(new WindowInfo { Title = windowTitle, ProcessId = processId });
                }
            }
            return true;
        }, IntPtr.Zero);

        return windowInfos;
    }

    public static void Main(string[] args)
    {
        List<WindowInfo> openWindows = GetOpenWindows();
        string jsonOutput = JsonSerializer.Serialize(openWindows);
        Console.WriteLine(jsonOutput);
    }
}

public class WindowInfo
{
    public string Title { get; set; }
    public uint ProcessId { get; set; }
}
