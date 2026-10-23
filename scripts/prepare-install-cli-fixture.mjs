/** macOS developer helper: create a CLI-only fixture, never launch a .app copy. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
assert.equal(process.platform, 'darwin', 'macOS helper only');
assert.equal(process.argv.length, 3, 'Usage: node script /path/to/test-source.app/Contents');
const source = fs.realpathSync(process.argv[2]);
for (const name of ['MacOS/DeepSeek Harness', 'Frameworks', 'Resources'])
  assert(fs.existsSync(path.join(source, name)), 'Incomplete source: ' + name);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'purge-cli-fixture-'));
const fixture = path.join(root, 'host');
const contents = path.join(fixture, 'Contents');
fs.mkdirSync(contents, {recursive:true});
for (const name of ['MacOS','Frameworks','Resources'])
  execFileSync('/bin/cp', ['-cR', path.join(source, name), path.join(contents, name)]);
// Deliberately omit root Info.plist, PkgInfo and application signature envelope.
// A new local development signature belongs only to this copied CLI executable.
const runtime = path.join(contents, 'MacOS/DeepSeek Harness');
execFileSync('/usr/bin/codesign', ['--force','--sign','-','--identifier','local.purge.cli-acceptance',runtime], {stdio:'pipe'});
execFileSync('/usr/bin/codesign', ['--verify',runtime], {stdio:'pipe'});
fs.writeFileSync(path.join(fixture,'.purge-install-test-fixture'), 'CLI only; never register as an application\n');
const cli = path.join(contents, 'Resources/app/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js');
assert(fs.existsSync(cli), 'Use an already prepared unpacked test source; do not unpack the live application');
console.log(JSON.stringify({fixture,runtime,cli},null,2));
