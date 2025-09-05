#!/usr/bin/env pwsh

Write-Host "Building GeminiProcessor..." -ForegroundColor Green

# Clean previous build
$publishDir = "bin/Release/net8.0/win-x64/publish"
if (Test-Path $publishDir) {
    Remove-Item $publishDir -Recurse -Force
    Write-Host "Cleaned previous build" -ForegroundColor Yellow
}

# Build and publish as single file executable
Write-Host "Building executable..." -ForegroundColor Blue
$buildResult = dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:PublishReadyToRun=true -p:PublishTrimmed=true

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

# Copy executable to expected location
$tempDir = "../temp"
if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir | Out-Null
}

$sourceExe = "bin/Release/net8.0/win-x64/publish/GeminiProcessor.exe"
$targetExe = "GeminiProcessor.exe"

if (Test-Path $sourceExe) {
    Copy-Item $sourceExe $targetExe -Force
    Write-Host "Build completed successfully!" -ForegroundColor Green
    Write-Host "Executable: $targetExe" -ForegroundColor Cyan
    
    # Show file size
    $fileSize = (Get-Item $targetExe).Length
    $fileSizeMB = [math]::Round($fileSize / 1MB, 2)
    Write-Host "File size: $fileSizeMB MB" -ForegroundColor Gray
} else {
    Write-Host "Error: Built executable not found at $sourceExe" -ForegroundColor Red
    exit 1
}