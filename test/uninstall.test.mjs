import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stripPluginFromPackage,listInstalledProfiles,shouldDeletePluginTree,collectCleanupDirs,finishUninstallCleanup} from '../lib/uninstall.js';

test('uninstall removes community and legacy registrations from native profile manifests, retaining other plugins',()=>{
 const pkg={dependencies:{'dsh-purge-community':'file:local','dsh-purge-panel':'1','unrelated':'keep'},optionalDependencies:{'dsh-purge':'1'},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','dsh-purge-community','unrelated',{id:'dsh-purge-panel'}]}},plugins:['dsh-purge@1','unrelated'],bundles:[{name:'dsh-purge-community'},'unrelated']};
 assert.equal(stripPluginFromPackage(pkg),true);
 assert.deepEqual(pkg.dependencies,{unrelated:'keep'});
 assert.deepEqual(pkg.optionalDependencies,{});
 assert.deepEqual(pkg.dsh.profile.bundles,['@deepseek-ai/dsh-base','unrelated']);
 assert.deepEqual(pkg.plugins,['unrelated']);assert.deepEqual(pkg.bundles,['unrelated']);
 assert.equal(stripPluginFromPackage(pkg),false);
});

test('public CLI uninstall executes file cleanup and preserves unrelated plugins and drill data',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'purge-cli-uninstall-'));
 try{
  const home=path.join(root,'home'),host=path.join(root,'host'),profile=path.join(home,'profiles/web');
  for(const dir of [path.join(host,'dsh-agent-instructions/lib'),path.join(profile,'node_modules/dsh-purge-community'),path.join(profile,'node_modules/other-plugin'),path.join(home,'dsh-purge'),path.join(home,'redteam'),path.join(home,'skills/keep')])fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({dependencies:{'dsh-purge-community':'1','other-plugin':'1'},dsh:{profile:{bundles:['dsh-purge-community','other-plugin']}}}));
  fs.writeFileSync(path.join(home,'redteam/keep.txt'),'drill');fs.writeFileSync(path.join(home,'skills/keep/SKILL.md'),'skill');
  const cli=fileURLToPath(new URL('../bin/dsh-purge.js',import.meta.url));
  const result=spawnSync(process.execPath,[cli,'--uninstall'],{env:{...process.env,DSH_HOME:home,DSH_BASE:host,DSH_PROFILE:'web',PURGE_PROFILE_DIR:profile,PURGE_DSH_CLI:''},encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  assert.equal(fs.existsSync(path.join(profile,'node_modules/dsh-purge-community')),false);
  assert.equal(fs.existsSync(path.join(home,'dsh-purge')),false);
  assert.equal(fs.existsSync(path.join(profile,'node_modules/other-plugin')),true);
  assert.equal(fs.readFileSync(path.join(home,'redteam/keep.txt'),'utf8'),'drill');
  assert.equal(fs.readFileSync(path.join(home,'skills/keep/SKILL.md'),'utf8'),'skill');
  const pkg=JSON.parse(fs.readFileSync(path.join(profile,'package.json'),'utf8'));
  assert.deepEqual(pkg.dependencies,{'other-plugin':'1'});assert.deepEqual(pkg.dsh.profile.bundles,['other-plugin']);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('uninstall finds all installed profiles, including an entry without node_modules, and rejects similarly named packages',()=>{
 const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'purge-uninstall-')));
 try{
  for(const [name,pkg] of Object.entries({web:{dependencies:{'dsh-purge-community':'file:local'}},custom:{dsh:{profile:{bundles:['dsh-purge-panel']}}},legacy:{dependencies:{'dsh-purge':'1'}},other:{dependencies:{'dsh-purge-community-extra':'1'}}})){
   const dir=path.join(home,'profiles',name);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify(pkg));
  }
  assert.deepEqual(listInstalledProfiles(home).map(x=>x.name).sort(),['custom','legacy','web']);
  assert.equal(shouldDeletePluginTree(path.join(home,'node_modules/dsh-purge-community'),home),true);
  assert.equal(shouldDeletePluginTree(path.join(home,'node_modules/dsh-purge-community-extra'),home),false);
  assert.equal(shouldDeletePluginTree(path.join(home,'profiles/web/node_modules/unrelated'),home),false);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});

test('cleanup unlinks external source checkouts and shared packages without deleting their contents', async t => {
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'purge-unlink-')));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const home=path.join(root,'home'), profile=path.join(home,'profiles/web');
 fs.mkdirSync(path.join(profile,'node_modules'),{recursive:true});
 const targets=[path.join(root,'source-checkout'),path.join(root,'shared/node_modules/dsh-purge-panel')];
 for(const [i,target] of targets.entries()) {
  fs.mkdirSync(target,{recursive:true}); fs.writeFileSync(path.join(target,'keep.txt'),'private source');
  const name=i?'dsh-purge-panel':'dsh-purge-community';
  fs.writeFileSync(path.join(target,'package.json'),JSON.stringify({name}));
  fs.symlinkSync(target,path.join(profile,'node_modules',name),process.platform==='win32'?'junction':'dir');
  assert.equal(shouldDeletePluginTree(target,home),false);
 }
 const dangling=path.join(profile,'node_modules/dsh-purge');
 fs.symlinkSync(path.join(root,'missing'),dangling,process.platform==='win32'?'junction':'dir');
 const cleanup=collectCleanupDirs([{dir:profile}],home);
 assert(targets.every(target=>!cleanup.includes(target)));
 const result=await finishUninstallCleanup({ok:true,errors:[],cleanup});
 assert.equal(result.ok,true);
 for(const target of targets) assert.equal(fs.readFileSync(path.join(target,'keep.txt'),'utf8'),'private source');
 for(const name of ['dsh-purge','dsh-purge-panel','dsh-purge-community'])
  assert.throws(()=>fs.lstatSync(path.join(profile,'node_modules',name)),{code:'ENOENT'});
});

test('cleanup preserves an external profile target and does not follow a linked data directory', async t => {
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'purge-profile-link-')));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const home=path.join(root,'home'), external=path.join(root,'external');
 fs.mkdirSync(path.join(home,'profiles'),{recursive:true});
 fs.mkdirSync(path.join(external,'node_modules/dsh-purge-community'),{recursive:true});
 fs.writeFileSync(path.join(external,'keep.txt'),'keep');
 const profile=path.join(home,'profiles/web');
 fs.symlinkSync(external,profile,process.platform==='win32'?'junction':'dir');
 fs.symlinkSync(external,path.join(home,'dsh-purge'),process.platform==='win32'?'junction':'dir');
 const cleanup=collectCleanupDirs([{dir:profile}],home);
 assert(!cleanup.some(file=>file.startsWith(profile)||file.startsWith(external)));
 await finishUninstallCleanup({ok:true,errors:[],cleanup});
 assert.equal(fs.readFileSync(path.join(external,'keep.txt'),'utf8'),'keep');
 assert(fs.existsSync(path.join(external,'node_modules/dsh-purge-community')));
 assert(fs.lstatSync(profile).isSymbolicLink());
});

test('failed restore/unregister never executes a pending cleanup plan', async t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'purge-cleanup-fail-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'keep.txt'),'keep');
 for(const report of [{ok:false,errors:[]},{ok:true,errors:['restore failed']}]) {
  const result=await finishUninstallCleanup({...report,cleanup:[dir]});
  assert.equal(result.ok,false); assert(fs.existsSync(path.join(dir,'keep.txt')));
 }
});

test('Linux cleanup does not treat a case-distinct sibling home as owned', {skip:process.platform!=='linux'}, t => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'purge-case-boundary-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const home=path.join(root,'home'),outside=path.join(root,'HOME/node_modules/dsh-purge-community');
 fs.mkdirSync(home);fs.mkdirSync(outside,{recursive:true});
 fs.writeFileSync(path.join(outside,'package.json'),'{"name":"dsh-purge-community"}');
 assert.equal(shouldDeletePluginTree(outside,home),false);
});
