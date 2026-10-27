param(
    [Parameter(Mandatory = $true)][int]$ProcessId,
    [Parameter(Mandatory = $true)][long]$CreationTimeMs
)
$ErrorActionPreference = 'Stop'
try {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SmokeProcessElevation {
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int id);
    [DllImport("kernel32.dll")] static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);
    [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr token, int kind, out int value, int length, out int returned);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    public static bool? Read(int id, long expectedCreationMs) {
        IntPtr process = OpenProcess(0x1000, false, id), token = IntPtr.Zero;
        try {
            long creation, exit, kernel, user;
            if (process == IntPtr.Zero || !GetProcessTimes(process, out creation, out exit, out kernel, out user)) return null;
            // CIM/JSON creation timestamps have millisecond precision; use the same handle for identity and token.
            if (creation / 10000 - 11644473600000L != expectedCreationMs) return null;
            if (!OpenProcessToken(process, 0x0008, out token)) return null;
            int elevated, returned;
            if (!GetTokenInformation(token, 20, out elevated, 4, out returned) || returned != 4) return null;
            return elevated != 0;
        } finally {
            if (token != IntPtr.Zero) CloseHandle(token);
            if (process != IntPtr.Zero) CloseHandle(process);
        }
    }
}
'@
    $elevated = [SmokeProcessElevation]::Read($ProcessId, $CreationTimeMs)
    if ($null -eq $elevated) { throw 'Unavailable' }
    @{ status = 'observed'; elevated = [bool]$elevated } | ConvertTo-Json -Compress
} catch {
    @{ status = 'unknown'; elevated = $null } | ConvertTo-Json -Compress
}
