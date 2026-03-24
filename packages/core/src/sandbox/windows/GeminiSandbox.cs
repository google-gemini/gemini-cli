/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Diagnostics;
using System.Security.Principal;
using System.IO;

public class GeminiSandbox {
    [StructLayout(LayoutKind.Sequential)]
    public struct STARTUPINFO {
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
        public ushort wShowWindow;
        public ushort cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
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
    public struct IO_COUNTERS {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SID_AND_ATTRIBUTES {
        public IntPtr Sid;
        public uint Attributes;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct TOKEN_MANDATORY_LABEL {
        public SID_AND_ATTRIBUTES Label;
    }

    public enum JobObjectInfoClass {
        ExtendedLimitInformation = 9
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr GetCurrentProcess();

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern bool CreateRestrictedToken(IntPtr ExistingTokenHandle, uint Flags, uint DisableSidCount, IntPtr SidsToDisable, uint DeletePrivilegeCount, IntPtr PrivilegesToDelete, uint RestrictedSidCount, IntPtr SidsToRestrict, out IntPtr NewTokenHandle);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CreateProcessAsUser(IntPtr hToken, string lpApplicationName, string lpCommandLine, IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles, uint dwCreationFlags, IntPtr lpEnvironment, string lpCurrentDirectory, ref STARTUPINFO lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetInformationJobObject(IntPtr hJob, JobObjectInfoClass JobObjectInfoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint ResumeThread(IntPtr hThread);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr GetStdHandle(int nStdHandle);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool ConvertStringSidToSid(string StringSid, out IntPtr Sid);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern bool SetTokenInformation(IntPtr TokenHandle, int TokenInformationClass, IntPtr TokenInformation, uint TokenInformationLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr LocalFree(IntPtr hMem);

    public const uint TOKEN_DUPLICATE = 0x0002;
    public const uint TOKEN_QUERY = 0x0008;
    public const uint TOKEN_ASSIGN_PRIMARY = 0x0001;
    public const uint TOKEN_ADJUST_DEFAULT = 0x0080;
    public const uint DISABLE_MAX_PRIVILEGE = 0x1;
    public const uint CREATE_SUSPENDED = 0x00000004;
    public const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
    public const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    public const uint STARTF_USESTDHANDLES = 0x00000100;
    public const int TokenIntegrityLevel = 25;
    public const uint SE_GROUP_INTEGRITY = 0x00000020;
    public const uint INFINITE = 0xFFFFFFFF;

    static int Main(string[] args) {
        if (args.Length < 3) {
            Console.WriteLine("Usage: GeminiSandbox.exe <network:0|1> <cwd> <command> [args...]");
            Console.WriteLine("Internal commands: __read <path>, __write <path>");
            return 1;
        }

        bool networkAccess = args[0] == "1";
        string cwd = args[1];
        string command = args[2];

        IntPtr hToken = IntPtr.Zero;
        IntPtr hRestrictedToken = IntPtr.Zero;
        IntPtr hJob = IntPtr.Zero;
        IntPtr pSidsToDisable = IntPtr.Zero;
        IntPtr pSidsToRestrict = IntPtr.Zero;
        IntPtr networkSid = IntPtr.Zero;
        IntPtr restrictedSid = IntPtr.Zero;
        IntPtr lowIntegritySid = IntPtr.Zero;

        try {
            // 1. Setup Token
            IntPtr hCurrentProcess = GetCurrentProcess();
            if (!OpenProcessToken(hCurrentProcess, TOKEN_DUPLICATE | TOKEN_QUERY | TOKEN_ASSIGN_PRIMARY | TOKEN_ADJUST_DEFAULT, out hToken)) {
                Console.Error.WriteLine("Failed to open process token");
                return 1;
            }

            uint sidCount = 0;
            uint restrictCount = 0;

            // "networkAccess == false" implies Strict Sandbox Level 1.
            if (!networkAccess) {
                if (ConvertStringSidToSid("S-1-5-2", out networkSid)) {
                    sidCount = 1;
                    int saaSize = Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES));
                    pSidsToDisable = Marshal.AllocHGlobal(saaSize);
                    SID_AND_ATTRIBUTES saa = new SID_AND_ATTRIBUTES();
                    saa.Sid = networkSid;
                    saa.Attributes = 0;
                    Marshal.StructureToPtr(saa, pSidsToDisable, false);
                }

                // S-1-5-12 is Restricted Code SID
                if (ConvertStringSidToSid("S-1-5-12", out restrictedSid)) {
                    restrictCount = 1;
                    int saaSize = Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES));
                    pSidsToRestrict = Marshal.AllocHGlobal(saaSize);
                    SID_AND_ATTRIBUTES saa = new SID_AND_ATTRIBUTES();
                    saa.Sid = restrictedSid;
                    saa.Attributes = 0;
                    Marshal.StructureToPtr(saa, pSidsToRestrict, false);
                }
            }

            if (!CreateRestrictedToken(hToken, DISABLE_MAX_PRIVILEGE, sidCount, pSidsToDisable, 0, IntPtr.Zero, restrictCount, pSidsToRestrict, out hRestrictedToken)) {
                Console.Error.WriteLine("Failed to create restricted token");
                return 1;
            }

            // 2. Set Integrity Level to Low
            if (ConvertStringSidToSid("S-1-16-4096", out lowIntegritySid)) {
                TOKEN_MANDATORY_LABEL tml = new TOKEN_MANDATORY_LABEL();
                tml.Label.Sid = lowIntegritySid;
                tml.Label.Attributes = SE_GROUP_INTEGRITY;
                int tmlSize = Marshal.SizeOf(tml);
                IntPtr pTml = Marshal.AllocHGlobal(tmlSize);
                try {
                    Marshal.StructureToPtr(tml, pTml, false);
                    SetTokenInformation(hRestrictedToken, TokenIntegrityLevel, pTml, (uint)tmlSize);
                } finally {
                    Marshal.FreeHGlobal(pTml);
                }
            }

            // 3. Handle Internal Commands or External Process
            if (command == "__read") {
                string path = args[3];
                return RunInImpersonation(hRestrictedToken, () => {
                    try {
                        using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
                        using (StreamReader sr = new StreamReader(fs, System.Text.Encoding.UTF8)) {
                            char[] buffer = new char[4096];
                            int bytesRead;
                            while ((bytesRead = sr.Read(buffer, 0, buffer.Length)) > 0) {
                                Console.Write(buffer, 0, bytesRead);
                            }
                        }
                        return 0;
                    } catch (Exception e) {
                        Console.Error.WriteLine(e.Message);
                        return 1;
                    }
                });
            } else if (command == "__write") {
                string path = args[3];
                return RunInImpersonation(hRestrictedToken, () => {
                    try {
                        using (StreamReader reader = new StreamReader(Console.OpenStandardInput(), System.Text.Encoding.UTF8))
                        using (FileStream fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None))
                        using (StreamWriter writer = new StreamWriter(fs, System.Text.Encoding.UTF8)) {
                            char[] buffer = new char[4096];
                            int bytesRead;
                            while ((bytesRead = reader.Read(buffer, 0, buffer.Length)) > 0) {
                                writer.Write(buffer, 0, bytesRead);
                            }
                        }
                        return 0;
                    } catch (Exception e) {
                        Console.Error.WriteLine(e.Message);
                        return 1;
                    }
                });
            }

            // 4. Setup Job Object for external process
            hJob = CreateJobObject(IntPtr.Zero, null);
            if (hJob != IntPtr.Zero) {
                JOBOBJECT_EXTENDED_LIMIT_INFORMATION limitInfo = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                limitInfo.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                int limitSize = Marshal.SizeOf(limitInfo);
                IntPtr pLimit = Marshal.AllocHGlobal(limitSize);
                try {
                    Marshal.StructureToPtr(limitInfo, pLimit, false);
                    SetInformationJobObject(hJob, JobObjectInfoClass.ExtendedLimitInformation, pLimit, (uint)limitSize);
                } finally {
                    Marshal.FreeHGlobal(pLimit);
                }
            }

            // 5. Launch Process
            STARTUPINFO si = new STARTUPINFO();
            si.cb = (uint)Marshal.SizeOf(si);
            si.dwFlags = STARTF_USESTDHANDLES;
            si.hStdInput = GetStdHandle(-10);
            si.hStdOutput = GetStdHandle(-11);
            si.hStdError = GetStdHandle(-12);

            string commandLine = "";
            for (int i = 2; i < args.Length; i++) {
                if (i > 2) commandLine += " ";
                commandLine += QuoteArgument(args[i]);
            }

            PROCESS_INFORMATION pi;
            if (!CreateProcessAsUser(hRestrictedToken, null, commandLine, IntPtr.Zero, IntPtr.Zero, true, CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT, IntPtr.Zero, cwd, ref si, out pi)) {
                Console.Error.WriteLine("Failed to create process. Error: " + Marshal.GetLastWin32Error());
                return 1;
            }

            try {
                if (hJob != IntPtr.Zero) {
                    AssignProcessToJobObject(hJob, pi.hProcess);
                }

                ResumeThread(pi.hThread);
                WaitForSingleObject(pi.hProcess, INFINITE);

                uint exitCode = 0;
                GetExitCodeProcess(pi.hProcess, out exitCode);
                return (int)exitCode;
            } finally {
                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);
            }
        } catch (Exception e) {
            Console.Error.WriteLine("Unexpected error: " + e.Message);
            return 1;
        } finally {
            if (hRestrictedToken != IntPtr.Zero) CloseHandle(hRestrictedToken);
            if (hToken != IntPtr.Zero) CloseHandle(hToken);
            if (hJob != IntPtr.Zero) CloseHandle(hJob);
            if (pSidsToDisable != IntPtr.Zero) Marshal.FreeHGlobal(pSidsToDisable);
            if (pSidsToRestrict != IntPtr.Zero) Marshal.FreeHGlobal(pSidsToRestrict);
            if (networkSid != IntPtr.Zero) LocalFree(networkSid);
            if (restrictedSid != IntPtr.Zero) LocalFree(restrictedSid);
            if (lowIntegritySid != IntPtr.Zero) LocalFree(lowIntegritySid);
        }
    }

    private static string QuoteArgument(string arg) {
        if (string.IsNullOrEmpty(arg)) return "\"\"";

        bool hasSpace = arg.IndexOfAny(new char[] { ' ', '\t' }) != -1;
        if (!hasSpace && arg.IndexOf('\"') == -1) return arg;

        // Windows command line escaping for arguments is complex.
        // Rule: Backslashes only need escaping if they precede a double quote or the end of the string.
        System.Text.StringBuilder sb = new System.Text.StringBuilder();
        sb.Append('\"');
        for (int i = 0; i < arg.Length; i++) {
            int backslashCount = 0;
            while (i < arg.Length && arg[i] == '\\') {
                backslashCount++;
                i++;
            }

            if (i == arg.Length) {
                // Escape backslashes before the closing double quote
                sb.Append('\\', backslashCount * 2);
            } else if (arg[i] == '\"') {
                // Escape backslashes before a literal double quote
                sb.Append('\\', backslashCount * 2 + 1);
                sb.Append('\"');
            } else {
                // Backslashes don't need escaping here
                sb.Append('\\', backslashCount);
                sb.Append(arg[i]);
            }
        }
        sb.Append('\"');
        return sb.ToString();
    }

    private static int RunInImpersonation(IntPtr hToken, Func<int> action) {
        using (WindowsIdentity.Impersonate(hToken)) {
            return action();
        }
    }
}
