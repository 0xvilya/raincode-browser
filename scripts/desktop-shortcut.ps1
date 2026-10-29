param([Parameter(Mandatory=$true)][string]$Executable)
$taskExecutable = (Resolve-Path -LiteralPath $Executable).Path
if (-not $taskExecutable.EndsWith('.exe', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Expected a packaged Windows executable.' }
$taskDesktop = [Environment]::GetFolderPath('Desktop')
$taskShell = New-Object -ComObject WScript.Shell
$taskShortcutPath = Join-Path $taskDesktop 'RainCode Browser.lnk'
$taskShortcut = $taskShell.CreateShortcut($taskShortcutPath)
$taskShortcut.TargetPath = $taskExecutable
$taskShortcut.WorkingDirectory = Split-Path -Parent $taskExecutable
$taskShortcut.Description = 'RainCode Browser — Chromium developer browser'
$taskIcon = Join-Path $taskShortcut.WorkingDirectory 'raincode.ico'
if (Test-Path -LiteralPath $taskIcon) { $taskShortcut.IconLocation = $taskIcon } else { $taskShortcut.IconLocation = "$taskExecutable,0" }
$taskShortcut.Save()
Write-Output $taskShortcutPath
