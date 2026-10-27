import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { diskFs } from "../lib/extract-asar.js";
import { desktopIdentity } from "../lib/desktop-identity.js";
import {
  currentHost,
  desktopHostInfo,
  hostSurface,
  resolveDshCli,
  resolveProfile,
} from "../lib/instance.js";
import {
  desktopRestartChoice,
  isNextDesktopExecutable,
  scheduleNextDesktopRestart,
  scheduleRestart,
} from "../lib/desktop.js";
import { ALL_PATCHES, patchStatus, patchAppliesHere } from "../lib/core.js";
import { compatibility } from "../lib/community.js";

const nextFiles = (version = "2.0.19-next", dsh = "0.2.1-rc.2") => ({
  "package.json": JSON.stringify({ name: "dsh-desktop-next", version, main: "lib/main.js" }),
  "lib/main.js": "// main",
  "lib/host.js": "// host",
  "lib/desktop-cli.js": "// cli",
  "node_modules/@deepseek-ai/dsh/package.json": JSON.stringify({ name: "@deepseek-ai/dsh", version: dsh }),
});

function putFiles(root, files) {
  for (const [relative, body] of Object.entries(files)) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
}

function writeAsar(file, files) {
  const header = { files: {} }, data = [];
  let offset = 0;
  for (const [relative, body] of Object.entries(files)) {
    let node = header;
    const parts = relative.split("/");
    for (const part of parts.slice(0, -1)) node = (node.files[part] ??= { files: {} });
    const bytes = Buffer.from(body);
    node.files[parts.at(-1)] = { size: bytes.length, offset: String(offset) };
    data.push(bytes);
    offset += bytes.length;
  }
  const json = Buffer.from(JSON.stringify(header));
  const padded = Math.ceil(json.length / 4) * 4;
  const prefix = Buffer.alloc(16 + padded);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(8 + padded, 4);
  prefix.writeUInt32LE(4 + padded, 8);
  prefix.writeUInt32LE(json.length, 12);
  json.copy(prefix, 16);
  fs.writeFileSync(file, Buffer.concat([prefix, ...data]));
}

function fixture(t, { sealed = false, version, dsh } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "purge next ")));
  const resources = path.join(root, "resources");
  const layout = sealed ? "app.asar" : "app";
  const app = path.join(resources, layout);
  const exe = path.join(root, "DSH NEXT.exe");
  const home = path.join(root, "home");
  const profile = path.join(home, "profiles", "desktop");
  fs.mkdirSync(resources, { recursive: true });
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, "package.json"), "{}");
  fs.writeFileSync(exe, "fixture");
  if (sealed) writeAsar(app, nextFiles(version, dsh));
  else putFiles(app, nextFiles(version, dsh));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, resources, app, exe, home, profile, aiBase: path.join(app, "node_modules", "@deepseek-ai") };
}

function addCompatibilityPackages(f, version = "0.2.1-rc.2") {
  for (const name of ["dsh-agent-loop", "dsh-system-prompt", "dsh-agent-instructions"]) {
    const root = path.join(f.aiBase, name);
    fs.mkdirSync(path.join(root, "lib"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: `@deepseek-ai/${name}`, version }));
  }
}

for (const sealed of [false, true]) test(`DSH NEXT ${sealed ? "sealed" : "unpacked"} resolves host, profile, surface and CLI`, t => {
  const f = fixture(t, { sealed });
  const argv = [f.exe, path.join(f.app, "lib", "host.js"), f.app, f.profile];
  const reader = sealed ? diskFs() : fs;
  const host = currentHost({ env: {}, argv, reader });
  assert.equal(host, f.aiBase);
  assert.equal(resolveProfile(f.home, { env: {}, argv, reader }).directory, f.profile);
  assert.equal(hostSurface(host), "desktop");
  assert.deepEqual(desktopHostInfo(host), {
    host_family: "dsh-desktop-next",
    desktop_version: "2.0.19-next",
    desktop_package: "dsh-desktop-next",
    dsh_version: "0.2.1-rc.2",
  });
  const cli = resolveDshCli({ env: {}, argv, reader, execPath: f.exe });
  assert.equal(cli.cli, path.join(f.app, "lib", "desktop-cli.js"));
  assert.equal(cli.source, "当前 DSH NEXT 实例");
  assert.deepEqual(cli.args, ["--expose-internals", cli.cli]);
});

test("DSH NEXT identity rejects spoofed or incomplete application roots", t => {
  const required = ["lib/main.js", "lib/host.js", "lib/desktop-cli.js", "node_modules/@deepseek-ai/dsh/package.json"];
  for (const missing of required) {
    const f = fixture(t);
    fs.unlinkSync(path.join(f.app, missing));
    const argv = [f.exe, path.join(f.app, "lib/host.js"), f.app, f.profile];
    assert.equal(desktopIdentity(f.resources), null, missing);
    assert.equal(currentHost({ env: {}, argv }), "", missing);
  }
  const wrong = fixture(t);
  fs.writeFileSync(path.join(wrong.app, "package.json"), JSON.stringify({ name: "dsh-desktop-next", main: "other.js" }));
  assert.equal(desktopIdentity(wrong.resources), null);
  const outside = path.join(wrong.root, "outside");
  assert.equal(currentHost({ env: {}, argv: [wrong.exe, path.join(outside, "lib/host.js"), outside, wrong.profile] }), "");
});

test("qualified Windows NEXT compatibility carries optional family and desktop version fields", t => {
  const f = fixture(t);
  addCompatibilityPackages(f);
  const report = compatibility(f.aiBase);
  assert.equal(report.host_version, "0.2.1-rc.2");
  assert.equal(report.host_family, "dsh-desktop-next");
  assert.equal(report.desktop_version, "2.0.19-next");
  assert.equal(report.qualified, process.platform === "win32");
  assert.equal(report.level, process.platform === "win32" ? "qualified" : "unverified");
});

test("official-only desktop patches are not applicable to NEXT", async t => {
  const f = fixture(t);
  const ids = new Set([45, 46, 82, 83, 84]);
  const patches = ALL_PATCHES.filter(patch => ids.has(patch.id));
  const status = await patchStatus(f.aiBase, patches, { surface: "desktop" });
  assert.deepEqual(status, { 45: "na", 46: "na", 82: "na", 83: "na", 84: "na" });
  for (const patch of patches) {
    assert.equal(patchAppliesHere(patch, "desktop", "dsh-desktop-next"), false);
    assert.equal(patchAppliesHere(patch, "desktop", "dsh-desktop"), true);
  }
});

test("unpacked NEXT invokes native requestRestart exactly once and never needs a helper", t => {
  const f = fixture(t);
  let calls = 0;
  const ctx = { get(name) { return name === "desktopActions" ? { requestRestart() { calls += 1; } } : null; } };
  const result = scheduleRestart(null, ctx, { exe: f.exe });
  assert.deepEqual(result, { restarting: true, mode: "next-native", engine: "desktopActions" });
  assert.equal(calls, 1);
  assert.equal(desktopRestartChoice({ hostFamily: "dsh-desktop-next", hasRuntime: true }), "next-native");
});

test("unpacked NEXT without native service requests a manual restart", t => {
  const f = fixture(t);
  const result = scheduleRestart(null, null, { exe: f.exe, runtime: null });
  assert.equal(result.restarting, false);
  assert.equal(result.manualRestart, true);
  assert.equal(result.mode, "next-manual");
});

test("sealed NEXT schedules only the Windows handoff and does not request an early restart", t => {
  const f = fixture(t);
  const asar = path.join(f.resources, "sealed.asar");
  let handoffs = 0, restarts = 0;
  fs.writeFileSync(asar, "archive");
  const scheduled = scheduleNextDesktopRestart({
    exe: f.exe,
    asar,
    platform: "win32",
    runtime: { requestRestart() { restarts += 1; } },
    handoff() { handoffs += 1; return { restarting: false, manualQuit: true, handoff: { phase: "starting" } }; },
  });
  assert.equal(handoffs, 1);
  assert.equal(restarts, 0);
  assert.equal(scheduled.manualQuit, true);
  assert.equal(scheduled.mode, "next-handoff");
  assert.equal(scheduled.asarSwap, true);
});

test("NEXT executable identity is distinct and verifiable", t => {
  const f = fixture(t);
  assert.equal(isNextDesktopExecutable(f.exe), true);
});
