import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stripPluginFromPackage,listInstalledProfiles,shouldDeletePluginTree} from '../lib/uninstall.js';

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
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'purge-uninstall-'));
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
