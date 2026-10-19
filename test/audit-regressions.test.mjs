// 审计回归：这一组用例对应四个“报告和事实不一致”的缺陷，修好之前它们全部失败。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rollupLayers } from "../lib/selfcheck.js";
import { versionIsNewer, sameRev } from "../lib/update-state.js";
import { atomicFiles } from "../lib/atomic-files.js";
import { dirBackup, dirRestore } from "../lib/update-install.js";

const tmp = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), `purge ${tag} `));

test("读取补丁状态失败时，自检不能报成全绿", () => {
  // patchStatus 抛错后 selfCheck 传 status={} + statusError：每一层都必须是 unknown。
  const failed = rollupLayers({}, true, { statusError: "patchStatus boom" });
  assert(failed.every((l) => l.state === "unknown" && l.ok === false));
  assert(failed.every((l) => l.broken.length === 0), "读不到状态不等于补丁损坏");
  assert(failed[0].note.includes("patchStatus boom"));
  assert.equal(failed[0].status_error, "patchStatus boom");

  // 没有错误、宿主也未定位时保持原语义：ok（这一层当前不适用）。
  assert(rollupLayers({}, true).every((l) => l.state === "ok"));
  // 未定位宿主仍是 unknown，不会被上面的错误分支吞掉。
  assert(rollupLayers({}, false).every((l) => l.state === "unknown"));
});

test("预发布段按数字比较：rc.2 不比 rc.10 新", () => {
  assert.equal(versionIsNewer("0.2.1-rc.2", "0.2.1-rc.10"), false);
  assert.equal(versionIsNewer("0.2.1-rc.10", "0.2.1-rc.2"), true);
  assert.equal(versionIsNewer("0.2.1-rc.2", "0.2.1"), false);
  assert.equal(versionIsNewer("0.2.1", "0.2.1-rc.2"), true);
  assert.equal(versionIsNewer("1.6.27", "1.6.9"), true);
  assert.equal(versionIsNewer("1.6.100", "1.6.99"), true);
});

test("sameRev 只对 git sha 做前缀比较，不把 apply:<版本> 当成同一修订", () => {
  assert.equal(sameRev("apply:1.6.2", "apply:1.6.27"), false);
  assert.equal(sameRev("abc1234", "abc1234def"), true);
  assert.equal(sameRev("abc1234", "fff9999"), false);
});

test("rename 撞到瞬时占用会退避重试，而不是直接让状态文件写失败", () => {
  const root = tmp("rename");
  const file = path.join(root, "state.json");
  fs.writeFileSync(file, "old");
  try {
    let calls = 0;
    const fake = { ...fs, promises: { ...fs.promises } };
    fake.renameSync = (from, to) => {
      calls += 1;
      if (calls <= 2) throw Object.assign(Error("busy"), { code: "EBUSY" });
      return fs.renameSync(from, to);
    };
    atomicFiles(fake).atomicWriteSync(file, "new");
    assert.equal(fs.readFileSync(file, "utf8"), "new");
    assert.equal(calls, 3, "前两次 EBUSY 后应再试一次");
    assert.deepEqual(fs.readdirSync(root), ["state.json"], "重试不应留下临时文件");

    // 非占用类错误不重试：权限错误重试没有意义。
    let fatal = 0;
    const deny = { ...fs, promises: { ...fs.promises } };
    deny.renameSync = () => {
      fatal += 1;
      throw Object.assign(Error("denied"), { code: "ENOENT" });
    };
    assert.throws(() => atomicFiles(deny).atomicWriteSync(file, "x"), /denied/);
    assert.equal(fatal, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("目录回滚保住被备份有意跳过的 node_modules", () => {
  const root = tmp("dirrestore");
  const home = path.join(root, "home");
  const dir = path.join(root, "plugin");
  try {
    fs.mkdirSync(path.join(dir, "lib"), { recursive: true });
    fs.mkdirSync(path.join(dir, "node_modules", "yaml"), { recursive: true });
    fs.writeFileSync(path.join(dir, "lib", "index.js"), "v1");
    fs.writeFileSync(path.join(dir, "node_modules", "yaml", "index.js"), "dep");
    const backup = dirBackup(dir, { home, reason: "test" });
    // 升级把源码写坏，但 node_modules 仍在盘上
    fs.writeFileSync(path.join(dir, "lib", "index.js"), "broken");
    dirRestore(backup, dir);
    assert.equal(fs.readFileSync(path.join(dir, "lib", "index.js"), "utf8"), "v1");
    assert.equal(
      fs.existsSync(path.join(dir, "node_modules", "yaml", "index.js")),
      true,
      "回滚后依赖必须还在，否则插件 import yaml 直接失败",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
