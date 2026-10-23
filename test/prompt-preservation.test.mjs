import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as core from '../lib/core.js';
import {removeTreeNoFollowSync} from '../lib/remove-tree.js';
const custom = '<|im_start|>system:\r\n<project_instructions>\r\nLittle Code Sauce\r\nUSER PREFERENCE: answer in concise prose.\r\n';
function fixture(t) {
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'purge-prompt-preserve-'));
  const old=process.env.DSH_HOME;process.env.DSH_HOME=home;
  t.after(()=>{if(old===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=old;removeTreeNoFollowSync(home)});
  return home;
}
for (const kind of ['saved','manual','missing-state','corrupt-state','legacy-customized-false']) test('user prompt survives sync, apply and install: '+kind,async t=>{
  const home=fixture(t),file=core.findOverrideFile(home);
  await core.saveOverrideContent(home,custom);
  if(kind==='manual')fs.appendFileSync(file,'Manual edit after save\r\n');
  if(kind==='missing-state')fs.unlinkSync(core.overrideStatePath(home));
  if(kind==='corrupt-state')fs.writeFileSync(core.overrideStatePath(home),'{broken');
  if(kind==='legacy-customized-false')await core.writeOverrideState(home,{customized:false,hash:core.defaultOverrideHash(),seedHash:core.defaultOverrideHash()});
  const before=fs.readFileSync(file);
  assert.equal(core.looksLikePluginDefault(before.toString()),false);
  assert.equal(core.isKeepableUserOverride(home,before.toString()),true);
  assert.equal(core.seedPromptInjectAtBoot(home).action,'kept_user_custom');
  assert.equal(await core.installOverride(home),'exists');
  assert.deepEqual(fs.readFileSync(file),before);
  assert.equal((await core.commitOverrideOnApply(home,before.toString())).action,'saved_user');
  assert.deepEqual(fs.readFileSync(file),before);
  assert.equal((await core.readOverrideState(home)).customized,true);
  assert.equal((await core.readOverrideForUi(home)).customized,true);
});
test('unproven old defaults are retained; exact managed previous defaults still migrate',async t=>{
  const home=fixture(t),file=core.findOverrideFile(home),previous='PREVIOUS DEFAULT FIXTURE';
  fs.writeFileSync(file,previous);
  assert.equal(core.seedPromptInjectAtBoot(home).action,'kept_user_custom');
  await core.writeOverrideState(home,{customized:false,hash:core.hashOverride(previous),seedHash:core.hashOverride(previous)});
  assert.equal(core.seedPromptInjectAtBoot(home).action,'refresh_default');
  assert.equal(fs.readFileSync(file,'utf8'),core.defaultOverrideText());
  assert.equal(core.seedPromptInjectAtBoot(home).action,'current');
});
test('explicit customization beats an old default fingerprint',async t=>{
  const home=fixture(t),file=core.findOverrideFile(home);
  fs.writeFileSync(file,custom);
  await core.writeOverrideState(home,{customized:true,hash:core.hashOverride(custom),seedHash:core.hashOverride(custom)});
  assert.equal(core.seedPromptInjectAtBoot(home).action,'kept_user_custom');
  assert.equal(await core.installOverride(home),'exists');
  assert.equal(fs.readFileSync(file,'utf8'),custom);
});
test('fresh install and explicit reset retain their existing behavior',async t=>{
  const home=fixture(t),file=core.findOverrideFile(home);
  assert.equal(core.seedPromptInjectAtBoot(home).action,'seed_default');
  await core.saveOverrideContent(home,custom);
  assert.equal(await core.installOverride(home,true),'wrote');
  assert.equal(fs.readFileSync(file,'utf8'),core.defaultOverrideText());
});
test('unreadable prompt is an error, never an empty/default candidate',async t=>{
  const home=fixture(t),file=core.findOverrideFile(home);
  fs.mkdirSync(file);fs.writeFileSync(path.join(file,'sentinel'),'KEEP');
  assert.equal(core.seedPromptInjectAtBoot(home).action,'error');
  await assert.rejects(core.installOverride(home));
  assert.equal(fs.readFileSync(path.join(file,'sentinel'),'utf8'),'KEEP');
});
