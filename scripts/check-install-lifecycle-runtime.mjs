// Disposable CLI-only macOS fixture / Windows Desktop copy + fresh homes.
// Never starts DSH UI or applies patches.
// Run with the isolated Electron executable and ELECTRON_RUN_AS_NODE=1.
// Args: <isolated exe> <official cli.js> <legacy tgz> <previous community tgz> <candidate tgz> <fixture root>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
// Explicit fixture root is mandatory. Never fall back to a live Desktop runtime.
assert(['darwin','win32'].includes(process.platform), 'This acceptance script covers macOS and Windows');
const inputs = process.argv.slice(2);
assert.equal(inputs.length, 6, 'Usage: runtime cli legacy.tgz previous.tgz candidate.tgz fixture-root');
const [runtime, cli, legacy, previous, archive, fixture] = inputs.map(x => fs.realpathSync(x));
const inside = (root, file) => { const rel = path.relative(root, file); return rel !== '' && !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel); };
assert(inside(fixture, runtime) && inside(fixture, cli), 'Runtime and CLI must belong to the explicit disposable fixture');
assert(fs.existsSync(path.join(fixture, '.purge-install-test-fixture')), 'Fixture marker required');
if (process.platform === 'darwin') {
  assert(!runtime.split(path.sep).some(x => x.endsWith('.app')), 'Do not launch/register a copied macOS application');
  assert(!fs.existsSync(path.resolve(runtime, '../../Info.plist')), 'CLI fixture must not carry the DSH bundle identity');
  assert(!runtime.startsWith('/Applications/'), 'Production application runtime is forbidden');
}
if (process.platform === 'win32') {
  const active = execFileSync('powershell.exe', ['-NoProfile','-Command',
    'Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:PURGE_TEST_RUNTIME } | ForEach-Object { $_.Id }'],
    {env:{...process.env,PURGE_TEST_RUNTIME:runtime},encoding:'utf8',timeout:30000});
  assert.deepEqual(active.trim().split(/\s+/).filter(Boolean).filter(id => Number(id) !== process.pid), [], 'Fixture has another running process; create a fresh copy');
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'purge-install-lifecycle-'));
if (process.platform === 'darwin' && process.env.PURGE_TEST_SANDBOX_ACTIVE !== '1') {
  // The sandbox is inherited by every installer/CLI child. Production remains read-only.
  const protectedPaths = ['/Applications', path.join(os.homedir(), '.dsh'), path.join(os.homedir(), 'Library/Application Support/@deepseek-ai'), path.join(os.homedir(), 'Library/Logs/DeepSeek Harness')];
  const sb = path.join(temp, 'readonly-production.sb');
  fs.writeFileSync(sb, '(version 1)\n(allow default)\n(deny file-write* ' + protectedPaths.map(p => '(subpath ' + JSON.stringify(p) + ')').join(' ') + ')\n(deny process-exec (subpath "/Applications/DeepSeek Harness.app"))\n');
  execFileSync('/usr/bin/sandbox-exec', ['-f', sb, process.execPath, ...process.argv.slice(1)], {
    env: {...process.env, PURGE_TEST_SANDBOX_ACTIVE:'1'}, stdio:'inherit', timeout:1800000,
  });
  process.exit(0);
}
console.log('EVIDENCE ' + temp);
assert.equal(fs.realpathSync(process.execPath), runtime, 'Run this acceptance with the isolated Electron executable in Node mode');
const {runInstallLifecycle} = await import('./install-lifecycle-scenarios.mjs');
const result = await runInstallLifecycle({runtime,cli,legacy,previous,archive,temp});
fs.writeFileSync(path.join(temp,'result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
