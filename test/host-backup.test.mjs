import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {hostFs} from '../lib/extract-asar.js';
import {backupAll,revertAll} from '../lib/core.js';

test('real backup descriptors close before atomic rename, rollback restores original bytes',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'purge backup 中文 '));
 const oldHome=process.env.DSH_HOME;process.env.DSH_HOME=path.join(root,'home');
 try {
  const file=path.join(root,'dsh-settings/lib/index.js');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'original vendor code');
  const fd=hostFs.openSync(path.join(root,'descriptor'),'wx');hostFs.closeSync(fd);assert.throws(()=>fs.fstatSync(fd),/EBADF/);
  const backup=await backupAll(root);assert.deepEqual(backup.errors,[]);assert.equal(fs.readFileSync(file+'.dshpurge.bak','utf8'),'original vendor code');
  fs.writeFileSync(file,'patched vendor code');const revert=await revertAll(root);assert.deepEqual(revert.errors,[]);assert.equal(fs.readFileSync(file,'utf8'),'original vendor code');
 }finally{if(oldHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=oldHome;fs.rmSync(root,{recursive:true,force:true});}
});
