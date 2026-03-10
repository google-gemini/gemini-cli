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

        // 1. Setup Token
        IntPtr hCurrentProcess = GetCurrentProcess();
        IntPtr hToken;
        if (!OpenProcessToken(hCurrentProcess, TOKEN_DUPLICATE | TOKEN_QUERY | TOKEN_ASSIGN_PRIMARY | TOKEN_ADJUST_DEFAULT, out hToken)) {
            Console.Error.WriteLine("Failed to open process token");
            return 1;
        }

        IntPtr hRestrictedToken;
        IntPtr pSidsToDisable = IntPtr.Zero;
        uint sidCount = 0;

        IntPtr pSidsToRestrict = IntPtr.Zero;
        uint restrictCount = 0;

        // "networkAccess == false" implies Strict Sandbox Level 1.
        // In Strict mode, we strip the Network SID and apply the Restricted Code SID.
        // This blocks network access and restricts file reads, but requires cmd.exe.
        if (!networkAccess) {
            IntPtr networkSid;
            if (ConvertStringSidToSid("S-1-5-2", out networkSid)) {
                sidCount = 1;
                int saaSize = Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES));
                pSidsToDisable = Marshal.AllocHGlobal(saaSize);
                SID_AND_ATTRIBUTES saa = new SID_AND_ATTRIBUTES();
                saa.Sid = networkSid;
                saa.Attributes = 0;
                Marshal.StructureToPtr(saa, pSidsToDisable, false);
            }

            IntPtr restrictedSid;
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
        // If networkAccess == true, we are in Elevated mode (Level 2).
        // We only strip privileges (DISABLE_MAX_PRIVILEGE), allowing network and powershell.

        if (!CreateRestrictedToken(hToken, DISABLE_MAX_PRIVILEGE, sidCount, pSidsToDisable, 0, IntPtr.Zero, restrictCount, pSidsToRestrict, out hRestrictedToken)) {
            Console.Error.WriteLine("Failed to create restricted token");
            return 1;
        }

        // 2. Set Integrity Level to Low
        IntPtr lowIntegritySid;
        if (ConvertStringSidToSid("S-1-16-4096", out lowIntegritySid)) {
            TOKEN_MANDATORY_LABEL tml = new TOKEN_MANDATORY_LABEL();
            tml.Label.Sid = lowIntegritySid;
            tml.Label.Attributes = SE_GROUP_INTEGRITY;
            int tmlSize = Marshal.SizeOf(tml);
            IntPtr pTml = Marshal.AllocHGlobal(tmlSize);
            Marshal.StructureToPtr(tml, pTml, false);
            SetTokenInformation(hRestrictedToken, TokenIntegrityLevel, pTml, (uint)tmlSize);
            Marshal.FreeHGlobal(pTml);
        }

        // 3. Handle Internal Commands or External Process
        if (command == "__read") {
            string path = args[3];
            return RunInImpersonation(hRestrictedToken, () => {
                try {
                    Console.Write(File.ReadAllText(path));
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
                    using (StreamReader reader = new StreamReader(Console.OpenStandardInput()))
                    using (StreamWriter writer = new StreamWriter(File.Create(path))) {
                        writer.Write(reader.ReadToEnd());
                    }
                    return 0;
                } catch (Exception e) {
                    Console.Error.WriteLine(e.Message);
                    return 1;
                }
            });
        }

        // 4. Setup Job Object for external process
        IntPtr hJob = CreateJobObject(IntPtr.Zero, null);
        if (hJob != IntPtr.Zero) {
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION limitInfo = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            limitInfo.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            int limitSize = Marshal.SizeOf(limitInfo);
            IntPtr pLimit = Marshal.AllocHGlobal(limitSize);
            Marshal.StructureToPtr(limitInfo, pLimit, false);
            SetInformationJobObject(hJob, JobObjectInfoClass.ExtendedLimitInformation, pLimit, (uint)limitSize);
            Marshal.FreeHGlobal(pLimit);
        }

        // 5. Launch Process
        STARTUPINFO si = new STARTUPINFO();
        si.cb = (uint)Marshal.SizeOf(si);
        si.dwFlags = STARTF_USESTDHANDLES;
        si.hStdInput = GetStdHandle(-10);
        si.hStdOutput = GetStdHandle(-11);
        si.hStdError = GetStdHandle(-12);

        string commandLine = string.Join(" ", args, 2, args.Length - 2);
        PROCESS_INFORMATION pi;
        if (!CreateProcessAsUser(hRestrictedToken, null, commandLine, IntPtr.Zero, IntPtr.Zero, true, CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT, IntPtr.Zero, cwd, ref si, out pi)) {
            Console.Error.WriteLine("Failed to create process. Error: " + Marshal.GetLastWin32Error());
            return 1;
        }

        if (hJob != IntPtr.Zero) {
            AssignProcessToJobObject(hJob, pi.hProcess);
        }

        ResumeThread(pi.hThread);
        WaitForSingleObject(pi.hProcess, INFINITE);

        uint exitCode = 0;
        GetExitCodeProcess(pi.hProcess, out exitCode);

        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        CloseHandle(hRestrictedToken);
        CloseHandle(hToken);
        if (hJob != IntPtr.Zero) CloseHandle(hJob);

        return (int)exitCode;
    }

    private static int RunInImpersonation(IntPtr hToken, Func<int> action) {
        WindowsIdentity.Impersonate(hToken);
        int result = action();
        return result;
    }
}
