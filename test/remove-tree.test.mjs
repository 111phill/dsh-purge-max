import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {removeTreeNoFollowSync,removeTreeNoFollow} from '../lib/remove-tree.js';
import {checkpointProfile} from '../lib/rollback-transaction.js';
import {Maintenance} from '../lib/community.js';
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'purge-no-follow-'));
 const outside=path.join(root,'outside'),tree=path.join(root,'tree');
 fs.mkdirSync(outside);fs.mkdirSync(tree);fs.writeFileSync(path.join(outside,'sentinel'),'KEEP');
 const link=(target,name)=>fs.symlinkSync(target,name,process.platform==='win32'?'junction':'dir');
 return {root,outside,tree,link,check(){assert.equal(fs.readFileSync(path.join(outside,'sentinel'),'utf8'),'KEEP')},close(){removeTreeNoFollowSync(root)}};
}
for(const [name,remove] of [['sync',removeTreeNoFollowSync],['async',removeTreeNoFollow]]) {
 test(`${name}: root/nested links, cycles and dangling links never enter targets`,async()=>{
  const f=fixture();try{
   f.link(f.outside,path.join(f.tree,'external'));fs.mkdirSync(path.join(f.tree,'nested'));
   f.link(f.outside,path.join(f.tree,'nested','external'));f.link(f.tree,path.join(f.tree,'cycle'));
   f.link(path.join(f.root,'missing'),path.join(f.tree,'dangling'));
   await remove(f.tree);f.check();assert(!fs.existsSync(f.tree));await remove(f.tree);
   f.link(f.outside,f.tree);await remove(f.tree+path.sep);f.check();assert(!fs.existsSync(f.tree));
  }finally{f.close()}
 });
 test(`${name}: permission/IO errors remain errors; no recursive fallback or chmod`,async()=>{
  const f=fixture();try{
   const error=Object.assign(Error('denied'),{code:'EACCES'});f.link(f.outside,path.join(f.tree,'linked'));
   const io={...fs,unlinkSync(){throw error},promises:{...fs.promises,unlink:async()=>{throw error}}};
   await assert.rejects(async()=>remove(f.tree,{fs:io}),{code:'EACCES'});f.check();assert(fs.existsSync(f.tree));
  }finally{f.close()}
 });
 test(`${name}: bounded transient retry rechecks a replaced entry as a link`,async()=>{
  const f=fixture();try{
   let calls=0;
   function replace(file){if(calls++===0){fs.rmdirSync(file);f.link(f.outside,file);throw Object.assign(Error('busy'),{code:'EBUSY'})}throw Error('must unlink replacement, not rmdir it')}
   const io={...fs,rmdirSync:replace,promises:{...fs.promises,rmdir:async(file)=>replace(file)}};
   await remove(f.tree,{fs:io,maxRetries:1,retryDelay:1});f.check();assert.equal(calls,1);assert(!fs.existsSync(f.tree));
  }finally{f.close()}
 });
 test(`${name}: filesystem root deletion is refused`,async()=>{
  await assert.rejects(async()=>remove(path.parse(process.cwd()).root),/filesystem root/);
 });
}
test('checkpoint finish and failure restore preserve external package contents',()=>{
 const f=fixture();try{
  fs.writeFileSync(path.join(f.tree,'package.json'),'{"name":"fixture"}');fs.mkdirSync(path.join(f.tree,'node_modules'));
  f.link(f.outside,path.join(f.tree,'node_modules','external'));
  let c=checkpointProfile(f.tree,path.join(f.root,'recovery'));c.finish();f.check();
  c=checkpointProfile(f.tree,path.join(f.root,'recovery'));fs.writeFileSync(path.join(f.tree,'node_modules','partial'),'partial');
  c.restore();f.check();assert(!fs.existsSync(path.join(f.tree,'node_modules','partial')));
  c.finish();f.check();assert.equal(fs.realpathSync(path.join(f.tree,'node_modules','external')),fs.realpathSync(f.outside));
 }finally{f.close()}
});
test('checkpoint cleanup failure is reported separately, without rollback of verified install',()=>{
 const warning=Maintenance.prototype.finishCleanup.call({prune(){return {errors:[]}}},{finish(){throw Object.assign(Error('busy'),{code:'EPERM'})}},'test');
 assert.deepEqual(warning,[{stage:'checkpoint',code:'EPERM'}]);
});
test('standalone helpers embed the exact reviewed no-follow cleanup implementation',()=>{
 for(const file of ['scripts/bootstrap-install.mjs','lib/restart-desktop.js','lib/uninstall-restart.js']) {
  const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const body=source.split('// BEGIN standalone no-follow cleanup (checked against lib/remove-tree.js)\n')[1].split('\n// END standalone no-follow cleanup')[0];
  assert.equal(body,removeTreeNoFollowSync.toString().replace(/\r\n/g,'\n'),file);
 }
});
test('production modules contain no native recursive rm cleanup',()=>{
 function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);
  else if(file.endsWith('.js'))assert(!/\b(?:rmSync|\.rm)\([^\n;]*?recursive:\s*true/.test(fs.readFileSync(file,'utf8')),file);
 }}
 scan(fileURLToPath(new URL('../lib',import.meta.url)));
});
