// Disposable CLI-only macOS fixture / Windows Desktop copy + fresh homes.
// Never starts DSH UI or applies patches.
// Usage: node script <isolated exe> <official cli.js> <legacy tgz> <release tgz> <fixture root>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
// Explicit fixture root is mandatory. Never fall back to a live Desktop runtime.
assert(['darwin','win32'].includes(process.platform), 'This acceptance script covers macOS and Windows');
const inputs = process.argv.slice(2);
assert.equal(inputs.length, 5, 'Usage: runtime cli legacy.tgz release.tgz fixture-root');
const [runtime, cli, legacy, archive, fixture] = inputs.map(x => fs.realpathSync(x));
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
  assert.equal(active.trim(), '', 'Fixture has a running desktop process; create a fresh copy');
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'purge-install-docs-'));
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
const run = (exe, args, env, label) => {
  try {
    const out = execFileSync(exe, args, {env, cwd:temp, encoding:'utf8', timeout:300000, maxBuffer:8e6});
    fs.writeFileSync(path.join(temp,label+'.log'),out); return out;
  } catch(e) { fs.writeFileSync(path.join(temp,label+'.log'),String(e.stdout||'')+String(e.stderr||'')); throw e; }
};
run(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xzf',archive,'-C',temp],process.env,'unpack');
const pkg = JSON.parse(fs.readFileSync(path.join(temp,'package/package.json')));
const releaseURL = `https://github.com/kingcharleslzy-ai/dsh-purge/releases/download/v${pkg.version}/dsh-purge-community-${pkg.version}.tgz`;
const ext = process.platform === 'win32' ? 'ps1' : 'sh';
const script = path.join(temp,`install.${ext}`);
const response = await fetch(`https://raw.githubusercontent.com/kingcharleslzy-ai/dsh-purge/master/scripts/install.${ext}`, {signal:AbortSignal.timeout(90000)});
assert(response.ok, 'Installer download must succeed'); fs.writeFileSync(script,await response.text());
const cliScript = path.join(temp,'package/bin/community.js');
const reports = [];
for (const scenario of ['official-first-install','community-first-install','legacy-migration']) {
  const home = path.join(temp, scenario, 'home'); fs.mkdirSync(home,{recursive:true});
  const env = {...process.env,DSH_HOME:home,DSH_PROFILE:'web',DSH_SURFACE:'web',PURGE_DSH_CLI:cli,ELECTRON_RUN_AS_NODE:'1', NPM_CONFIG_CACHE:path.join(temp,'npm-cache'), XDG_CACHE_HOME:path.join(temp,'cache'), COREPACK_HOME:path.join(temp,'corepack')};
  for (const name of ['DSH_BASE','PURGE_PROFILE_DIR','PURGE_VERSION','DSH_PLUGIN_CONFIG']) delete env[name];
  const label = step => scenario+'-'+step;
  const command = args => run(runtime,[cli,...args],env,label(args.includes('add')?'add':'init'));
  command(['--profile','web','--dump-default-config']);
  const profile = path.join(home,'profiles/web'), patch = path.join(profile,'cordis.patch.yml');
  const sentinel = 'USER DATA: preserve during install, migration and rollback';
  fs.writeFileSync(path.join(home,'prompt-inject.md'),sentinel);
  fs.mkdirSync(path.join(home,'rules')); fs.writeFileSync(path.join(home,'rules/user.md'),sentinel);
  fs.appendFileSync(patch,'\n# USER SETTINGS SENTINEL\n');
  if (scenario === 'legacy-migration') {
    command(['plugin','--profile','web','add',legacy]);
    fs.writeFileSync(patch,fs.readFileSync(patch,'utf8').replace(/^\[\]\s*$/m,''));
    fs.appendFileSync(patch,'\n- id: dsh-purge\n  name: dsh-purge\n  config:\n    enabled: false\n    postPrompt: "PRIVATE SENTINEL"\n    verbose: true\n');
  }
  const original = fs.readFileSync(patch,'utf8');
  const preserve = () => {
    for (const rel of ['prompt-inject.md','rules/user.md']) assert.equal(fs.readFileSync(path.join(home,rel),'utf8'),sentinel);
    assert(fs.readFileSync(patch,'utf8').includes('# USER SETTINGS SENTINEL'));
  };
  const wrapper = dry => {
    if (process.platform === 'win32') {
      const we = {...env}; delete we.ELECTRON_RUN_AS_NODE;
      return run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-DshExe',runtime,'-DshHome',home,'-Profile','web','-Version',pkg.version,...(dry?['-DryRun']:[])],we,label(dry?'dry-run':'install'));
    }
    const we = {...env,DSH_APP:path.resolve(runtime,'../../..')};
    return run('/bin/sh',[script,'--profile=web',`--version=${pkg.version}`,...(dry?['--dry-run']:[])],we,label(dry?'dry-run':'install'));
  };
  let install;
  if (scenario === 'official-first-install') {
    command(['plugin','--profile','web','add',releaseURL]);
  } else {
    const before = fs.readFileSync(path.join(profile,'package.json'));
    assert.match(wrapper(true),/SHA256 verified; dry run, nothing installed/);
    assert.deepEqual(fs.readFileSync(path.join(profile,'package.json')),before);
    install = wrapper(false);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'node_modules/dsh-purge-community/package.json'))).version,pkg.version);
  const bundles = JSON.parse(fs.readFileSync(path.join(profile,'package.json'))).dsh.profile.bundles;
  assert(bundles.includes('dsh-purge-community')); assert(!bundles.includes('dsh-purge'));
  preserve();
  // Exercise documented status and rollback with actual CLI, never a global bin assumption.
  const status = JSON.parse(run(runtime,[cliScript,'status'],env,label('status')));
  assert(Array.isArray(status.backups));
  const backupId = install?.match(/"backup_id"\s*:\s*"([^"]+)"/)?.[1];
  if (scenario === 'legacy-migration') {
    assert(backupId && status.backups.some(b=>b.id===backupId));
    assert.equal(fs.readFileSync(patch,'utf8'),original.replace('name: dsh-purge\n','name: "dsh-purge-community"\n'));
    fs.appendFileSync(patch,'\n# user edit after migration\n');
    run(runtime,[cliScript,'rollback',backupId],env,label('rollback'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'node_modules/dsh-purge/package.json'))).version,'1.1.71');
    assert.equal(fs.readFileSync(patch,'utf8'),original.replace('name: dsh-purge\n','name: "dsh-purge"\n')+'\n# user edit after migration\n');
    preserve();
  } else if (scenario === 'community-first-install') {
    assert(backupId); // Empty baseline is backed up but cannot restore a nonexistent plugin.
    const back = JSON.parse(run(runtime,[cliScript,'backup'],env,label('backup')));
    fs.appendFileSync(patch,'\n# user edit after backup\n');
    run(runtime,[cliScript,'rollback',back.id],env,label('rollback'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'node_modules/dsh-purge-community/package.json'))).version,pkg.version);
    assert.equal(fs.readFileSync(patch,'utf8'),original+'\n# user edit after backup\n'); preserve();
  }
  reports.push({scenario,version:pkg.version,settingsPreserved:true,rollback:scenario!=='official-first-install'});
}
console.log(JSON.stringify({platform:process.platform,home:temp,runtime:'Isolated real Electron child', productionRuntimeUsed:false, macOSWriteSandbox:process.platform==='darwin',archiveSHA256:createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),reports,restart:false},null,2));
