Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$bitmap = New-Object System.Drawing.Bitmap(100, 100)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::Blue)
$graphics.Dispose()

[System.Windows.Forms.Clipboard]::SetImage($bitmap)
Write-Output 'Blue test image copied to clipboard'
