// Explicit integration test; never targets the default user profile or starts DSH.
// Initialize a NEW isolated profile with the actual DSH CLI first, then provide
// PURGE_TEST_HOME, PURGE_TEST_PROFILE, PURGE_DSH_CLI and two release tarballs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Maintenance,validateArchive,PACKAGE} from '../lib/community.js';
import {verifyInstalledPackage} from '../lib/rollback-transaction.js';
import {normalizeHostBase,resolveDshCli} from '../lib/instance.js';
const home=process.env.PURGE_TEST_HOME, name=process.env.PURGE_TEST_PROFILE;
const host=process.env.PURGE_TEST_HOST_BASE || ''; // Explicit isolated npm scope for three-root acceptance.
const [baseline,candidate]=process.argv.slice(2).map(p=>path.resolve(p));
if(!home || !name || (!process.env.PURGE_DSH_CLI && !host) || !baseline || !candidate) throw Error('Explicit isolated home/profile/CLI (or nested host base) and baseline/candidate archives are required');
const profile=path.join(home,'profiles',name), root=path.join(profile,'node_modules',PACKAGE);
const manifest=JSON.parse(fs.readFileSync(path.join(profile,'package.json')));
if(Object.keys(manifest.dependencies||{}).length || fs.existsSync(root)) throw Error('Use a new empty isolated profile, never an existing user installation');
process.env.DSH_HOME=home;process.env.DSH_PROFILE=name;process.env.PURGE_PROFILE_DIR=profile;
const a=await validateArchive(baseline),b=await validateArchive(candidate);
const m=new Maintenance({home,profile,root,aiBase:host});
let nested='',packageRoot='';
if(host) {
  if(process.env.PURGE_DSH_CLI) throw Error('Unset PURGE_DSH_CLI so nested-root discovery is exercised');
  nested=normalizeHostBase(host);packageRoot=path.join(host,'dsh');
  if(nested !== path.join(packageRoot,'node_modules/@deepseek-ai')) throw Error('Select an actual isolated nested npm host');
  const expected=resolveDshCli({aiBase:host}).cli;
  for(const base of [host,packageRoot,nested])assert.equal(resolveDshCli({aiBase:base}).cli,expected);
}
await m.install(baseline);await verifyInstalledPackage(profile,a);
const snapshot=await m.backup('runtime-acceptance');
if(host)m.aiBase=nested;
await m.install(candidate);await verifyInstalledPackage(profile,b);
if(host)m.aiBase=packageRoot;
await m.rollback(snapshot.id);await verifyInstalledPackage(profile,a);
assert(!JSON.parse(fs.readFileSync(path.join(profile,'package.json'))).dependencies[PACKAGE].startsWith('link:'));
if(host)m.aiBase=host;
await m.install(candidate);await verifyInstalledPackage(profile,b);
const before=fs.readFileSync(path.join(profile,'package.json')),lock=fs.readFileSync(path.join(profile,'pnpm-lock.yaml'));
m.verifier=async()=>{throw Error('injected post-install import failure');};
await assert.rejects(m.rollback(snapshot.id),/回滚前依赖、安装与清单已恢复/);
assert.deepEqual(fs.readFileSync(path.join(profile,'package.json')),before);
assert.deepEqual(fs.readFileSync(path.join(profile,'pnpm-lock.yaml')),lock);
await verifyInstalledPackage(profile,b);
console.log(JSON.stringify({baseline:a.version,candidate:b.version,rollbackImport:true,reupgradeImport:true,failedRollbackRecovered:true,restartedHost:false,nestedRootForms:!!host}));
