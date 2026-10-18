# Windows PowerShell 5.1+ / PowerShell 7. No admin, global PATH edits, or restart.
[CmdletBinding()]
param(
    [string]$DshExe = $env:DSH_EXE,
    [string]$DshHome = $env:DSH_HOME,
    [string]$Profile = 'desktop',
    [string]$Version = $env:PURGE_VERSION,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
function Find-DshExecutable {
    if ($DshExe) {
        if (-not (Test-Path -LiteralPath $DshExe -PathType Leaf)) { throw 'DshExe does not exist.' }
        return (Resolve-Path -LiteralPath $DshExe).Path
    }
    $candidates = @()
    $candidates += @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -eq 'DeepSeek Harness' } | ForEach-Object { $_.Path })
    foreach ($key in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*')) {
        foreach ($entry in @(Get-ItemProperty $key -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'DeepSeek Harness' })) {
            if ($entry.InstallLocation) { $candidates += Join-Path $entry.InstallLocation 'DeepSeek Harness.exe' }
        }
    }
    foreach ($base in @($env:LOCALAPPDATA, $env:ProgramFiles)) {
        if ($base) {
            foreach ($suffix in @('Programs\DeepSeek Harness\DeepSeek Harness.exe', 'Programs\deepseek-harness\DeepSeek Harness.exe', 'DeepSeek Harness\DeepSeek Harness.exe')) {
                $candidates += Join-Path $base $suffix
            }
        }
    }
    $found = @($candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | ForEach-Object { (Resolve-Path -LiteralPath $_).Path } | Sort-Object -Unique)
    if ($found.Count -ne 1) { throw 'Cannot uniquely locate DSH Desktop. Run again with -DshExe "C:\path\DeepSeek Harness.exe".' }
    return $found[0]
}
$runtime = Find-DshExecutable
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('purge-bootstrap-' + [guid]::NewGuid().ToString('N'))
$names = @('ELECTRON_RUN_AS_NODE', 'DSH_HOME')
$previous = @{}
$previousProtocol = [Net.ServicePointManager]::SecurityProtocol
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    [void](New-Item -ItemType Directory -Path $temporary)
    $bootstrap = Join-Path $temporary 'bootstrap-install.mjs'
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 90 -Uri 'https://raw.githubusercontent.com/kingcharleslzy-ai/dsh-purge/master/scripts/bootstrap-install.mjs' -OutFile $bootstrap
    $env:ELECTRON_RUN_AS_NODE = '1'
    if ($DshHome) { $env:DSH_HOME = $DshHome }
    $arguments = @($bootstrap, "--profile=$Profile")
    if ($Version) { $arguments += "--version=$Version" }
    if ($DryRun) { $arguments += '--dry-run' }
    & $runtime @arguments
    if ($LASTEXITCODE -ne 0) { throw "Installer failed (exit $LASTEXITCODE). Keep the reported backup; do not clear lockfiles or disable verification." }
} finally {
    [Net.ServicePointManager]::SecurityProtocol = $previousProtocol
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
}
