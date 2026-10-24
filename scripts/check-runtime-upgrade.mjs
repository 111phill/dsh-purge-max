// Actual installer upgrade starting with the legacy container link, followed by
// real rollback/reupgrade and package-verification failure recovery. Isolated only.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {runInstallLifecycle} from './install-lifecycle-scenarios.mjs';
import {PNPM_ENTRY} from '../lib/runtime-layout.js';
const [fixtureArg,previousArg,archiveArg]=process.argv.slice(2);
assert(fixtureArg&&previousArg&&archiveArg);
const fixture=fs.realpathSync(fixtureArg),runtime=fs.realpathSync(process.execPath);
const rel=path.relative(fixture,runtime);assert(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel));
assert(fs.existsSync(path.join(fixture,'.purge-install-test-fixture')));
assert(!fixture.split(path.sep).some(p=>p.endsWith('.app')));
assert(!fs.existsSync(path.join(fixture,'Contents/Info.plist')));
const resources=path.join(fixture,process.platform==='darwin'?'Contents/Resources':'resources');
const link=path.join(resources,'app/runtime'),runtimeRoot=path.join(resources,'runtime');
const cli=path.join(resources,'app/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js');
assert(fs.statSync(path.join(runtimeRoot,process.arch,PNPM_ENTRY)).isFile());
const previous=fs.realpathSync(previousArg),archive=fs.realpathSync(archiveArg);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'purge-old-link-upgrade-'));
console.log('EVIDENCE '+temp);
let originalLink;
const result=await runInstallLifecycle({runtime,cli,legacy:previous,previous,archive,temp,scenarios:['community-upgrade'],
 beforeInstall(){
  assert(fs.lstatSync(link).isSymbolicLink());
  fs.renameSync(link,link+'.acceptance-good-'+Date.now());
  fs.symlinkSync(process.platform==='win32'?runtimeRoot:'../runtime',link,process.platform==='win32'?'junction':'dir');
  originalLink=fs.readlinkSync(link);
  assert(!fs.existsSync(path.join(link,PNPM_ENTRY)),'Before installer: old loader must be broken');
 },
 afterInstall(){
  assert.equal(fs.realpathSync(link),fs.realpathSync(path.join(runtimeRoot,process.arch)));
  const backups=fs.readdirSync(path.dirname(link)).filter(n=>n.startsWith('runtime.dshpurge-link-'));
  assert(backups.some(n=>fs.readlinkSync(path.join(path.dirname(link),n))===originalLink));
 }
});
result.installerMigratedOldLink=true;
fs.writeFileSync(path.join(temp,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
