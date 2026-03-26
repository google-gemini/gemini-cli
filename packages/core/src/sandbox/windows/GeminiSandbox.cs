/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;

/**
 * A native C# helper for the Gemini CLI sandbox on Windows.
 * This helper uses Restricted Tokens and Job Objects to isolate processes.
 * It also supports internal commands for safe file I/O within the sandbox.
 */
public class GeminiSandbox {
    // P/Invoke constants and structures
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const uint JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION = 0x00000400;
    private const uint JOB_OBJECT_LIMIT_ACTIVE_PROCESS = 0x00000008;

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        public Int64 PerProcessUserTimeLimit;
        public Int64 PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct IO_COUNTERS {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetInformationJobObject(IntPtr hJob, int JobObjectInfoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool CreateRestrictedToken(IntPtr ExistingTokenHandle, uint Flags, uint DisableSidCount, IntPtr SidsToDisable, uint DeletePrivilegeCount, IntPtr PrivilegesToDelete, uint RestrictedSidCount, IntPtr SidsToRestrict, out IntPtr NewTokenHandle);

    [DllImport("advapi32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    static extern bool CreateProcessAsUser(IntPtr hToken, string lpApplicationName, string lpCommandLine, IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles, uint dwCreationFlags, IntPtr lpEnvironment, string lpCurrentDirectory, ref STARTUPINFO lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr GetCurrentProcess();

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr GetStdHandle(int nStdHandle);

    [StructLayout(LayoutKind.Sequential)]
    struct STARTUPINFO {
        public uint cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public uint dwX;
        public uint dwY;
        public uint dwXSize;
        public uint dwYSize;
        public uint dwXCountChars;
        public uint dwYCountChars;
        public uint dwFillAttribute;
        public uint dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_INFORMATION {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool ImpersonateLoggedOnUser(IntPtr hToken);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool RevertToSelf();

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern uint GetLongPathName(string lpszShortPath, [Out] StringBuilder lpszLongPath, uint cchBuffer);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern bool ConvertStringSidToSid(string StringSid, out IntPtr ptrSid);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool SetTokenInformation(IntPtr TokenHandle, int TokenInformationClass, IntPtr TokenInformation, uint TokenInformationLength);

    [StructLayout(LayoutKind.Sequential)]
    struct SID_AND_ATTRIBUTES {
        public IntPtr Sid;
        public uint Attributes;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct TOKEN_MANDATORY_LABEL {
        public SID_AND_ATTRIBUTES Label;
    }

    private const int TokenIntegrityLevel = 25;
    private const uint SE_GROUP_INTEGRITY = 0x00000020;

    static int Main(string[] args) {
        if (args.Length < 3) {
            Console.WriteLine("Usage: GeminiSandbox.exe <network:0|1> <cwd> [--forbidden-manifest <path>] <command> [args...]");
            Console.WriteLine("Internal commands: __read <path>, __write <path>");
            return 1;
        }

        bool networkAccess = args[0] == "1";
        string cwd = args[1];
        HashSet<string> forbiddenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        int argIndex = 2;

        if (argIndex < args.Length && args[argIndex] == "--forbidden-manifest") {
            if (argIndex + 1 < args.Length) {
                string manifestPath = args[argIndex + 1];
                if (File.Exists(manifestPath)) {
                    foreach (string line in File.ReadAllLines(manifestPath)) {
                        if (!string.IsNullOrWhiteSpace(line)) {
                            forbiddenPaths.Add(GetNormalizedPath(line.Trim()));
                        }
                    }
                }
                argIndex += 2;
            }
        }

        if (argIndex >= args.Length) {
            Console.WriteLine("Error: Missing command");
            return 1;
        }

        string command = args[argIndex];

        IntPtr hToken = IntPtr.Zero;
        IntPtr hRestrictedToken = IntPtr.Zero;
        IntPtr lowIntegritySid = IntPtr.Zero;

        try {
            // 1. Create Restricted Token
            if (!OpenProcessToken(GetCurrentProcess(), 0x0002 /* TOKEN_DUPLICATE */ | 0x0008 /* TOKEN_QUERY */ | 0x0080 /* TOKEN_ADJUST_DEFAULT */, out hToken)) {
                Console.WriteLine("Error: OpenProcessToken failed (" + Marshal.GetLastWin32Error() + ")");
                return 1;
            }

            // Flags: 0x1 (DISABLE_MAX_PRIVILEGE)
            if (!CreateRestrictedToken(hToken, 1, 0, IntPtr.Zero, 0, IntPtr.Zero, 0, IntPtr.Zero, out hRestrictedToken)) {
                Console.WriteLine("Error: CreateRestrictedToken failed (" + Marshal.GetLastWin32Error() + ")");
                return 1;
            }

            // 2. Lower Integrity Level to Low
            // S-1-16-4096 is the SID for "Low Mandatory Level"
            if (ConvertStringSidToSid("S-1-16-4096", out lowIntegritySid)) {
                TOKEN_MANDATORY_LABEL tml = new TOKEN_MANDATORY_LABEL();
                tml.Label.Sid = lowIntegritySid;
                tml.Label.Attributes = SE_GROUP_INTEGRITY;
                int tmlSize = Marshal.SizeOf(tml);
                IntPtr pTml = Marshal.AllocHGlobal(tmlSize);
                try {
                    Marshal.StructureToPtr(tml, pTml, false);
                    if (!SetTokenInformation(hRestrictedToken, TokenIntegrityLevel, pTml, (uint)tmlSize)) {
                        Console.WriteLine("Error: SetTokenInformation failed (" + Marshal.GetLastWin32Error() + ")");
                        return 1;
                    }
                } finally {
                    Marshal.FreeHGlobal(pTml);
                }
            }

            // 3. Setup Job Object for cleanup
            IntPtr hJob = CreateJobObject(IntPtr.Zero, null);
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION jobLimits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            jobLimits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION;
            
            IntPtr lpJobLimits = Marshal.AllocHGlobal(Marshal.SizeOf(jobLimits));
            Marshal.StructureToPtr(jobLimits, lpJobLimits, false);
            SetInformationJobObject(hJob, 9 /* JobObjectExtendedLimitInformation */, lpJobLimits, (uint)Marshal.SizeOf(jobLimits));
            Marshal.FreeHGlobal(lpJobLimits);

            // 4. Handle Internal Commands or External Process
            if (command == "__read") {
                if (argIndex + 1 >= args.Length) {
                    Console.WriteLine("Error: Missing path for __read");
                    return 1;
                }
                string path = args[argIndex + 1];
                CheckForbidden(path, forbiddenPaths);
                return RunInImpersonation(hRestrictedToken, () => {
                    try {
                        using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
                        using (Stream stdout = Console.OpenStandardOutput()) {
                            fs.CopyTo(stdout);
                        }
                        return 0;
                    } catch (Exception e) {
                        Console.Error.WriteLine("Error reading file: " + e.Message);
                        return 1;
                    }
                });
            } else if (command == "__write") {
                if (argIndex + 1 >= args.Length) {
                    Console.WriteLine("Error: Missing path for __write");
                    return 1;
                }
                string path = args[argIndex + 1];
                CheckForbidden(path, forbiddenPaths);
                return RunInImpersonation(hRestrictedToken, () => {
                    try {
                        using (StreamReader reader = new StreamReader(Console.OpenStandardInput(), System.Text.Encoding.UTF8))
                        using (FileStream fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None))
                        using (StreamWriter writer = new StreamWriter(fs, System.Text.Encoding.UTF8)) {
                            writer.Write(reader.ReadToEnd());
                        }
                        return 0;
                    } catch (Exception e) {
                        Console.Error.WriteLine("Error writing file: " + e.Message);
                        return 1;
                    }
                });
            }

            // External Process
            STARTUPINFO si = new STARTUPINFO();
            si.cb = (uint)Marshal.SizeOf(si);
            si.dwFlags = 0x00000100; // STARTF_USESTDHANDLES
            si.hStdInput = GetStdHandle(-10);
            si.hStdOutput = GetStdHandle(-11);
            si.hStdError = GetStdHandle(-12);

            string commandLine = "";
            for (int i = argIndex; i < args.Length; i++) {
                if (i > argIndex) commandLine += " ";
                commandLine += QuoteArgument(args[i]);
            }

            PROCESS_INFORMATION pi = new PROCESS_INFORMATION();
            // Creation Flags: 0x04000000 (CREATE_BREAKAWAY_FROM_JOB) to allow job assignment if parent is in job
            uint creationFlags = 0;
            if (!CreateProcessAsUser(hRestrictedToken, null, commandLine, IntPtr.Zero, IntPtr.Zero, true, creationFlags, IntPtr.Zero, cwd, ref si, out pi)) {
                Console.WriteLine("Error: CreateProcessAsUser failed (" + Marshal.GetLastWin32Error() + ") Command: " + commandLine);
                return 1;
            }

            AssignProcessToJobObject(hJob, pi.hProcess);
            
            // Wait for exit
            uint waitResult = WaitForSingleObject(pi.hProcess, 0xFFFFFFFF);
            uint exitCode = 0;
            GetExitCodeProcess(pi.hProcess, out exitCode);

            CloseHandle(pi.hProcess);
            CloseHandle(pi.hThread);
            CloseHandle(hJob);

            return (int)exitCode;
        } finally {
            if (hToken != IntPtr.Zero) CloseHandle(hToken);
            if (hRestrictedToken != IntPtr.Zero) CloseHandle(hRestrictedToken);
        }
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

    private static int RunInImpersonation(IntPtr hToken, Func<int> action) {
        if (!ImpersonateLoggedOnUser(hToken)) {
            Console.WriteLine("Error: ImpersonateLoggedOnUser failed (" + Marshal.GetLastWin32Error() + ")");
            return 1;
        }
        try {
            return action();
        } finally {
            RevertToSelf();
        }
    }

    private static string GetNormalizedPath(string path) {
        string fullPath = Path.GetFullPath(path);
        StringBuilder longPath = new StringBuilder(1024);
        uint result = GetLongPathName(fullPath, longPath, (uint)longPath.Capacity);
        if (result > 0 && result < longPath.Capacity) {
            return longPath.ToString();
        }
        return fullPath;
    }

    private static void CheckForbidden(string path, HashSet<string> forbiddenPaths) {
        string fullPath = GetNormalizedPath(path);
        foreach (string forbidden in forbiddenPaths) {
            if (fullPath.Equals(forbidden, StringComparison.OrdinalIgnoreCase) || fullPath.StartsWith(forbidden + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) {
                throw new UnauthorizedAccessException("Access to forbidden path is denied: " + path);
            }
        }
    }

    private static string QuoteArgument(string arg) {
        if (string.IsNullOrEmpty(arg)) return "\"\"";

        bool needsQuotes = false;
        foreach (char c in arg) {
            if (char.IsWhiteSpace(c) || c == '\"') {
                needsQuotes = true;
                break;
            }
        }

        if (!needsQuotes) return arg;

        StringBuilder sb = new StringBuilder();
        sb.Append('\"');
        for (int i = 0; i < arg.Length; i++) {
            char c = arg[i];
            if (c == '\"') {
                sb.Append("\\\"");
            } else if (c == '\\') {
                int backslashCount = 0;
                while (i < arg.Length && arg[i] == '\\') {
                    backslashCount++;
                    i++;
                }

                if (i == arg.Length) {
                    sb.Append('\\', backslashCount * 2);
                } else if (arg[i] == '\"') {
                    sb.Append('\\', backslashCount * 2 + 1);
                    sb.Append('\"');
                } else {
                    sb.Append('\\', backslashCount);
                    sb.Append(arg[i]);
                }
            } else {
                sb.Append(c);
            }
        }
        sb.Append('\"');
        return sb.ToString();
    }
}
