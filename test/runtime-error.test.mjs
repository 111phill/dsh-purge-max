import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {apiJson} from '../packages/purge-panel/src/api/client.js';
import {runtimeRepairDetails} from '../packages/purge-panel/src/shared/runtime-error.js';

test('real HTTP 500 retains runtime reason, recovery status and known launcher errors',async()=>{
 const report={ok:false,symlink:{ok:false,reason:'rollback_failed',error:'create denied',code:'EPERM',backup:'/fixture/old-link.bak',rollback:{ok:false,error:'restore denied'}},shims:[{status:'write_error',path:'/fixture/dsh.cmd',error:'EACCES'}]};
 const server=http.createServer((req,res)=>{res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'Desktop CLI runtime repair failed; original archive retained.',cli_repair:report,prompt:'PRIVATE PROMPT',config:{secret:'PRIVATE KEY'}}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  await assert.rejects(apiJson(`http://127.0.0.1:${server.address().port}/dsh-purge/apply`,{method:'POST'}),e=>{
   assert.equal(e.status,500);assert.match(e.message,/rollback_failed/);assert.match(e.message,/rollback: failed/);
   assert.match(e.message,/restore denied/);assert.match(e.message,/dsh.cmd/);assert.match(e.message,/EPERM/);
   assert(!e.message.includes('PRIVATE'));assert(Array.isArray(e.runtimeDetails));return true;
  });
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('runtime errors remain bounded, unknown failures are not reported as successes',()=>{
 assert.deepEqual(runtimeRepairDetails(null),[]);
 assert.deepEqual(runtimeRepairDetails({ok:true,error:'not an error'}),[]);
 assert.deepEqual(runtimeRepairDetails({ok:false,reason:'unknown_layout',prompt:'PRIVATE'}),['runtime: unknown_layout']);
 assert(runtimeRepairDetails({ok:false,error:'x'.repeat(10000)})[0].length<1300);
 assert(runtimeRepairDetails({ok:false,symlink:{ok:false,reason:'link_repair_failed',rollback:{ok:true}}}).includes('rollback: original link restored'));
 assert.deepEqual(runtimeRepairDetails({ok:false,shims:[{status:'missing',error:'optional missing'}]}),[]);
});
