# Run on Windows with both Windows PowerShell 5.1 and PowerShell 7.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root 'scripts\install.ps1'
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('purge-wrapper-' + [guid]::NewGuid().ToString('N'))
$fixtureHome = Join-Path $temporary ('space ' + [char]0x4e2d + [char]0x6587)
$node = (Get-Command node -ErrorAction Stop).Source
[void](New-Item -ItemType Directory -Path $fixtureHome -Force)
$initialHome = $env:DSH_HOME
$initialElectron = $env:ELECTRON_RUN_AS_NODE
$initialPath = $env:PATH
$initialProtocol = [Net.ServicePointManager]::SecurityProtocol
function Assert([bool]$condition, [string]$message) { if (-not $condition) { throw $message } }
$script:downloadFail = $false
$script:exitCode = 0
function Invoke-WebRequest {
    param([switch]$UseBasicParsing, $TimeoutSec, $Uri, $OutFile)
    if ($script:downloadFail) { throw 'fixture download unavailable' }
    $javascript = 'import fs from "node:fs";fs.writeFileSync(process.env.DSH_HOME+"/called.json",JSON.stringify({args:process.argv.slice(2),electron:process.env.ELECTRON_RUN_AS_NODE}));process.exit(' + $script:exitCode + ');'
    [IO.File]::WriteAllText($OutFile, $javascript)
}
try {
    $env:DSH_HOME = 'original-home'
    $env:ELECTRON_RUN_AS_NODE = 'original-electron'
    & $target -DshExe $node -DshHome $fixtureHome -Profile web -Version 1.6.6 -DryRun
    $called = Get-Content -LiteralPath (Join-Path $fixtureHome 'called.json') -Raw | ConvertFrom-Json
    Assert ($called.args -contains '--profile=web') 'profile was lost'
    Assert ($called.args -contains '--version=1.6.6') 'version was lost'
    Assert ($called.args -contains '--dry-run') 'dry-run was lost'
    Assert ($called.electron -eq '1') 'runtime mode not set'
    Assert ($env:DSH_HOME -eq 'original-home') 'home not restored'
    Assert ($env:ELECTRON_RUN_AS_NODE -eq 'original-electron') 'electron env not restored'
    $script:exitCode = 17
    $failed = $false
    try { & $target -DshExe $node -DshHome $fixtureHome } catch { $failed = $true }
    Assert $failed 'nonzero process exit was ignored'
    Assert ($env:DSH_HOME -eq 'original-home') 'failure changed home'
    $script:downloadFail = $true
    $failed = $false
    try { & $target -DshExe $node -DshHome $fixtureHome } catch { $failed = $true }
    Assert $failed 'download failure was ignored'
    Assert ($env:ELECTRON_RUN_AS_NODE -eq 'original-electron') 'download failure changed env'
    $failed = $false
    try { & $target -DshExe (Join-Path $temporary 'missing.exe') } catch { $failed = $true }
    Assert $failed 'missing executable was accepted'
    Assert ($env:PATH -eq $initialPath) 'global PATH was changed'
    Write-Host 'Windows wrapper: arguments, Unicode/space paths, exit status, download failure, env/PATH preservation passed.'
} finally {
    $env:DSH_HOME = $initialHome
    $env:ELECTRON_RUN_AS_NODE = $initialElectron
    [Net.ServicePointManager]::SecurityProtocol = $initialProtocol
    Remove-Item -LiteralPath $temporary -Recurse -Force
}
