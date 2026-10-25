// #86: applyPatches() must not abort the whole run when one patch's target file
// is absent. 1.6.58 added `detail[p.id].push({...})` to the missing-target
// branch without declaring `detail`, so every host that lacks one of the 65
// targets (hooks for Claude Code / Codex, LiangShen cache, …) died mid-apply
// with `ReferenceError: detail is not defined` and the panel stayed at 4/65.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ALL_PATCHES, applyPatches, patchAppliesHere } from "../lib/core.js";
import { NATIVE_QUEUE_GUARD, OLD_QUEUE_FALLBACK } from "../lib/steering.js";
import { removeTreeNoFollowSync } from "../lib/remove-tree.js";

// 一条真能打上的补丁（单宿主、两个目标文件都在 fixture 里），用它的 applied
// 结果证明"前一条目标缺失"没有把后面的补丁连坐。
const APPLIES = ALL_PATCHES.find((p) => p.id === 90);
const fixtureSource = JSON.parse(
  fs.readFileSync(new URL("./fixtures/steering-rc2.json", import.meta.url), "utf8"),
);

function fixture({ withHostFiles = false }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "purge-apply-missing-"));
  const home = path.join(root, "home");
  const aiBase = path.join(root, "node_modules", "@deepseek-ai");
  fs.mkdirSync(path.join(home, "profiles", "desktop"), { recursive: true });
  fs.writeFileSync(path.join(home, "profiles", "desktop", "package.json"), "{}");
  fs.mkdirSync(aiBase, { recursive: true });
  const targets = {};
  if (withHostFiles) {
    targets.controller = path.join(aiBase, "dsh-api-session-controller", "lib", "index.js");
    targets.loop = path.join(aiBase, "dsh-agent-loop", "lib", "index.js");
    for (const file of Object.values(targets)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
    }
    // fixtures 里的 controller 是"已打补丁"的样式，先还原成宿主原文才是待打状态。
    fs.writeFileSync(
      targets.controller,
      fixtureSource.controller.replace(NATIVE_QUEUE_GUARD, OLD_QUEUE_FALLBACK),
    );
    fs.writeFileSync(targets.loop, fixtureSource.agentMethods);
  }
  return { root, home, aiBase, targets, close: () => removeTreeNoFollowSync(root) };
}

async function withFixture(options, fn) {
  const f = fixture(options);
  const prevHome = process.env.DSH_HOME;
  const prevSurface = process.env.DSH_SURFACE;
  // 指向 fixture：apply 前的 profile 快照写到临时 home，绝不碰真实 ~/.dsh。
  process.env.DSH_HOME = f.home;
  process.env.DSH_SURFACE = "desktop";
  try {
    return await fn(f);
  } finally {
    if (prevHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = prevHome;
    if (prevSurface === undefined) delete process.env.DSH_SURFACE;
    else process.env.DSH_SURFACE = prevSurface;
    f.close();
  }
}

/** 第一条在本 fixture 里"目标文件全都不存在"的补丁。 */
function absentPatch() {
  const found = ALL_PATCHES.find(
    (p) => p.id !== APPLIES.id && patchAppliesHere(p, "desktop"),
  );
  assert.ok(found, "ALL_PATCHES 里应至少还有一条适用于 desktop 的补丁");
  return found;
}

test("a patch whose target files are all absent is reported, not thrown", async () => {
  await withFixture({}, async (f) => {
    const absent = absentPatch();
    const report = await applyPatches(f.aiBase, [absent]);
    assert.equal(report.length, 1);
    assert.equal(report[0].patch_id, absent.id);
    assert.equal(
      report[0].status,
      "missing_file",
      "目标文件全缺时记 missing_file，整次 apply 不能抛异常",
    );
    assert.ok(report[0].missing > 0);
  });
});

test("a missing target does not stop the patches that follow it", async () => {
  await withFixture({ withHostFiles: true }, async (f) => {
    const absent = absentPatch();
    const report = await applyPatches(f.aiBase, [absent, APPLIES]);
    assert.equal(report.length, 2, "第二条补丁必须也被处理");
    assert.equal(report[0].patch_id, absent.id);
    assert.equal(report[0].status, "missing_file");
    const applied = report[1];
    assert.equal(applied.patch_id, APPLIES.id);
    assert.equal(applied.status, "applied", "后面的补丁不能被前一条的缺失连坐");
    assert.ok(
      (fs.readFileSync(f.targets.controller, "utf8")).includes(NATIVE_QUEUE_GUARD),
      "补丁内容必须真的写进磁盘",
    );
  });
});

test("re-applying after a missing target stays idempotent", async () => {
  await withFixture({ withHostFiles: true }, async (f) => {
    const absent = absentPatch();
    await applyPatches(f.aiBase, [absent, APPLIES]);
    const once = fs.readFileSync(f.targets.controller, "utf8");
    const report = await applyPatches(f.aiBase, [absent, APPLIES]);
    assert.equal(report[1].status, "already", "第二次应判 already，不重复写");
    assert.equal(fs.readFileSync(f.targets.controller, "utf8"), once);
  });
});
