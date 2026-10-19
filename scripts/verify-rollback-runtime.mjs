// Explicit integration test; never targets the default user profile or starts DSH.
// Initialize a NEW isolated profile with the actual DSH CLI first, then provide
// PURGE_TEST_HOME, PURGE_TEST_PROFILE, PURGE_DSH_CLI and two release tarballs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Maintenance,validateArchive,PACKAGE} from '../lib/community.js';
import {verifyInstalledPackage} from '../lib/rollback-transaction.js';
const home=process.env.PURGE_TEST_HOME, name=process.env.PURGE_TEST_PROFILE;
const [baseline,candidate]=process.argv.slice(2).map(p=>path.resolve(p));
if(!home || !name || !process.env.PURGE_DSH_CLI || !baseline || !candidate) throw Error('Explicit isolated home/profile/CLI and baseline/candidate archives are required');
const profile=path.join(home,'profiles',name), root=path.join(profile,'node_modules',PACKAGE);
const manifest=JSON.parse(fs.readFileSync(path.join(profile,'package.json')));
if(Object.keys(manifest.dependencies||{}).length || fs.existsSync(root)) throw Error('Use a new empty isolated profile, never an existing user installation');
process.env.DSH_HOME=home;process.env.DSH_PROFILE=name;process.env.PURGE_PROFILE_DIR=profile;
const a=await validateArchive(baseline),b=await validateArchive(candidate);
const m=new Maintenance({home,profile,root});
await m.install(baseline);await verifyInstalledPackage(profile,a);
const snapshot=await m.backup('runtime-acceptance');
await m.install(candidate);await verifyInstalledPackage(profile,b);
await m.rollback(snapshot.id);await verifyInstalledPackage(profile,a);
assert(!JSON.parse(fs.readFileSync(path.join(profile,'package.json'))).dependencies[PACKAGE].startsWith('link:'));
await m.install(candidate);await verifyInstalledPackage(profile,b);
const before=fs.readFileSync(path.join(profile,'package.json')),lock=fs.readFileSync(path.join(profile,'pnpm-lock.yaml'));
m.verifier=async()=>{throw Error('injected post-install import failure');};
await assert.rejects(m.rollback(snapshot.id),/回滚前依赖、安装与清单已恢复/);
assert.deepEqual(fs.readFileSync(path.join(profile,'package.json')),before);
assert.deepEqual(fs.readFileSync(path.join(profile,'pnpm-lock.yaml')),lock);
await verifyInstalledPackage(profile,b);
console.log(JSON.stringify({baseline:a.version,candidate:b.version,rollbackImport:true,reupgradeImport:true,failedRollbackRecovered:true,restartedHost:false}));
