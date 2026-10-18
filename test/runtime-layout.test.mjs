import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ensureAppRuntimeLink,repairRuntimeForCli,PNPM_ENTRY} from '../lib/runtime-layout.js';

function fixture() {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'purge runtime 中文 ')),resources=path.join(root,'resources');
 fs.mkdirSync(path.join(resources,'app'),{recursive:true});
 const pnpm=path.join(resources,'runtime',PNPM_ENTRY);fs.mkdirSync(path.dirname(pnpm),{recursive:true});fs.writeFileSync(pnpm,"console.log('runtime fixture');");
 return {root,resources,pnpm,link:path.join(resources,'app/runtime')};
}
test('runtime link targets the sibling runtime independent of cwd and remains idempotent',()=>{
 const f=fixture();try {
  assert.equal(ensureAppRuntimeLink(f.resources).ok,true);
  assert.equal(fs.readFileSync(path.join(f.link,PNPM_ENTRY),'utf8'),fs.readFileSync(f.pnpm,'utf8'));
  assert.equal(fs.realpathSync(f.link),fs.realpathSync(path.join(f.resources,'runtime')));
  if(process.platform==='win32')assert.equal(path.isAbsolute(fs.readlinkSync(f.link)),true);
  assert.equal(ensureAppRuntimeLink(f.resources).already,true);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('broken runtime junction is preserved then repaired, existing real directories are retained',()=>{
 const f=fixture();try {
  fs.symlinkSync(path.join(f.root,'missing-runtime'),f.link,process.platform==='win32'?'junction':'dir');
  const previous=fs.readlinkSync(f.link),result=ensureAppRuntimeLink(f.resources);
  assert.equal(result.ok,true);assert.equal(fs.readlinkSync(result.backup),previous);
  fs.unlinkSync(f.link);fs.mkdirSync(f.link);fs.writeFileSync(path.join(f.link,'user-file'),'keep');
  assert.equal(ensureAppRuntimeLink(f.resources).ok,false);assert.equal(fs.readFileSync(path.join(f.link,'user-file'),'utf8'),'keep');
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('installer repairs only the selected unpacked Desktop CLI and leaves other layouts alone',()=>{
 const f=fixture();try {
  const cli=path.join(f.resources,'app/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js');
  assert.equal(repairRuntimeForCli(cli).ok,true);assert.ok(fs.existsSync(path.join(f.link,PNPM_ENTRY)));
  assert.equal(repairRuntimeForCli(cli.replace(/([\\/])app([\\/])/,'$1app.asar$2')).skipped,'not_unpacked_desktop');
  assert.equal(repairRuntimeForCli('/node/project/cli.js').skipped,'not_unpacked_desktop');
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
