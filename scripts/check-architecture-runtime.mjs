// Maintenance acceptance only. Supply a NEW disposable CLI fixture, never an installed app.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {ensureAppRuntimeLink, PNPM_ENTRY} from '../lib/runtime-layout.js';
const root=fs.realpathSync(process.argv[2]);
assert(fs.existsSync(path.join(root,'.purge-install-test-fixture')), 'Fixture marker required');
const relative=path.relative(root,fs.realpathSync(process.execPath));
assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Execute with this isolated fixture runtime');
assert(!root.split(path.sep).some(p=>p.endsWith('.app')), 'Do not modify an application bundle');
assert(!fs.existsSync(path.join(root,'Contents/Info.plist')), 'CLI-only fixture required');
const resources=path.join(root,process.platform==='darwin'?'Contents/Resources':'resources');
const runtime=path.join(resources,'runtime'), link=path.join(resources,'app/runtime');
assert(fs.statSync(path.join(runtime,PNPM_ENTRY)).isFile(), 'Start with an unused flat fixture');
const old=runtime+'.flat-acceptance';
assert(!fs.existsSync(old));
fs.renameSync(runtime,old);
fs.mkdirSync(runtime);
fs.renameSync(old,path.join(runtime,process.arch));
// Preserve the copied link, even if it points to the original test fixture.
if(fs.existsSync(link)||(()=>{try{return fs.lstatSync(link).isSymbolicLink();}catch{return false;}})()) {
  assert(fs.lstatSync(link).isSymbolicLink(), 'Never replace a runtime directory');
  fs.renameSync(link,link+'.flat-acceptance');
}
const loader=path.join(link,PNPM_ENTRY);
assert(!fs.existsSync(loader), 'Missing-loader control must fail before repair');
const result=ensureAppRuntimeLink(resources);
assert.equal(result.ok,true,JSON.stringify(result));
assert.equal(fs.realpathSync(link),fs.realpathSync(path.join(runtime,process.arch)));
const version=execFileSync(process.execPath,['--expose-internals',loader,'--version'],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',timeout:30000}).trim();
assert.match(version,/^\d+\.\d+\.\d+/);
console.log(JSON.stringify({arch:process.arch,electron:process.versions.electron,pnpm:version,layout:'runtime/'+process.arch,loaderExecuted:true},null,2));
