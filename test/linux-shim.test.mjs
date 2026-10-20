import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {patchShim,revertShim} from '../lib/core.js';

test('Apply preserves npm launcher symlinks and relative module resolution', {skip:process.platform==='win32'},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'purge-npm-shim-'));
 try{
  const bin=path.join(root,'bin'),pkg=path.join(root,'package');fs.mkdirSync(bin);fs.mkdirSync(pkg);
  fs.writeFileSync(path.join(pkg,'package.json'),'{"type":"module"}');fs.writeFileSync(path.join(pkg,'dependency.js'),'export default "native launcher works";');
  const entry=path.join(pkg,'entry.js');fs.writeFileSync(entry,'#!/usr/bin/env node\nimport value from "./dependency.js";console.log(value);\n',{mode:0o755});
  const launcher=path.join(bin,'dsh');fs.symlinkSync(entry,launcher);
  const before=fs.readFileSync(entry);
  const result=await patchShim(bin);
  assert.equal(fs.lstatSync(launcher).isSymbolicLink(),true);
  assert.deepEqual(fs.readFileSync(entry),before);
  assert.equal(execFileSync(launcher,[],{encoding:'utf8'}).trim(),'native launcher works');
  assert.equal(result.dsh,'skipped_symlink');assert(!fs.existsSync(launcher+'.dshpurge.bak'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('regular shell launcher is recognized, backed up, remains executable and restores byte for byte', {skip:process.platform==='win32'},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'purge-shell-shim-'));
 try{
  const launcher=path.join(root,'dsh'),source='#!/bin/sh\nprintf "launcher works\\n"\n';fs.writeFileSync(launcher,source,{mode:0o755});
  assert.equal((await patchShim(root)).dsh,'patched');
  assert.equal(fs.readFileSync(launcher+'.dshpurge.bak','utf8'),source);
  assert.equal(execFileSync(launcher,[],{encoding:'utf8'}).trim(),'launcher works');
  assert.equal((await patchShim(root)).dsh,'already_patched');
  await revertShim(root);assert.equal(fs.readFileSync(launcher,'utf8'),source);assert.equal(fs.statSync(launcher).mode&0o777,0o755);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
