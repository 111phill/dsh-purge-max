import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {restartArgv,scheduleRestart} from '../lib/web.js';

test('Web restart retains the selected custom profile, arguments and a single no-open flag',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'purge-web-restart-'));
 try{
  fs.mkdirSync(path.join(root,'lib'));const bin=path.join(root,'lib/bin.js');fs.writeFileSync(bin,'');
  for(const args of [['web','--port','3082'],['custom-profile','--port','3082'],['--profile','custom-profile','--port','3082'],['--profile=custom-profile','--port','3082']]){
   assert.deepEqual(restartArgv({argv:['node','/launcher',...args,'--no-open'],findBinRoot:()=>root}),[bin,...args,'--no-open']);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('Web restart returns an acknowledgement matching the scheduled action',()=>{
 const calls=[];
 const result=scheduleRestart(null,null,{openBrowser:false,spawnHelper:(helper,payload)=>calls.push({helper,payload})});
 assert.equal(result.restarting,true);assert.equal(calls.length,1);
 assert.equal(calls[0].payload.kind,'web');assert.equal(calls[0].payload.openBrowser,false);
 assert(calls[0].helper.endsWith('restart-web.js'));
});
