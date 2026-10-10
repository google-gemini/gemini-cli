# Tifo Studio installer for Windows — no admin rights needed.
#
#   irm https://raw.githubusercontent.com/Anwars3/gemini-cli/main/tifo-studio/install/install.ps1 | iex
#
# Installs into %LOCALAPPDATA%\TifoStudio (override with $env:TIFO_HOME), downloads a portable
# Node.js if needed, the free Piper neural voice engine + British voices, creates Desktop and
# Start-menu shortcuts and starts the app in your browser. Re-run any time to update.
#
# Options (environment variables): TIFO_HOME, TIFO_REF (git branch), TIFO_NO_VOICE=1,
# TIFO_NO_START=1, TIFO_FORCE_NODE=1

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # makes Invoke-WebRequest much faster on PowerShell 5
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Repo = 'Anwars3/gemini-cli'
$Refs = @($env:TIFO_REF, 'main', 'claude/focused-meitner-oqnrj2') | Where-Object { $_ }
$Dir = if ($env:TIFO_HOME) { $env:TIFO_HOME } else { Join-Path $env:LOCALAPPDATA 'TifoStudio' }
$PiperUrl = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip'
$HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main'
$Voices = @(
  'en/en_GB/alan/medium/en_GB-alan-medium',
  'en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium'
)

function Step($m) { Write-Host "  > $m" -ForegroundColor Yellow }
function Ok($m) { Write-Host "  OK $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  !  $m" -ForegroundColor Red }
function Get-File($url, $out) { Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing }

Write-Host ''
Write-Host '  TIFO STUDIO installer' -ForegroundColor Yellow
Write-Host ''
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$Dir = (Resolve-Path $Dir).Path
$Tmp = Join-Path ([IO.Path]::GetTempPath()) ('tifo-' + [Guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

try {
  # ---- 1. app files ----
  $Src = $null
  if ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot '..\server.js'))) {
    $Src = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    Step "Installing from local folder $Src"
  } else {
    $Ref = $null
    foreach ($r in $Refs) {
      try {
        Invoke-WebRequest -Uri "https://raw.githubusercontent.com/$Repo/$r/tifo-studio/server.js" -Method Head -UseBasicParsing | Out-Null
        $Ref = $r
        break
      } catch { }
    }
    if (-not $Ref) { throw "Could not find Tifo Studio on GitHub ($Repo)." }
    Step "Downloading Tifo Studio ($Ref)..."
    $zip = Join-Path $Tmp 'src.zip'
    Get-File "https://codeload.github.com/$Repo/zip/refs/heads/$Ref" $zip
    # extract only the tifo-studio folder (the repository has thousands of other files)
    $Src = Join-Path $Tmp 'tifo-studio'
    $z = [IO.Compression.ZipFile]::OpenRead($zip)
    try {
      foreach ($e in $z.Entries) {
        $i = $e.FullName.IndexOf('/tifo-studio/')
        if ($i -lt 0 -or $e.FullName.EndsWith('/')) { continue }
        $dest = Join-Path $Src ($e.FullName.Substring($i + 13).Replace('/', '\'))
        New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $dest, $true)
      }
    } finally { $z.Dispose() }
    if (-not (Test-Path (Join-Path $Src 'server.js'))) { throw 'Download did not contain tifo-studio.' }
  }
  if ($Src -ne $Dir) {
    foreach ($d in 'public', 'install') { $p = Join-Path $Dir $d; if (Test-Path $p) { Remove-Item -Recurse -Force $p } }
    foreach ($item in 'public', 'install', 'server.js', 'package.json', 'README.md') {
      $p = Join-Path $Src $item
      if (Test-Path $p) { Copy-Item -Recurse -Force $p $Dir }
    }
  }
  Ok "App files in $Dir"

  # ---- 2. Node.js ----
  $Node = $null
  $LocalNode = Join-Path $Dir 'node\node.exe'
  $sys = Get-Command node -ErrorAction SilentlyContinue
  if ($sys -and -not $env:TIFO_FORCE_NODE) {
    try { if ([int](& $sys.Source -p "process.versions.node.split('.')[0]") -ge 18) { $Node = $sys.Source } } catch { }
  }
  if (-not $Node -and (Test-Path $LocalNode)) { $Node = $LocalNode }
  if (-not $Node) {
    Step 'Downloading Node.js (portable, no admin needed)...'
    $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing
    $ver = ($index | Where-Object { $_.lts } | Select-Object -First 1).version   # piping the variable enumerates the array
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $nz = Join-Path $Tmp 'node.zip'
    Get-File "https://nodejs.org/dist/$ver/node-$ver-win-$arch.zip" $nz
    [IO.Compression.ZipFile]::ExtractToDirectory($nz, $Tmp)
    $nd = Join-Path $Dir 'node'
    if (Test-Path $nd) { Remove-Item -Recurse -Force $nd }
    Move-Item (Join-Path $Tmp "node-$ver-win-$arch") $nd
    $Node = $LocalNode
  }
  Ok ('Node.js ' + (& $Node -v))

  # ---- 3. AI voice (Piper) ----
  if (-not $env:TIFO_NO_VOICE) {
    $tts = Join-Path $Dir 'tts'
    $vdir = Join-Path $tts 'voices'
    New-Item -ItemType Directory -Force -Path $vdir | Out-Null
    $piperExe = Join-Path $tts 'piper\piper.exe'
    if (-not (Test-Path $piperExe)) {
      Step 'Downloading Piper (free neural text-to-speech)...'
      try {
        $pd = Join-Path $tts 'piper'
        if (Test-Path $pd) { Remove-Item -Recurse -Force $pd }
        $pz = Join-Path $Tmp 'piper.zip'
        Get-File $PiperUrl $pz
        [IO.Compression.ZipFile]::ExtractToDirectory($pz, $tts)
      } catch { Warn "Piper download failed: $_" }
    }
    foreach ($v in $Voices) {
      $name = $v.Split('/')[-1]
      $onnx = Join-Path $vdir "$name.onnx"
      if (Test-Path $onnx) { continue }
      Step "Downloading voice $name (about 60 MB)..."
      try {
        Get-File "$HF/$v.onnx.json" "$onnx.json"
        Get-File "$HF/$v.onnx" "$onnx.part"
        Move-Item -Force "$onnx.part" $onnx
      } catch {
        Warn "Could not download $name."
        Remove-Item "$onnx*" -Force -ErrorAction SilentlyContinue
      }
    }
    if (-not (Get-ChildItem $vdir -Filter *.onnx -ErrorAction SilentlyContinue)) {
      Step 'Trying the backup voice source...'
      try {
        $vt = Join-Path $Tmp 'voice.tar.gz'
        Get-File 'https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-en-gb-alan-low.tar.gz' $vt
        tar -xzf $vt -C $vdir
        Remove-Item (Join-Path $vdir 'MODEL_CARD') -ErrorAction SilentlyContinue
      } catch { Warn 'No neural voice installed.' }
    }
    if (Test-Path $piperExe) {
      $model = Get-ChildItem $vdir -Filter *.onnx | Select-Object -First 1
      $wav = Join-Path $Tmp 't.wav'
      if ($model) {
        try { 'Testing.' | & $piperExe --model $model.FullName --output_file $wav 2>&1 | Out-Null } catch { }
      }
      if ((Test-Path $wav) -and (Get-Item $wav).Length -gt 1000) { Ok 'AI voice ready' }
      else { Warn 'Piper could not run on this PC - the built-in Windows voices will be used instead.' }
    }
  }

  # ---- 4. launcher + shortcuts ----
  $cmd = Join-Path $Dir 'Start Tifo Studio.cmd'
  $nodeCmd = if ($Node -eq $LocalNode) { '"%~dp0node\node.exe"' } else { 'node' }
  Set-Content -Path $cmd -Encoding ASCII -Value "@echo off`r`ntitle Tifo Studio`r`ncd /d `"%~dp0`"`r`necho Tifo Studio is running - close this window to stop it.`r`n$nodeCmd server.js --open`r`npause`r`n"
  $places = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')) | Where-Object { $_ }
  foreach ($place in $places) {
    try {
      $ws = New-Object -ComObject WScript.Shell
      $lnk = $ws.CreateShortcut((Join-Path $place 'Tifo Studio.lnk'))
      $lnk.TargetPath = $cmd
      $lnk.WorkingDirectory = $Dir
      $lnk.IconLocation = "$env:SystemRoot\System32\imageres.dll,18"
      $lnk.Save()
    } catch { }
  }
  Ok 'Shortcuts: Desktop and Start menu -> Tifo Studio'
  Write-Host ''
  Ok "Tifo Studio is installed in $Dir"
  if (-not $env:TIFO_NO_START) {
    Step 'Starting... your browser will open at http://localhost:5173'
    Start-Process -FilePath $cmd -WorkingDirectory $Dir
  }
} finally {
  Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
