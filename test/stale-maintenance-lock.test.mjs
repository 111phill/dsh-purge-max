import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as wait} from 'node:timers/promises';
import {acquireMaintenanceLock} from '../lib/maintenance-lock.js';
import {Maintenance} from '../lib/community.js';
const DEAD=4194304, stale=new Date(Date.now()-45*60*1000);
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'purge-lock-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const lock=path.join(root,'maintenance.lock');
  return {root,lock,plant(raw,when=new Date()){fs.writeFileSync(lock,String(raw));fs.utimesSync(lock,when,when);}};
}
const dead=pid=>{if(pid===DEAD) throw Object.assign(Error('dead'),{code:'ESRCH'});};
test('dead legacy lock is recovered, with a real exclusive lock throughout the body',t=>{
 const f=fixture(t);f.plant(DEAD);const g=acquireMaintenanceLock(f.root,{kill:dead});
 g.check();assert.throws(()=>acquireMaintenanceLock(f.root),/已有维护操作/);g.release();
 assert(!fs.existsSync(f.lock));assert(!fs.existsSync(path.join(f.root,'maintenance.guard')));
});
test('old live legacy writer is not stolen even after 45 minutes',t=>{
 const f=fixture(t);f.plant(process.pid,stale);
 assert.throws(()=>acquireMaintenanceLock(f.root,{kill:()=>{},birth:()=>Date.now()-3600000}),/已有维护操作/);
 assert.equal(fs.readFileSync(f.lock,'utf8'),String(process.pid));
});
test('reused PID is reclaimed only when process birth proves the old owner ended',t=>{
 const f=fixture(t);f.plant(process.pid,stale);
 const g=acquireMaintenanceLock(f.root,{kill:()=>{},birth:()=>Date.now()-10000});g.check();g.release();
});
for(const [label,raw,io] of [
 ['unknown old content','fixture',{}],['remote host',`elsewhere:${DEAD}:nonce`,{kill:dead}],
 ['EPERM',String(DEAD),{kill:()=>{throw Object.assign(Error('denied'),{code:'EPERM'});}}],
 ['unknown liveness error',String(DEAD),{kill:()=>{throw Object.assign(Error('unknown'),{code:'EIO'});}}]
]) test(`${label} never becomes stale merely through age`,t=>{
 const f=fixture(t);f.plant(raw,stale);assert.throws(()=>acquireMaintenanceLock(f.root,io),/已有维护操作/);assert.equal(fs.readFileSync(f.lock,'utf8'),raw);
});
test('metadata write failure releases gate and empty file without hiding disk failure',t=>{
 const f=fixture(t);const io=new Proxy(fs,{get(target,key){if(key==='writeFileSync')return (file,...args)=>{if(typeof file==='number')throw Object.assign(Error('disk full'),{code:'ENOSPC'});return fs.writeFileSync(file,...args);};return target[key];}});
 assert.throws(()=>acquireMaintenanceLock(f.root,{fs:io}),{code:'ENOSPC'});
 const g=acquireMaintenanceLock(f.root);g.release();
});
test('a new owner cannot be removed by a stale directory reaper',t=>{
 const f=fixture(t);const gate=path.join(f.root,'maintenance.guard'),old='a'.repeat(32)+'.json';
 fs.mkdirSync(gate);fs.writeFileSync(path.join(gate,old),JSON.stringify({host:os.hostname(),pid:DEAD,createdAt:0}));
 let next;
 const io=new Proxy(fs,{get(target,key){if(key==='unlinkSync')return file=>{
   if(file===path.join(gate,old)&&!next){fs.unlinkSync(file);fs.rmdirSync(gate);next=acquireMaintenanceLock(f.root);return;}
   return fs.unlinkSync(file);
 };return target[key];}});
 assert.throws(()=>acquireMaintenanceLock(f.root,{fs:io,kill:dead}),/已有维护操作/);
 next.check();next.release();
});
test('lost ownership stops body completion and never removes replacement lock',async t=>{
 const f=fixture(t);const profile=path.join(f.root,'profiles','web');fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'package.json'),'{}');
 const m=new Maintenance({home:f.root,profile,aiBase:''});
 await assert.rejects(m.locked(async()=>{fs.writeFileSync(path.join(m.base,'maintenance.lock'),'replacement');}),{code:'LOCK_LOST'});
 assert.equal(fs.readFileSync(path.join(m.base,'maintenance.lock'),'utf8'),'replacement');
});
test('an unchanged lock with read failure stops writes rather than assuming ownership',t=>{
 const f=fixture(t);let fail=false;const io=new Proxy(fs,{get(target,key){if(key==='readFileSync')return (file,...args)=>{if(fail&&file===f.lock)throw Object.assign(Error('AV'),{code:'EACCES'});return fs.readFileSync(file,...args);};return target[key];}});
 const g=acquireMaintenanceLock(f.root,{fs:io});fail=true;assert.throws(()=>g.check(),{code:'LOCK_LOST'});fail=false;g.release();
});
const moduleURL=new URL('../lib/maintenance-lock.js',import.meta.url).href;
function child(code,root){const p=spawn(process.execPath,['--input-type=module','-e',code,root],{env:process.env,stdio:['ignore','pipe','pipe']});let err='';p.stderr.on('data',x=>err+=x);p.done=once(p,'exit').then(([status])=>{assert.equal(status,0,err);});return p;}
test('actual crashed child leaves a recoverable gate and legacy lock',async t=>{
 const f=fixture(t);const p=child(`import fs from 'node:fs';import{acquireMaintenanceLock}from ${JSON.stringify(moduleURL)};acquireMaintenanceLock(process.argv[1]);console.log('held');setInterval(()=>{},1000);`,f.root);
 // This fixture intentionally terminates only its own holder, never DSH.
 await once(p.stdout,'data');const exited=once(p,'exit');p.kill('SIGKILL');await exited;await p.done.catch(()=>{});
 const g=acquireMaintenanceLock(f.root);g.check();g.release();
});
test('actual concurrent processes never overlap maintenance writes',async t=>{
 const f=fixture(t);
 const code=`import fs from 'node:fs';import path from 'node:path';import{setTimeout as wait}from 'node:timers/promises';import{acquireMaintenanceLock}from ${JSON.stringify(moduleURL)};const root=process.argv[1];for(let n=0;n<5;n++){let g;for(let i=0;i<500;i++){try{g=acquireMaintenanceLock(root);break;}catch(e){if(e.code!=='MAINTENANCE_BUSY'&&e.code!=='ENOENT')throw e;await wait(10);}}if(!g)throw Error('timed out');const f=path.join(root,'critical');const fd=fs.openSync(f,'wx');await wait(10);g.check();fs.closeSync(fd);fs.unlinkSync(f);g.release();}`;
 await Promise.all(Array.from({length:4},()=>child(code,f.root).done));
 assert(!fs.existsSync(f.lock));
});
