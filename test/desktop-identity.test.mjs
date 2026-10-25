import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { diskFs } from '../lib/extract-asar.js';
import { desktopIdentity, hasDesktopIdentity, clearDesktopIdentityCache } from '../lib/desktop-identity.js';
import { clearDesktopLocateCache, listDesktopInstallRoots } from '../lib/desktop.js';
import { withDesktopReadScope, memoDesktopRead } from '../lib/desktop-read-scope.js';
const fs = diskFs();
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'purge identity '));
  const resources=path.join(root,'resources'), host=path.join(resources,'app/dsh/node_modules/@deepseek-ai/dsh-desktop-host');
  fs.mkdirSync(path.join(host,'lib'),{recursive:true});
  fs.writeFileSync(path.join(host,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh-desktop-host'}));
  fs.writeFileSync(path.join(host,'lib/cli.js'),'// fixture');
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,resources,host};
}
test('successful evidence is shared within one async read only',async t=>{
  const f=fixture(t); let first;
  await withDesktopReadScope(async()=>{
    first=desktopIdentity(f.resources);await Promise.resolve();
    assert.equal(desktopIdentity(f.resources),first);
    assert.equal(withDesktopReadScope(()=>desktopIdentity(f.resources)),first);
  });
  assert.notEqual(desktopIdentity(f.resources),first);
  assert.notEqual(withDesktopReadScope(()=>desktopIdentity(f.resources)),first);
});
test('next read detects deleted entry, changed manifest and recovery without reset',t=>{
  const f=fixture(t),read=()=>withDesktopReadScope(()=>desktopIdentity(f.resources));
  assert.equal(read().kind,'bundled-host');fs.unlinkSync(path.join(f.host,'lib/cli.js'));assert.equal(read(),null);
  fs.writeFileSync(path.join(f.host,'lib/cli.js'),'// restored');assert.equal(read().kind,'bundled-host');
  fs.writeFileSync(path.join(f.host,'package.json'),'{}');assert.equal(read(),null);
  fs.writeFileSync(path.join(f.host,'package.json'),'{');assert.throws(read);
  fs.writeFileSync(path.join(f.host,'package.json'),'ॐ');assert.throws(read);
});
test('preferred archive changes, removal and damaged directory cannot reuse old identity',t=>{
  const f=fixture(t),read=()=>withDesktopReadScope(()=>desktopIdentity(f.resources));
  assert.ok(read());fs.writeFileSync(path.join(f.resources,'app.asar'),'broken');assert.throws(read);
  assert.equal(hasDesktopIdentity(f.resources),false);
  fs.unlinkSync(path.join(f.resources,'app.asar'));fs.unlinkSync(path.join(f.host,'lib/cli.js'));assert.equal(read(),null);
});
test('unreadable archive is an error, not absent archive with directory fallback',t=>{
  const f=fixture(t),original=fs.lstatSync;
  fs.lstatSync=function(file,...args){if(file===path.join(f.resources,'app.asar'))throw Object.assign(Error('denied'),{code:'EACCES'});return original.call(this,file,...args);};
  try{assert.throws(()=>withDesktopReadScope(()=>desktopIdentity(f.resources)),{code:'EACCES'});}
  finally{fs.lstatSync=original;}
  assert.ok(withDesktopReadScope(()=>desktopIdentity(f.resources)));
});
test('link retarget is observed on the next query, including case-distinct resource keys',t=>{
  const f=fixture(t),other=fixture(t),link=path.join(f.root,'linked');
  fs.writeFileSync(path.join(other.host,'package.json'),'{}');
  fs.symlinkSync(f.resources,link,process.platform==='win32'?'junction':'dir');
  assert.ok(withDesktopReadScope(()=>desktopIdentity(link)));fs.unlinkSync(link);
  fs.symlinkSync(other.resources,link,process.platform==='win32'?'junction':'dir');
  assert.equal(withDesktopReadScope(()=>desktopIdentity(link)),null);
  withDesktopReadScope(()=>{
    assert.equal(memoDesktopRead('case','/Host',()=>1),1);
    assert.equal(memoDesktopRead('case','/host',()=>2),2);
  });
});
test('explicit clearing invalidates active scopes across await',async t=>{
  const f=fixture(t);
  for(const clear of [clearDesktopIdentityCache,clearDesktopLocateCache])await withDesktopReadScope(async()=>{
    const first=desktopIdentity(f.resources);await Promise.resolve();clear();assert.notEqual(desktopIdentity(f.resources),first);
  });
});
test('parallel diagnostic reads and failed reads never share a snapshot',async t=>{
  const f=fixture(t);let first,second,release;const gate=new Promise(r=>release=r);
  const one=withDesktopReadScope(async()=>{first=desktopIdentity(f.resources);await gate;assert.equal(desktopIdentity(f.resources),first);});
  await withDesktopReadScope(async()=>{second=desktopIdentity(f.resources);await Promise.resolve();assert.equal(desktopIdentity(f.resources),second);});
  assert.notEqual(first,second);release();await one;
  await assert.rejects(withDesktopReadScope(async()=>{desktopIdentity(f.resources);throw Error('failure');}),/failure/);
  assert.notEqual(desktopIdentity(f.resources),first);
});
test('negative evidence is retried even inside a query',t=>{
  const f=fixture(t);fs.unlinkSync(path.join(f.host,'lib/cli.js'));
  withDesktopReadScope(()=>{assert.equal(desktopIdentity(f.resources),null);fs.writeFileSync(path.join(f.host,'lib/cli.js'),'// restored');assert.ok(desktopIdentity(f.resources));});
});
test('discovery includes DSH_DESKTOP_INSTALL and returns caller-owned lists',t=>{
  const a=fixture(t),b=fixture(t);
  // This explicit root shape is recognized through bounded instruction evidence.
  for(const f of [a,b])fs.mkdirSync(path.join(f.resources,'app/dsh/node_modules/@deepseek-ai/dsh-agent-instructions/lib'),{recursive:true});
  const read=root=>listDesktopInstallRoots({execPath:'',resourcesPath:'',argv:[],env:{DSH_DESKTOP_INSTALL:root}});
  withDesktopReadScope(()=>{
    const first=read(a.root);assert.ok(first.includes(a.root));first.length=0;assert.ok(read(a.root).includes(a.root));
    assert.ok(read(b.root).includes(b.root));assert.ok(!read(b.root).includes(a.root));
  });
});
