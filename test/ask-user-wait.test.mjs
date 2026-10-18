// #89：尊重模型给的等待时间，只把 -1（无限等）收成 300 秒。
// 同时覆盖旧版「硬写 1 秒」的迁移：升级后必须不再出现 timeout = 1。
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_PATCHES, applyReplacementsToText } from "../lib/core.js";

const patch = ALL_PATCHES.find((p) => p.id === 89);
const NATIVE = '\t\t\tconst timeout = validateTimeout(args.timeout ?? defaultTimeout);';
const OLD = '\t\t\tconst timeout = 1; // [dsh-purge] ask_user_question never blocks a turn';
const NEW = '[dsh-purge] -1 capped at 300s';

test("native host line becomes a capped wait", () => {
  const out = applyReplacementsToText(NATIVE, patch, "x").text;
  assert.match(out, /args\.timeout === -1 \? 300/);
  assert.match(out, /args\.timeout \?\? defaultTimeout/);
  assert.match(out, new RegExp(NEW.replace(/[[\]]/g, "\\$&")));
});

test("an installation carrying the old 1-second patch is migrated", () => {
  const out = applyReplacementsToText(OLD, patch, "x").text;
  assert.doesNotMatch(out, /timeout = 1;/);
  assert.match(out, /args\.timeout === -1 \? 300/);
});

test("applying twice is idempotent", () => {
  const once = applyReplacementsToText(NATIVE, patch, "x").text;
  const twice = applyReplacementsToText(once, patch, "x").text;
  assert.equal(twice, once);
});
