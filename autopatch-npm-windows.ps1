<#
.SYNOPSIS
    Autopatch script to make npm invocations in scripts/lint.js cross-platform compatible.
    
.DESCRIPTION
    This script patches scripts/lint.js to use npm.cmd on Windows instead of npm.
    It inserts a helper function npmCmd() and replaces direct npm calls with it.
    
.NOTES
    Run this script on Windows to apply the patch.
    The script validates the patched file using node --check before writing.
#>

param(
    [switch]$DryRun,
    [string]$TargetFile = "scripts/lint.js"
)

$ErrorActionPreference = "Stop"

# Resolve absolute path
$TargetFile = Resolve-Path $TargetFile -ErrorAction Stop

Write-Host "Patching $TargetFile for Windows npm compatibility..."

# Read the original file
$originalContent = Get-Content -Path $TargetFile -Raw
$backupContent = $originalContent

# Define the helper function to insert (syntactically valid JavaScript)
# Note: In PowerShell, backticks inside single-quoted strings are literal
$helperLines = @(
    '',
    '// Cross-platform npm command helper for Windows compatibility',
    'function npmCmd(args) {',
    '  const bin = process.platform === ''win32'' ? ''npm.cmd'' : ''npm'';',
    '  return `${bin} ${args}`;',
    '}',
    ''
)
$helperBlock = $helperLines -join "`n"

# Check if helper already exists
if ($originalContent -match 'function npmCmd\(') {
    Write-Host "Helper function npmCmd already exists in $TargetFile. Skipping insertion."
} else {
    # Find the position after imports to insert the helper
    # Look for the last import statement line
    $lines = $originalContent -split "`n"
    $insertIndex = -1
    
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^\s*import\s+') {
            $insertIndex = $i
        }
    }
    
    if ($insertIndex -eq -1) {
        Write-Error "Could not find import statements in $TargetFile"
        exit 1
    }
    
    # Find the end of imports (first non-import, non-empty line after imports)
    for ($j = $insertIndex + 1; $j -lt $lines.Count; $j++) {
        $line = $lines[$j].Trim()
        if ($line -ne '' -and $line -notmatch '^\s*import\s+' -and $line -notmatch '^\s*\}\s*from\s+') {
            $insertIndex = $j
            break
        }
    }
    
    # Insert the helper after imports
    $newLines = @()
    for ($i = 0; $i -lt $insertIndex; $i++) {
        $newLines += $lines[$i]
    }
    $newLines += $helperLines
    for ($i = $insertIndex; $i -lt $lines.Count; $i++) {
        $newLines += $lines[$i]
    }
    
    $originalContent = $newLines -join "`n"
    Write-Host "Inserted npmCmd helper function."
}

# Replace execSync('npm ...') and execSync("npm ...") with execSync(npmCmd('...'))
# Pattern for single quotes: execSync('npm run lint') -> execSync(npmCmd('run lint'))
$originalContent = $originalContent -replace "execSync\('npm\s+([^']+)'\)", "execSync(npmCmd('`$1'))"

# Pattern for double quotes: execSync("npm run lint") -> execSync(npmCmd('run lint'))
$originalContent = $originalContent -replace 'execSync\("npm\s+([^"]+)"\)', "execSync(npmCmd('`$1'))"

# Also handle runCommand('npm ...') pattern which is used in this file
$originalContent = $originalContent -replace "runCommand\('npm\s+([^']+)'\)", "runCommand(npmCmd('`$1'))"
$originalContent = $originalContent -replace 'runCommand\("npm\s+([^"]+)"\)', "runCommand(npmCmd('`$1'))"

if ($DryRun) {
    Write-Host "`n--- DRY RUN: Patched content ---"
    Write-Host $originalContent
    Write-Host "--- END DRY RUN ---`n"
    exit 0
}

# Write patched content to a temp file for validation
$tempFile = [System.IO.Path]::GetTempFileName() + ".js"
Set-Content -Path $tempFile -Value $originalContent -NoNewline

# Validate syntax using node --check
Write-Host "Validating patched file syntax..."
try {
    $nodeCheck = & node --check $tempFile 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Syntax validation failed!" -ForegroundColor Red
        Write-Host "Node output:`n$nodeCheck" -ForegroundColor Yellow
        Write-Host "Restoring original file..."
        Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
        exit 1
    }
    Write-Host "Syntax validation passed." -ForegroundColor Green
} catch {
    Write-Host "Failed to run node --check: $_" -ForegroundColor Red
    Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
    exit 1
}

# Write the validated content back to the original file
Set-Content -Path $TargetFile -Value $originalContent -NoNewline
Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue

Write-Host "Successfully patched $TargetFile for Windows npm compatibility."
Write-Host "Run 'npm run format' to verify the changes."
