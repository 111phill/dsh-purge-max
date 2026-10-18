import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { readWindowsAsarHandoff } from '../lib/windows-asar-handoff.js';

const electron = process.env.PURGE_ELECTRON_EXEC;
test('real Windows Electron: helper executes and survives its launcher exiting', {
  skip: process.platform !== 'win32' || !electron,
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'purge electron 中文 '));
  const exe = path.join(root, 'holder.exe'), asar = path.join(root, 'app.asar');
  fs.copyFileSync(process.execPath, exe);
  fs.mkdirSync(path.join(root, 'app'));
  fs.writeFileSync(path.join(root, 'app/package.json'), '{}');
  fs.writeFileSync(asar, 'original archive');
  const holder = spawn(exe, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  const launcher = path.join(root, 'launcher.mjs');
  fs.writeFileSync(launcher, `
    import {setTimeout as wait} from 'node:timers/promises';
    import {scheduleWindowsAsarHandoff,readWindowsAsarHandoff} from ${JSON.stringify(new URL('../lib/windows-asar-handoff.js', import.meta.url).href)};
    if(!process.versions.electron) throw Error('actual Electron required');
    const asar=${JSON.stringify(asar)};
    scheduleWindowsAsarHandoff({exe:${JSON.stringify(exe)},asar});
    for(let i=0;i<100;i++){
      await wait(100);
      const s=readWindowsAsarHandoff(asar);
      if(s?.phase==='waiting_for_quit') { console.log(JSON.stringify({electron:process.versions.electron,phase:s.phase})); break; }
      if(s?.phase==='failed'||i===99) throw Error(JSON.stringify(s));
    }
  `);
  let helperPid;
  try {
    const out = execFileSync(electron, [launcher], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: path.join(root, 'home') },
      encoding: 'utf8', timeout: 15000,
    });
    assert.equal(JSON.parse(out.trim()).phase, 'waiting_for_quit');
    helperPid = readWindowsAsarHandoff(asar).pid;
    await wait(1000);
    assert.doesNotThrow(() => process.kill(helperPid, 0), 'helper must outlive its Electron launcher');
    assert.equal(fs.readFileSync(asar, 'utf8'), 'original archive');
    holder.kill();
    for(let i=0;i<100 && readWindowsAsarHandoff(asar)?.phase!=='complete';i++) await wait(100);
    const state = readWindowsAsarHandoff(asar);
    assert.equal(state.phase, 'complete');
    assert.equal(fs.existsSync(asar), false);
    assert.equal(fs.readFileSync(state.backup, 'utf8'), 'original archive');
  } finally {
    holder.kill();
    if(helperPid)try { process.kill(helperPid); } catch {}
    await wait(300);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
