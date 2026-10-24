// Destructive layout preparation ONLY inside an explicit disposable CLI fixture.
// Uses real Electron, old released code, actual links/junctions and the pnpm loader.
// Never starts the DSH service, invokes plugin apply(), or writes user profiles.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {hostFs} from '../lib/extract-asar.js';
import {ensureAppRuntimeLink,PNPM_ENTRY} from '../lib/runtime-layout.js';
const [fixtureArg,previousPackageArg]=process.argv.slice(2);
assert(fixtureArg&&previousPackageArg,'Usage: isolated-electron check-runtime-migration.mjs fixture previous-package');
const fixture=fs.realpathSync(fixtureArg),previousPackage=fs.realpathSync(previousPackageArg);
const relative=path.relative(fixture,fs.realpathSync(process.execPath));
assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
assert(fs.existsSync(path.join(fixture,'.purge-install-test-fixture')));
assert(!fixture.split(path.sep).some(p=>p.endsWith('.app')));
assert(!fs.existsSync(path.join(fixture,'Contents/Info.plist')));
const resources=path.join(fixture,process.platform==='darwin'?'Contents/Resources':'resources');
const runtime=path.join(resources,'runtime'),link=path.join(resources,'app/runtime');
assert(fs.statSync(path.join(runtime,PNPM_ENTRY)).isFile(),'New flat-layout fixture required');
assert(!fs.existsSync(runtime+'.issue79-flat'),'Fixture already used');
try {
 const stat=fs.lstatSync(link);assert(stat.isSymbolicLink(),'Do not replace runtime directories');
 fs.renameSync(link,link+'.before-issue79');
} catch(e){if(e.code!=='ENOENT')throw e;}
const old=await import(pathToFileURL(path.join(previousPackage,'lib/runtime-layout.js')));
const oldVersion=JSON.parse(fs.readFileSync(path.join(previousPackage,'package.json'))).version;
const oldResult=old.ensureAppRuntimeLink(resources);assert.equal(oldResult.ok,true);
const originalLink=fs.readlinkSync(link);
const loader=()=>execFileSync(process.execPath,['--expose-internals',path.join(link,PNPM_ENTRY),'--version'],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}).trim();
const before=loader();assert.match(before,/^\d+\.\d+\.\d+/);
fs.renameSync(runtime,runtime+'.issue79-flat');fs.mkdirSync(runtime);
fs.renameSync(runtime+'.issue79-flat',path.join(runtime,process.arch));
assert.throws(loader);
const oldFailure=old.ensureAppRuntimeLink(resources);assert.equal(oldFailure.ok,false);
const sentinel=path.join(runtime,process.arch,'issue79-user-sentinel');fs.writeFileSync(sentinel,'KEEP');
const create=hostFs.symlinkSync,rename=hostFs.renameSync;
let creationFailure,rollbackFailure;
try {
 hostFs.symlinkSync=()=>{throw Object.assign(Error('acceptance injected create failure'),{code:'EPERM'});};
 creationFailure=ensureAppRuntimeLink(resources);
 assert.equal(creationFailure.rollback.ok,true);assert.equal(fs.readlinkSync(link),originalLink);
 hostFs.renameSync=(from,to)=>{if(to===link)throw Error('acceptance injected restore failure');return rename(from,to);};
 rollbackFailure=ensureAppRuntimeLink(resources);
 assert.equal(rollbackFailure.reason,'rollback_failed');assert.equal(rollbackFailure.rollback.ok,false);
 assert.equal(fs.readlinkSync(rollbackFailure.backup),originalLink);
} finally {hostFs.symlinkSync=create;hostFs.renameSync=rename;}
// Explicit recovery within this disposable fixture, using the returned backup.
fs.renameSync(rollbackFailure.backup,link);
const migration=ensureAppRuntimeLink(resources);assert.equal(migration.ok,true);
assert.equal(migration.migration,'architecture_container');assert.equal(fs.readlinkSync(migration.backup),originalLink);
const after=loader();assert.equal(after,before);assert.equal(ensureAppRuntimeLink(resources).already,true);
assert.equal(fs.readFileSync(sentinel,'utf8'),'KEEP');
const result={platform:process.platform,arch:process.arch,electron:process.versions.electron,oldVersion,before,oldFailure,creationFailure,rollbackFailure,migration,after,sentinelPreserved:true,restarted:false,
 boundary:'Real loader and filesystem; architecture layout reconstructed; failure injection at link creation/restore only; no application UI or host apply.'};
fs.writeFileSync(path.join(fixture,'issue79-result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
