@echo off
echo Building GeminiProcessor...

REM Clean previous build
if exist "bin\Release\net8.0\win-x64\publish" (
    rmdir /s /q "bin\Release\net8.0\win-x64\publish"
)

REM Build and publish as single file executable
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:PublishReadyToRun=true -p:PublishTrimmed=true

if %ERRORLEVEL% NEQ 0 (
    echo Build failed!
    exit /b 1
)

REM Copy executable to expected location
if not exist "..\temp" mkdir "..\temp"
copy "bin\Release\net8.0\win-x64\publish\GeminiProcessor.exe" "GeminiProcessor.exe"

echo Build completed successfully!
echo Executable: GeminiProcessor.exe
pause