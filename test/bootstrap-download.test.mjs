import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bootstrapInstall, downloadReleaseFile, archiveDownloadBudget } from '../scripts/bootstrap-install.mjs';
const url = 'https://github.com/kingcharleslzy-ai/dsh-purge/releases/download/v1.6.38/dsh-purge-community-1.6.38.tgz';
const network = code => new TypeError('fetch failed with https://user:secret@proxy.invalid/?token=private', {cause:Object.assign(Error('private details'), {code})});
const options = { sleep: async()=>{}, log:()=>{}, curlRequest:async()=>assert.fail('unexpected curl') };

test('first success uses only fetch; transient failure retries from original URL', async()=>{
  let calls=0;const seen=[];
  const result=await downloadReleaseFile(url,20,{...options,request:async(u,o)=>{seen.push(u);assert.equal(o.redirect,'manual');if(!calls++)throw network('ECONNRESET');return new Response('ok');}});
  assert.equal(result.toString(),'ok');assert.deepEqual(seen,[url,url]);
});
test('two transport failures fall back to curl with each redirect explicitly checked',async()=>{
  const logs=[],seen=[];
  const result=await downloadReleaseFile(url,20,{...options,log:x=>logs.push(x),stage:'archive',request:async()=>{throw network('UND_ERR_CONNECT_TIMEOUT');},curlRequest:async(u,o)=>{
    seen.push(u);assert(o.timeout>0&&o.limit===20);
    return seen.length===1?{status:302,headers:new Headers({location:'https://release-assets.githubusercontent.com/file?secret=private'})}:{status:200,headers:new Headers(),body:Buffer.from('ok')};
  }});
  assert.equal(result.toString(),'ok');assert.equal(seen.length,2);
  assert(logs.some(x=>x.includes('stage=archive')&&x.includes('UND_ERR_CONNECT_TIMEOUT')));
  assert(!logs.join('\n').includes('private'));assert(logs.at(-1).includes('transport=curl recovered'));
});
test('HTTP retries are bounded, permanent errors and certificate failures do not switch transport',async()=>{
  for(const status of [400,401,403,404,410]){
    let count=0;await assert.rejects(downloadReleaseFile(url,20,{...options,request:async()=>{count++;return new Response(null,{status});}}),new RegExp('HTTP_'+status));assert.equal(count,1);
  }
  for(const code of ['CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE'])
    await assert.rejects(downloadReleaseFile(url,20,{...options,request:async()=>{throw network(code);}}),new RegExp(code));
  let count=0,curls=0;
  await assert.rejects(downloadReleaseFile(url,20,{...options,request:async()=>{count++;return new Response(null,{status:503});},curlRequest:async()=>{curls++;return {status:503,headers:new Headers(),body:Buffer.alloc(0)};}}),/attempt=3\/3 code=HTTP_503/);
  assert.equal(count,2);assert.equal(curls,1);
});
test('untrusted URLs, credentials, ports and redirects fail closed on both transports',async()=>{
  const invalid=['http://github.com/x','https://evil.example/x','https://user:secret@github.com/x','https://github.com:8443/x','file:///tmp/x'];
  for(const target of invalid){
    await assert.rejects(downloadReleaseFile(target,20,{...options,request:async()=>assert.fail()}),/UNTRUSTED/);
    for(const useCurl of [false,true]){
      let count=0;
      await assert.rejects(downloadReleaseFile(url,20,{...options,request:async()=>{if(useCurl)throw network('ECONNRESET');return new Response(null,{status:302,headers:{location:target}});},curlRequest:async()=>{count++;return {status:302,headers:new Headers({location:target})};}}),/UNTRUSTED/);
      assert.equal(count,useCurl?1:0);
    }
  }
});
test('oversized and truncated bodies stop or retry without retaining partial bytes',async()=>{
  await assert.rejects(downloadReleaseFile(url,2,{...options,request:async()=>new Response('large')}),/TOO_LARGE/);
  await assert.rejects(downloadReleaseFile(url,2,{...options,request:async()=>new Response('',{headers:{'content-length':'999'}})}),/TOO_LARGE/);
  let count=0;
  const bytes=await downloadReleaseFile(url,20,{...options,request:async()=>{
    if(count++)return new Response('whole');
    return new Response(new ReadableStream({start(c){c.enqueue(Buffer.from('partial'));c.error(Object.assign(Error('reset'),{code:'ECONNRESET'}));}}));
  }});assert.equal(bytes.toString(),'whole');
});
test('redirect loops and exhausted budgets terminate; aggregate diagnostics never leak raw errors',async()=>{
  await assert.rejects(downloadReleaseFile(url,20,{...options,request:async()=>new Response(null,{status:302,headers:{location:url}})}),/TOO_MANY/);
  await assert.rejects(downloadReleaseFile(url,20,{...options,budget:0,request:async()=>assert.fail()}),/BUDGET_EXHAUSTED/);
  await assert.rejects(downloadReleaseFile(url,20,{...options,request:async()=>{throw new TypeError('secret',{cause:new AggregateError([Object.assign(Error('proxy-password'),{code:'ENETUNREACH'}),Object.assign(Error('token'),{code:'ETIMEDOUT'})])});},curlRequest:async()=>{throw Object.assign(Error('sensitive stderr'),{code:'CURL_EXIT_60'});}}),e=>{
    assert.match(e.message,/ENETUNREACH,ETIMEDOUT/);assert.match(e.message,/CURL_EXIT_60/);assert(!/secret|password|sensitive|token/.test(e.message));return true;
  });
});
test('fallback checksum mismatch and checksum transport failure cannot invoke migration or write settings',async t=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'purge-download-no-write-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const profile=path.join(home,'profiles/desktop');fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'package.json'),'{}');fs.writeFileSync(path.join(profile,'cordis.patch.yml'),'PRIVATE');
  for(const failChecksum of [false,true]){
    await assert.rejects(bootstrapInstall({home,cli:'fixture',version:'1.6.38',request:async()=>{throw network('ENETUNREACH');},download:{sleep:async()=>{},curlRequest:async u=>{
      if(u.endsWith('SHA256SUMS.txt')&&failChecksum)throw Object.assign(Error('no curl'),{code:'CURL_UNAVAILABLE'});
      return {status:200,headers:new Headers(),body:Buffer.from(u.endsWith('.tgz')?'tampered':'0'.repeat(64)+'  dsh-purge-community-1.6.38.tgz\n')};
    }},log:()=>{},run:async()=>assert.fail('must not extract/install')}),failChecksum?/stage=checksum/:/SHA256/);
    assert.equal(fs.readFileSync(path.join(profile,'cordis.patch.yml'),'utf8'),'PRIVATE');assert.deepEqual(fs.readdirSync(home),['profiles']);
  }
});
test('archive budget preserves bounded user preference',()=>{
  assert.equal(archiveDownloadBudget({}),180000);assert.equal(archiveDownloadBudget({PURGE_DOWNLOAD_TIMEOUT_MS:'900000'}),900000);
  for(const value of ['0','29999','900001','NaN','1.5','-1'])assert.throws(()=>archiveDownloadBudget({PURGE_DOWNLOAD_TIMEOUT_MS:value}));
});
