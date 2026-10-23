// CI only: a provisioned isolated npm host, never user DSH or a GUI process.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';
import {runAliasAcceptance} from './alias-runtime-scenarios.mjs';
const fixture=process.env.PURGE_TEST_NPM_ROOT,cli=process.env.PURGE_LINK_TEST_CLI;
assert(fixture && cli && fs.existsSync(path.join(fixture,'.purge-test-only')),'Explicit isolated npm host required');
const rel=path.relative(fs.realpathSync(fixture),fs.realpathSync(cli));
assert(rel && !rel.startsWith('..') && !path.isAbsolute(rel),'CLI must belong to isolated host');
const [legacy,archive]=process.argv.slice(2).map(p=>fs.realpathSync(p));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'purge-ci-alias-'));
console.log(JSON.stringify(await runAliasAcceptance({runtime:process.execPath,cli,legacy,archive,temp}),null,2));
