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
    // --- P/Invoke Constants and Structures ---
    private const int JobObjectExtendedLimitInformation = 9;
    private const int JobObjectNetRateControlInformation = 32;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const uint JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION = 0x00000400;
    private const uint JOB_OBJECT_LIMIT_ACTIVE_PROCESS = 0x00000008;
    
    private const int TokenIntegrityLevel = 25;
    private const uint SE_GROUP_INTEGRITY = 0x00000020;
    private const uint TOKEN_ALL_ACCESS = 0xF01FF;
    private const uint DISABLE_MAX_PRIVILEGE = 0x1;
    
    private const int SE_FILE_OBJECT = 1;
    private const uint LABEL_SECURITY_INFORMATION = 0x00000010;

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

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_NET_RATE_CONTROL_INFORMATION {
        public ulong MaxBandwidth;
        public uint ControlFlags;
        public byte DscpTag;
    }

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

    [StructLayout(LayoutKind.Sequential)]
    struct SID_AND_ATTRIBUTES {
        public IntPtr Sid;
        public uint Attributes;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct TOKEN_MANDATORY_LABEL {
        public SID_AND_ATTRIBUTES Label;
    }

    // --- Kernel32 P/Invokes ---
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetInformationJobObject(IntPtr hJob, int JobObjectInfoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint ResumeThread(IntPtr hThread);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr GetCurrentProcess();

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr GetStdHandle(int nStdHandle);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern uint GetLongPathName(string lpszShortPath, [Out] StringBuilder lpszLongPath, uint cchBuffer);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr LocalFree(IntPtr hMem);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

    // --- Advapi32 P/Invokes ---
    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool DuplicateTokenEx(IntPtr hExistingToken, uint dwDesiredAccess, IntPtr lpTokenAttributes, uint ImpersonationLevel, uint TokenType, out IntPtr phNewToken);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool CreateRestrictedToken(IntPtr ExistingTokenHandle, uint Flags, uint DisableSidCount, IntPtr SidsToDisable, uint DeletePrivilegeCount, IntPtr PrivilegesToDelete, uint RestrictedSidCount, IntPtr SidsToRestrict, out IntPtr NewTokenHandle);

    [DllImport("advapi32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    static extern bool CreateProcessAsUser(IntPtr hToken, string lpApplicationName, string lpCommandLine, IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles, uint dwCreationFlags, IntPtr lpEnvironment, string lpCurrentDirectory, ref STARTUPINFO lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool ImpersonateLoggedOnUser(IntPtr hToken);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool RevertToSelf();

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern bool ConvertStringSidToSid(string StringSid, out IntPtr ptrSid);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool SetTokenInformation(IntPtr TokenHandle, int TokenInformationClass, IntPtr TokenInformation, uint TokenInformationLength);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string StringSecurityDescriptor, uint StringSDRevision, out IntPtr SecurityDescriptor, out uint SecurityDescriptorSize);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern uint SetNamedSecurityInfo(string pObjectName, int ObjectType, uint SecurityInfo, IntPtr psidOwner, IntPtr psidGroup, IntPtr pDacl, IntPtr pSacl);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool GetSecurityDescriptorSacl(IntPtr pSecurityDescriptor, out bool lpbSaclPresent, out IntPtr pSacl, out bool lpbSaclDefaulted);

    // --- Main Entry Point ---
    static int Main(string[] args) {
        if (args.Length < 3) {
            Console.Error.WriteLine("Usage: GeminiSandbox.exe <network:0|1> <cwd> [--forbidden-manifest <path>] [--allowed-manifest <path>] <command> [args...]");
            Console.Error.WriteLine("Internal commands: __read <path>, __write <path>");
            return 1;
        }

        bool networkAccess = args[0] == "1";
        string cwd = args[1];
        HashSet<string> forbiddenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        HashSet<string> allowedPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        int argIndex = 2;

        // 1. Parse Command Line Arguments & Manifests
        while (argIndex < args.Length) {
            if (args[argIndex] == "--forbidden-manifest") {
                if (argIndex + 1 < args.Length) {
                    ParseManifest(args[argIndex + 1], forbiddenPaths);
                    argIndex += 2;
                } else {
                    break;
                }
            } else if (args[argIndex] == "--allowed-manifest") {
                if (argIndex + 1 < args.Length) {
                    ParseManifest(args[argIndex + 1], allowedPaths);
                    argIndex += 2;
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        
        // 2. Apply Bulk ACLs
        ApplyBulkAcls(allowedPaths, forbiddenPaths);

        if (argIndex >= args.Length) {
            Console.Error.WriteLine("Error: Missing command");
            return 1;
        }

        string command = args[argIndex];

        IntPtr hToken = IntPtr.Zero;
        IntPtr hRestrictedToken = IntPtr.Zero;
        IntPtr hJob = IntPtr.Zero;
        PROCESS_INFORMATION pi = new PROCESS_INFORMATION();

        try {
            // 3. Duplicate Primary Token and Create Restricted Token
            if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ALL_ACCESS, out hToken)) {
                Console.Error.WriteLine("Error: OpenProcessToken failed (" + Marshal.GetLastWin32Error() + ")");
                return 1;
            }

            if (!CreateRestrictedToken(hToken, DISABLE_MAX_PRIVILEGE, 0, IntPtr.Zero, 0, IntPtr.Zero, 0, IntPtr.Zero, out hRestrictedToken)) {
                Console.Error.WriteLine("Error: CreateRestrictedToken failed (" + Marshal.GetLastWin32Error() + ")");
                return 1;
            }

            // 4. Lower Integrity Level to "Low" (S-1-16-4096)
            IntPtr lowIntegritySid = IntPtr.Zero;
            if (ConvertStringSidToSid("S-1-16-4096", out lowIntegritySid)) {
                TOKEN_MANDATORY_LABEL tml = new TOKEN_MANDATORY_LABEL();
                tml.Label.Sid = lowIntegritySid;
                tml.Label.Attributes = SE_GROUP_INTEGRITY;
                int tmlSize = Marshal.SizeOf(tml);
                IntPtr pTml = Marshal.AllocHGlobal(tmlSize);
                try {
                    Marshal.StructureToPtr(tml, pTml, false);
                    if (!SetTokenInformation(hRestrictedToken, TokenIntegrityLevel, pTml, (uint)tmlSize)) {
                        Console.Error.WriteLine("Error: SetTokenInformation failed (" + Marshal.GetLastWin32Error() + ")");
                        return 1;
                    }
                } finally {
                    Marshal.FreeHGlobal(pTml);
                }
            }

            // 5. Setup Job Object
            hJob = CreateJobObject(IntPtr.Zero, null);
            if (hJob == IntPtr.Zero) {
                Console.Error.WriteLine("Error: CreateJobObject failed (" + Marshal.GetLastWin32Error() + ")");
                return 1;
            }

            JOBOBJECT_EXTENDED_LIMIT_INFORMATION jobLimits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            jobLimits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION;

            IntPtr lpJobLimits = Marshal.AllocHGlobal(Marshal.SizeOf(jobLimits));
            try {
                Marshal.StructureToPtr(jobLimits, lpJobLimits, false);
                if (!SetInformationJobObject(hJob, JobObjectExtendedLimitInformation, lpJobLimits, (uint)Marshal.SizeOf(jobLimits))) {
                    Console.Error.WriteLine("Error: SetInformationJobObject(Limits) failed (" + Marshal.GetLastWin32Error() + ")");
                    return 1;
                }
            } finally {
                Marshal.FreeHGlobal(lpJobLimits);
            }

            if (!networkAccess) {
                JOBOBJECT_NET_RATE_CONTROL_INFORMATION netLimits = new JOBOBJECT_NET_RATE_CONTROL_INFORMATION();
                netLimits.MaxBandwidth = 1;
                netLimits.ControlFlags = 0x1 | 0x2; // ENABLE | MAX_BANDWIDTH
                netLimits.DscpTag = 0;

                IntPtr lpNetLimits = Marshal.AllocHGlobal(Marshal.SizeOf(netLimits));
                try {
                    Marshal.StructureToPtr(netLimits, lpNetLimits, false);
                    if (!SetInformationJobObject(hJob, JobObjectNetRateControlInformation, lpNetLimits, (uint)Marshal.SizeOf(netLimits))) {
                        Console.Error.WriteLine("Warning: SetInformationJobObject(NetRate) failed (" + Marshal.GetLastWin32Error() + "). Network might not be throttled.");
                    }
                } finally {
                    Marshal.FreeHGlobal(lpNetLimits);
                }
            }

            // 6. Handle Internal Commands or External Process
            if (command == "__read") {
                if (argIndex + 1 >= args.Length) {
                    Console.Error.WriteLine("Error: Missing path for __read");
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
                    Console.Error.WriteLine("Error: Missing path for __write");
                    return 1;
                }
                string path = args[argIndex + 1];
                CheckForbidden(path, forbiddenPaths);

                try {
                    using (MemoryStream ms = new MemoryStream()) {
                        using (Stream stdin = Console.OpenStandardInput()) {
                            stdin.CopyTo(ms);
                        }

                        return RunInImpersonation(hRestrictedToken, () => {
                            using (FileStream fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None)) {
                                ms.Position = 0;
                                ms.CopyTo(fs);
                            }
                            return 0;
                        });
                    }
                } catch (Exception e) {
                    Console.Error.WriteLine("Error during __write: " + e.Message);
                    return 1;
                }
            }

            // 7. Execute External Process
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

            // Creation Flags: 0x01000000 (CREATE_BREAKAWAY_FROM_JOB) to allow job assignment if parent is in job
            // 0x00000004 (CREATE_SUSPENDED) to prevent the process from executing before being placed in the job
            uint creationFlags = 0x01000000 | 0x00000004;
            if (!CreateProcessAsUser(hRestrictedToken, null, commandLine, IntPtr.Zero, IntPtr.Zero, true, creationFlags, IntPtr.Zero, cwd, ref si, out pi)) {
                int err = Marshal.GetLastWin32Error();
                Console.Error.WriteLine("Error: CreateProcessAsUser failed (" + err + ") Command: " + commandLine);
                return 1;
            }

            if (!AssignProcessToJobObject(hJob, pi.hProcess)) {
                int err = Marshal.GetLastWin32Error();
                Console.Error.WriteLine("Error: AssignProcessToJobObject failed (" + err + ") Command: " + commandLine);
                TerminateProcess(pi.hProcess, 1);
                return 1;
            }

            ResumeThread(pi.hThread);

            if (WaitForSingleObject(pi.hProcess, 0xFFFFFFFF) == 0xFFFFFFFF) {
                int err = Marshal.GetLastWin32Error();
                Console.Error.WriteLine("Error: WaitForSingleObject failed (" + err + ")");
            }
            
            uint exitCode = 0;
            if (!GetExitCodeProcess(pi.hProcess, out exitCode)) {
                int err = Marshal.GetLastWin32Error();
                Console.Error.WriteLine("Error: GetExitCodeProcess failed (" + err + ")");
                return 1;
            }

            return (int)exitCode;
        } finally {
            if (hToken != IntPtr.Zero) CloseHandle(hToken);
            if (hRestrictedToken != IntPtr.Zero) CloseHandle(hRestrictedToken);
            if (hJob != IntPtr.Zero) CloseHandle(hJob);
            if (pi.hProcess != IntPtr.Zero) CloseHandle(pi.hProcess);
            if (pi.hThread != IntPtr.Zero) CloseHandle(pi.hThread);
        }
    }

    // --- Helper Methods ---

    private static void ParseManifest(string manifestPath, HashSet<string> paths) {
        if (!File.Exists(manifestPath)) return;
        foreach (string line in File.ReadAllLines(manifestPath, Encoding.UTF8)) {
            if (!string.IsNullOrWhiteSpace(line)) {
                paths.Add(GetNormalizedPath(line.Trim()));
            }
        }
    }

    private static void ApplyBulkAcls(HashSet<string> allowedPaths, HashSet<string> forbiddenPaths) {
        SecurityIdentifier lowSid = new SecurityIdentifier("S-1-16-4096");

        // 1. Apply Deny Rules
        foreach (string path in forbiddenPaths) {
            try {
                if (File.Exists(path)) {
                    FileSecurity fs = File.GetAccessControl(path);
                    fs.AddAccessRule(new FileSystemAccessRule(lowSid, FileSystemRights.FullControl, AccessControlType.Deny));
                    File.SetAccessControl(path, fs);
                } else if (Directory.Exists(path)) {
                    DirectorySecurity ds = Directory.GetAccessControl(path);
                    ds.AddAccessRule(new FileSystemAccessRule(lowSid, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Deny));
                    Directory.SetAccessControl(path, ds);
                }
            } catch (Exception e) {
                Console.Error.WriteLine("Warning: Failed to apply deny ACL to " + path + ": " + e.Message);
            }
        }

        // 2. Pre-calculate Security Descriptors for Allow Rules
        IntPtr pSdDir = IntPtr.Zero;
        IntPtr pSdFile = IntPtr.Zero;
        IntPtr pSaclDir = IntPtr.Zero;
        IntPtr pSaclFile = IntPtr.Zero;
        uint sdSize = 0;
        bool saclPresent = false;
        bool saclDefaulted = false;

        if (ConvertStringSecurityDescriptorToSecurityDescriptor("S:(ML;OICI;NW;;;LW)", 1, out pSdDir, out sdSize)) {
            GetSecurityDescriptorSacl(pSdDir, out saclPresent, out pSaclDir, out saclDefaulted);
        }
        if (ConvertStringSecurityDescriptorToSecurityDescriptor("S:(ML;;NW;;;LW)", 1, out pSdFile, out sdSize)) {
            GetSecurityDescriptorSacl(pSdFile, out saclPresent, out pSaclFile, out saclDefaulted);
        }

        // 3. Apply Allow Rules
        foreach (string path in allowedPaths) {
            try {
                bool isDir = Directory.Exists(path);
                if (isDir) {
                    DirectorySecurity ds = Directory.GetAccessControl(path);
                    ds.AddAccessRule(new FileSystemAccessRule(lowSid, FileSystemRights.Modify, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
                    Directory.SetAccessControl(path, ds);
                } else if (File.Exists(path)) {
                    FileSecurity fs = File.GetAccessControl(path);
                    fs.AddAccessRule(new FileSystemAccessRule(lowSid, FileSystemRights.Modify, AccessControlType.Allow));
                    File.SetAccessControl(path, fs);
                } else {
                    continue;
                }

                // Ensure we use the 8.3 long-name equivalent for robust security checks per guidelines
                StringBuilder sb = new StringBuilder(1024);
                GetLongPathName(path, sb, 1024);
                string longPath = sb.ToString();
                
                IntPtr pSacl = isDir ? pSaclDir : pSaclFile;
                if (pSacl != IntPtr.Zero) {
                    uint result = SetNamedSecurityInfo(longPath, SE_FILE_OBJECT, LABEL_SECURITY_INFORMATION, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, pSacl);
                    if (result != 0) {
                        Console.Error.WriteLine("Warning: SetNamedSecurityInfo failed for " + longPath + " with error " + result);
                    }
                }
            } catch (Exception e) {
                Console.Error.WriteLine("Warning: Failed to apply allow ACL to " + path + ": " + e.Message);
            }
        }

        if (pSdDir != IntPtr.Zero) LocalFree(pSdDir);
        if (pSdFile != IntPtr.Zero) LocalFree(pSdFile);
    }

    private static int RunInImpersonation(IntPtr hToken, Func<int> action) {
        if (!ImpersonateLoggedOnUser(hToken)) {
            Console.Error.WriteLine("Error: ImpersonateLoggedOnUser failed (" + Marshal.GetLastWin32Error() + ")");
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