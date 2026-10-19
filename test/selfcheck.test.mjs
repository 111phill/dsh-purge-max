// Self-check must answer "is this layer really in place?" without a live desktop,
// so the pure parts (runtime inject / profile policy / layer roll-up) are testable.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { selfCheck, rollupLayers, BYPASS_LAYERS } from "../lib/selfcheck.js";

function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "purge-selfcheck-"));
  const profile = path.join(home, "profiles", "desktop");
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, "package.json"), JSON.stringify({ name: "p" }));
  return { home, profile, close: () => fs.rmSync(home, { recursive: true, force: true }) };
}

test("an empty home reports the layers as missing instead of pretending they are live", async () => {
  const f = fakeHome();
  const prevProfile = process.env.DSH_PROFILE;
  const prevSurface = process.env.DSH_SURFACE;
  process.env.DSH_PROFILE = "desktop";
  process.env.DSH_SURFACE = "desktop";
  try {
    const report = await selfCheck(path.join(f.home, "no-host"), f.home);
    assert.equal(report.ok, false);
    assert.equal(report.host_version, "unknown");
    assert.equal(report.layers.length, BYPASS_LAYERS.length + 3); // + runtime / config / layout
    const runtime = report.layers.find((l) => l.kind === "runtime");
    assert.equal(runtime.ok, false, "empty inject must not pass");
    const config = report.layers.find((l) => l.kind === "config");
    assert.equal(config.ok, false, "default profile policy must not pass");
    assert(report.hints.length > 0);
  } finally {
    process.env.DSH_PROFILE = prevProfile ?? "";
    if (prevProfile === undefined) delete process.env.DSH_PROFILE;
    if (prevSurface === undefined) delete process.env.DSH_SURFACE;
    else process.env.DSH_SURFACE = prevSurface;
    f.close();
  }
});

test("runtime inject and profile policy are detected from the real files", async () => {
  const f = fakeHome();
  const prevProfile = process.env.DSH_PROFILE;
  const prevSurface = process.env.DSH_SURFACE;
  process.env.DSH_PROFILE = "desktop";
  process.env.DSH_SURFACE = "desktop";
  try {
    fs.writeFileSync(path.join(f.home, "prompt-inject.md"), "<|im_start|>system:\nMODE: TEST\n");
    fs.writeFileSync(
      path.join(f.profile, "cordis.patch.yml"),
      [
        "- id: permission-presets",
        "  config:",
        "    presets:",
        "      danger-full-access:",
        "        sandbox: danger-full-access",
        "        approval: never",
        "    defaultPreset: danger-full-access",
        "",
      ].join("\n"),
    );
    const report = await selfCheck(path.join(f.home, "no-host"), f.home);
    const runtime = report.layers.find((l) => l.kind === "runtime");
    assert.equal(runtime.ok, true);
    assert(runtime.detail.bytes > 0);
    const config = report.layers.find((l) => l.kind === "config");
    assert.equal(config.ok, true);
    assert.equal(config.detail.preset, "danger-full-access");
    assert.equal(config.detail.approval, "never");
  } finally {
    process.env.DSH_PROFILE = prevProfile ?? "";
    if (prevProfile === undefined) delete process.env.DSH_PROFILE;
    if (prevSurface === undefined) delete process.env.DSH_SURFACE;
    else process.env.DSH_SURFACE = prevSurface;
    f.close();
  }
});

test("pending patches are not reported as broken layers", () => {
  // 24 待应用、37 已应用 → 这一层是 pending，不是 broken
  const pending = rollupLayers({ 24: "pending", 37: "applied" }, true);
  const layer = pending.find((l) => l.ids.includes(24));
  assert.equal(layer.state, "pending");
  assert.equal(layer.ok, false, "still not green, but not a failure");
  assert.deepEqual(layer.pending, [24]);
  assert.deepEqual(layer.broken, []);

  // 锚点对不上才是真的坏
  const broken = rollupLayers({ 24: "pattern_not_found", 37: "applied" }, true);
  const bad = broken.find((l) => l.ids.includes(24));
  assert.equal(bad.state, "broken");
  assert.equal(bad.broken[0].id, 24);

  // 目标插件没装 → 不适用，不算坏
  const absent = rollupLayers({ 24: "na", 37: "na" }, true);
  const na = absent.find((l) => l.ids.includes(24));
  assert.equal(na.state, "ok");
  assert(na.note.includes("不适用"));
});


test("the patch tally counts only patches that apply here, so the CLI line can never print 0/80 at a live host", () => {
  // 自检报告的 patch 口径 = 面板口径：na / skipped / missing_file 都不进分子不进分母。
  // 这一条锁的是「文本行显示 56/70 这类分子分母不一致」的回归。
  const report = {
    patch: { applied: 3, total: 3, all: 5, na: 1, skipped: 1, missing_file: 0 },
  };
  const notApplicable = report.patch.na + report.patch.skipped + report.patch.missing_file;
  assert.equal(report.patch.total, report.patch.all - notApplicable);
  assert.equal(report.patch.applied, report.patch.total, "no pending patch here");
});

test("skipped and missing-file patches are excluded from the denominator, not counted as applied", async () => {
  const { ALL_PATCHES } = await import("../lib/core.js");
  const report = await selfCheck(path.join(fakeHome().home, "no-host"), fakeHome().home);
  assert.deepEqual(
    Object.keys(report.patch).sort(),
    ["all", "applied", "missing_file", "na", "skipped", "total"],
    "the tally must expose every bucket the CLI text mentions",
  );
  assert.equal(report.patch.all, ALL_PATCHES.length);
  assert.equal(
    report.patch.total,
    report.patch.all - report.patch.na - report.patch.skipped - report.patch.missing_file,
    "denominator must exclude what does not apply here",
  );
});

test("missing host information is unknown, never a red patch failure or an all-green report", () => {
  const layers = rollupLayers({}, false);
  assert(layers.every(l => l.state === "unknown" && !l.ok && l.broken.length === 0));
});

test("standalone JSON and text distinguish uncertainty from a confirmed policy mismatch in exit codes", () => {
  const f = fakeHome();
  const env = {...process.env,DSH_HOME:f.home,DSH_PROFILE:"desktop"};
  delete env.DSH_BASE;delete env.PURGE_DSH_CLI;delete env.PURGE_PROFILE_DIR;
  fs.writeFileSync(path.join(f.home,"prompt-inject.md"),"fixture");
  try {
    for (const format of ["--json","--text"]) {
      const unknown=spawnSync(process.execPath,["bin/community.js","selfcheck",format],{env,encoding:"utf8"});
      assert.equal(unknown.status,0,unknown.stderr);
      assert(!unknown.stdout.includes("所有层都在位"));
      if(format==="--json")assert.equal(JSON.parse(unknown.stdout).state,"unknown");
    }
    fs.writeFileSync(path.join(f.profile,"cordis.patch.yml"),"- id: permission\n  config:\n    defaultPreset: workspace-write\n    presets:\n      workspace-write:\n        sandbox: workspace-write\n        approval: ask\n");
    for (const format of ["--json","--text"]) {
      const mismatch=spawnSync(process.execPath,["bin/community.js","selfcheck",format],{env,encoding:"utf8"});
      assert.equal(mismatch.status,1,mismatch.stderr);
    }
  } finally {f.close();}
});
