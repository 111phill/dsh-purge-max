param([Parameter(Mandatory=$true)][string]$ElectronExe, [Parameter(Mandatory=$true)][string]$SourceRoot)
$ErrorActionPreference='Stop'
# Controlled Job Object reproduction, not the user's running DSH. No archive
# from an installed application is read or changed; no model patches run.
$ElectronExe=(Resolve-Path -LiteralPath $ElectronExe).Path
if (-not $ElectronExe.StartsWith([IO.Path]::GetTempPath(),[StringComparison]::OrdinalIgnoreCase)) { throw 'An isolated runtime under TEMP is required' }
$root=Join-Path ([IO.Path]::GetTempPath()) ('purge-job-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class PurgeTestJob {
 [StructLayout(LayoutKind.Sequential)] public struct Basic { public long a,b; public uint flags; public UIntPtr min,max; public uint count; public UIntPtr affinity; public uint priority,scheduling; }
 [StructLayout(LayoutKind.Sequential)] public struct IO { public ulong a,b,c,d,e,f; }
 [StructLayout(LayoutKind.Sequential)] public struct Extended { public Basic basic; public IO io; public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr CreateJobObject(IntPtr attr,string name);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr job,int info,ref Extended value,uint length);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool result);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);
}
'@
$job=[PurgeTestJob]::CreateJobObject([IntPtr]::Zero,$null)
$limit=New-Object PurgeTestJob+Extended
$basic=New-Object PurgeTestJob+Basic
$basic.flags=0x2000
$limit.basic=$basic
if (-not [PurgeTestJob]::SetInformationJobObject($job,9,[ref]$limit,[Runtime.InteropServices.Marshal]::SizeOf($limit))) { throw 'SetInformationJobObject failed' }
$holder=$null; $launcher=$null; $helperId=0
try {
 $holderExe=Join-Path $root 'fixture-holder.exe'
 Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination $holderExe
 $holderScript=Join-Path $root 'holder.cjs'
 [IO.File]::WriteAllText($holderScript,'setInterval(()=>{},1000)')
 $holder=Start-Process -FilePath $holderExe -ArgumentList ('"'+$holderScript+'"') -PassThru -WindowStyle Hidden
 $asar=Join-Path $root 'app.asar'
 New-Item -ItemType Directory -Path (Join-Path $root 'app')|Out-Null
 [IO.File]::WriteAllText((Join-Path $root 'app/package.json'),'{}')
 [IO.File]::WriteAllText($asar,'isolated original archive')
 $go=Join-Path $root 'go'
 $module=([Uri](Join-Path $SourceRoot 'lib/windows-asar-handoff.js')).AbsoluteUri
 $js=@"
import fs from 'node:fs';
import {setTimeout as wait} from 'node:timers/promises';
import {scheduleWindowsAsarHandoff} from $($module|ConvertTo-Json -Compress);
if(!process.versions.electron)throw Error('Electron required');
while(!fs.existsSync($($go|ConvertTo-Json -Compress)))await wait(50);
scheduleWindowsAsarHandoff({exe:$($holderExe|ConvertTo-Json -Compress),asar:$($asar|ConvertTo-Json -Compress)});
setInterval(()=>{},1000);
"@
 $script=Join-Path $root 'launch.mjs';[IO.File]::WriteAllText($script,$js)
 $savedNode=$env:ELECTRON_RUN_AS_NODE;$env:ELECTRON_RUN_AS_NODE='1'
 try { $launcher=Start-Process -FilePath $ElectronExe -ArgumentList ('"'+$script+'"') -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'launcher.log') -RedirectStandardError (Join-Path $root 'launcher.err') }
 finally { $env:ELECTRON_RUN_AS_NODE=$savedNode }
 if (-not [PurgeTestJob]::AssignProcessToJobObject($job,$launcher.Handle)) { throw 'AssignProcessToJobObject failed' }
 [IO.File]::WriteAllText($go,'start')
 $statePath=$asar+'.purge-handoff.json';$state=$null
 for($i=0;$i -lt 150;$i++) {
   Start-Sleep -Milliseconds 100
   try { $state=Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json } catch {}
   if($state.phase -eq 'waiting_for_quit'){break}
   if($state.phase -eq 'failed'){throw $state.detail}
 }
 if($state.phase -ne 'waiting_for_quit'){throw 'helper did not reach waiting_for_quit'}
 $helperId=[int]$state.pid
 $helper=Get-Process -Id $helperId
 $inJob=$false
 if(-not [PurgeTestJob]::IsProcessInJob($helper.Handle,$job,[ref]$inJob)){throw 'IsProcessInJob failed'}
 [PurgeTestJob]::CloseHandle($job)|Out-Null;$job=[IntPtr]::Zero
 $launcher.WaitForExit(10000)|Out-Null
 Start-Sleep -Seconds 2
 $alive=$null -ne (Get-Process -Id $helperId -ErrorAction SilentlyContinue)
 $state=Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json
 $evidence=@{scenario='controlled KILL_ON_JOB_CLOSE';helperInJob=$inJob;helperAliveAfterJobClose=$alive;phase=$state.phase;archiveUnchanged=([IO.File]::ReadAllText($asar) -eq 'isolated original archive');root=$root}
 $evidence|ConvertTo-Json|Tee-Object -FilePath (Join-Path $root 'result.json')
 if(-not $inJob -or $alive -or $state.phase -ne 'waiting_for_quit' -or -not $evidence.archiveUnchanged){throw 'Original #89 failure was not reproduced; keep the evidence instead of assuming its cause'}
} finally {
 if($job -ne [IntPtr]::Zero){[PurgeTestJob]::CloseHandle($job)|Out-Null}
 foreach($p in @($holder,$launcher)){if($null -ne $p){try{if(-not $p.HasExited){$p.Kill();$p.WaitForExit(5000)|Out-Null}}catch{}}}
 if($helperId){Stop-Process -Id $helperId -ErrorAction SilentlyContinue}
}
