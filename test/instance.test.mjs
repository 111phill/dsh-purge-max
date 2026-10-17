import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveProfile, currentHost, resolveDshCli } from "../lib/instance.js";
import {
  Maintenance,
  defaultProfile,
  installWithDsh,
} from "../lib/community.js";
import { selfCheck, hostLayoutLayer } from "../lib/selfcheck.js";
function fixture() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "purge-instance-")),
  );
  const home = path.join(root, "home");
  fs.mkdirSync(home);
  const profile = (name) => {
    const p = path.join(home, "profiles", name);
    fs.mkdirSync(p, { recursive: true });
    fs.writeFileSync(path.join(p, "package.json"), "{}");
    return p;
  };
  const npm = path.join(root, "npm/node_modules/@deepseek-ai");
  const pkg = path.join(npm, "dsh");
  fs.mkdirSync(path.join(pkg, "lib"), { recursive: true });
  fs.writeFileSync(
    path.join(pkg, "package.json"),
    JSON.stringify({ name: "@deepseek-ai/dsh", bin: { dsh: "lib/bin.mjs" } }),
  );
  const cli = path.join(pkg, "lib/bin.mjs");
  fs.writeFileSync(
    cli,
    `import fs from 'node:fs';fs.writeFileSync(process.env.DSH_HOME+'/invocation.json',JSON.stringify({args:process.argv.slice(2),home:process.env.DSH_HOME,profile:process.env.DSH_PROFILE}));`,
  );
  const resources = path.join(root, "Desktop.app/Contents/Resources"),
    desktop = path.join(resources, "app/dsh/node_modules/@deepseek-ai");
  fs.mkdirSync(path.join(desktop, "dsh-desktop-host/lib"), { recursive: true });
  fs.writeFileSync(path.join(resources, "app.asar"), "fixture archive");
  fs.writeFileSync(path.join(desktop, "dsh-desktop-host/lib/cli.js"), "");
  return {
    root,
    home,
    profile,
    npm,
    cli,
    desktop,
    resources,
    close: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
test("unique web profile is shared by maintenance and diagnostics, without desktop fallback", async () => {
  const f = fixture();
  try {
    const p = f.profile("web");
    fs.writeFileSync(
      path.join(p, "cordis.patch.yml"),
      "defaultPreset: workspace-write\n",
    );
    const options = {
      env: {},
      argv: [],
      coreModule: { ALL_PATCHES: [], patchStatus: async () => ({}) },
    };
    assert.equal(defaultProfile(f.home, options), p);
    const report = await selfCheck(f.npm, f.home, options);
    const cfg = report.layers.find((x) => x.kind === "config");
    assert.equal(cfg.detail.file, path.join(p, "cordis.patch.yml"));
    assert.equal(
      cfg.ok,
      false,
      "intentional permissions must remain an actual config state",
    );
    assert.equal(
      fs.readFileSync(cfg.detail.file, "utf8"),
      "defaultPreset: workspace-write\n",
    );
  } finally {
    f.close();
  }
});
test("profile resolution honors explicit path, host argv, both profile flag forms, then env", () => {
  const f = fixture();
  try {
    const web = f.profile("web"),
      desktop = f.profile("desktop"),
      base = {
        env: { DSH_PROFILE: "desktop" },
        argv: ["node", "dsh", "--profile", "web"],
      };
    assert.equal(resolveProfile(f.home, base).directory, web);
    assert.equal(
      resolveProfile(f.home, {
        ...base,
        argv: ["node", "dsh", "--profile=web"],
      }).directory,
      web,
    );
    assert.equal(
      resolveProfile(f.home, { ...base, argv: ["node", "host", web] })
        .directory,
      web,
    );
    assert.equal(
      resolveProfile(f.home, { ...base, profile: desktop }).directory,
      desktop,
    );
    assert.equal(
      resolveProfile(f.home, { env: { DSH_PROFILE: "web" }, argv: [] })
        .directory,
      web,
    );
    assert.equal(
      resolveProfile(f.home, { env: { PURGE_PROFILE_DIR: web }, argv: [] })
        .directory,
      web,
    );
  } finally {
    f.close();
  }
});
test("ambiguous, missing or conflicting profiles fail explicitly instead of choosing desktop", async () => {
  const f = fixture();
  try {
    f.profile("web");
    f.profile("desktop");
    assert.throws(
      () => defaultProfile(f.home, { env: {}, argv: [] }),
      /无法唯一确定/,
    );
    assert.throws(
      () =>
        defaultProfile(f.home, { env: { DSH_PROFILE: "missing" }, argv: [] }),
      /未找到/,
    );
    assert.throws(
      () =>
        defaultProfile(f.home, {
          env: {},
          argv: ["--profile", "web", "--profile=desktop"],
        }),
      /多个 --profile/,
    );
    const r = await selfCheck(f.npm, f.home, {
      env: {},
      argv: [],
      coreModule: { ALL_PATCHES: [], patchStatus: async () => ({}) },
    });
    assert(
      r.layers
        .find((l) => l.kind === "config")
        .detail.error.includes("无法唯一确定"),
    );
  } finally {
    f.close();
  }
});
test("Web CLI uses its own npm package metadata even when another Desktop is installed", () => {
  const f = fixture();
  try {
    const argv = ["node", f.cli, "web"];
    assert.equal(currentHost({ argv, env: {} }), f.npm);
    const cli = resolveDshCli({
      argv,
      env: {},
      resourcesPath: f.resources,
      execPath: process.execPath,
    });
    assert.equal(cli.cli, f.cli);
    assert.equal(cli.source, "当前 npm/Node 实例");
    assert.equal(cli.command, process.execPath);
  } finally {
    f.close();
  }
});
test("explicit JS CLI override takes priority and a missing target is not replaced by another install", () => {
  const f = fixture();
  try {
    assert.equal(
      resolveDshCli({ aiBase: f.desktop, env: { PURGE_DSH_CLI: f.cli } }).cli,
      f.cli,
    );
    assert.throws(
      () =>
        resolveDshCli({
          env: {},
          argv: ["node", "unknown"],
          resourcesPath: undefined,
        }),
      /无法定位当前 DSH 实例/,
    );
    assert.throws(
      () =>
        resolveDshCli({
          env: { PURGE_DSH_CLI: path.join(f.root, "missing") },
          argv: [],
        }),
      /文件不存在/,
    );
  } finally {
    f.close();
  }
});
test("headless installer executes npm CLI with the exact home and selected profile", async () => {
  const f = fixture();
  try {
    const p = f.profile("web");
    const manager = new Maintenance({
      home: f.home,
      profile: p,
      aiBase: f.npm,
    });
    await installWithDsh("/fixture.tgz", manager, {
      env: {},
      argv: ["node", f.cli, "web"],
      resourcesPath: undefined,
    });
    const invocation = JSON.parse(
      fs.readFileSync(path.join(f.home, "invocation.json"), "utf8"),
    );
    assert.deepEqual(invocation, {
      args: ["plugin", "--profile", "web", "add", "/fixture.tgz"],
      home: f.home,
      profile: "web",
    });
  } finally {
    f.close();
  }
});
test("Web host layout is explicitly not applicable, without probing a coexisting sealed Desktop", () => {
  const f = fixture();
  try {
    const layer = hostLayoutLayer(f.npm, {
      statSync() {
        throw Error("must not scan another app");
      },
    });
    assert.equal(layer.state, "na");
    assert.equal(layer.applicable, false);
    assert.equal(layer.total, 0);
    assert.equal(layer.applied, 0);
    assert.equal(layer.detail.asar_still_sealed, null);
  } finally {
    f.close();
  }
});
test("Desktop layout checks only the requested resource directory and reports uncertainty", () => {
  const f = fixture();
  try {
    assert.equal(
      hostLayoutLayer(f.desktop).detail.archive,
      path.join(f.resources, "app.asar"),
    );
    assert.equal(hostLayoutLayer(f.desktop).state, "broken");
    fs.unlinkSync(path.join(f.resources, "app.asar"));
    assert.equal(hostLayoutLayer(f.desktop).state, "ok");
    assert.equal(hostLayoutLayer("").detail.surface, "unknown");
    assert.equal(hostLayoutLayer("").ok, false);
  } finally {
    f.close();
  }
});
test("target-specific selfcheck does not mutate global surface or inspect another Desktop", async () => {
  const f = fixture();
  try {
    f.profile("web");
    const before = process.env.DSH_SURFACE;
    let target;
    const result = await selfCheck(f.npm, f.home, {
      env: {},
      argv: [],
      coreModule: {
        ALL_PATCHES: [],
        patchStatus: async (host, patches, options) => {
          target = { host, ...options };
          return {};
        },
      },
    });
    assert.equal(target.host, f.npm);
    assert.equal(target.surface, "web");
    assert.equal(process.env.DSH_SURFACE, before);
    assert.equal(result.summary.layout.total, 0);
    assert(!result.hints.some((h) => h.title === "宿主运行方式"));
  } finally {
    f.close();
  }
});

test("foreign host profile directories are rejected instead of silently changing DSH_HOME target", () => {
  const f = fixture();
  try {
    f.profile("web");
    assert.throws(
      () =>
        resolveProfile(f.home, {
          env: {},
          argv: ["node", "host", path.join(f.root, "other/profiles/web")],
        }),
      /不属于当前 DSH_HOME/,
    );
  } finally {
    f.close();
  }
});
test("Desktop CLI discovery stays in the explicitly requested resources", () => {
  const f = fixture();
  try {
    const cli = resolveDshCli({
      aiBase: f.desktop,
      env: {},
      argv: [],
      execPath: process.execPath,
    });
    assert.equal(cli.cli, path.join(f.desktop, "dsh-desktop-host/lib/cli.js"));
    assert.deepEqual(cli.args, ["--expose-internals", cli.cli]);
  } finally {
    f.close();
  }
});
test("symlinked npm entry resolves to the same package, without consulting PATH", () => {
  const f = fixture();
  try {
    const link = path.join(f.root, "dsh-link");
    fs.symlinkSync(f.cli, link);
    assert.equal(currentHost({ env: {}, argv: ["node", link, "web"] }), f.npm);
    assert.equal(
      resolveDshCli({ env: {}, argv: ["node", link, "web"] }).cli,
      f.cli,
    );
  } finally {
    f.close();
  }
});
test("unreadable Desktop archive is uncertainty, not a successful layout check", () => {
  const f = fixture();
  try {
    const layer = hostLayoutLayer(f.desktop, {
      statSync() {
        throw Object.assign(Error("permission denied"), { code: "EACCES" });
      },
    });
    assert.equal(layer.ok, false);
    assert.equal(layer.detail.asar_still_sealed, null);
    assert.equal(layer.broken[0].status, "unreadable");
  } finally {
    f.close();
  }
});

test("an unresolved nonempty host path is unknown rather than an assumed Web installation", () => {
  const f = fixture();
  try {
    const layer = hostLayoutLayer(path.join(f.root, "missing-host"));
    assert.equal(layer.detail.surface, "unknown");
    assert.equal(layer.ok, false);
    assert.equal(layer.applied, 0);
  } finally {
    f.close();
  }
});

test("a symlinked profile keeps its logical CLI name while using the canonical data directory", async () => {
  const f = fixture();
  try {
    const target = path.join(f.root, "external-config");
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, "package.json"), "{}");
    fs.mkdirSync(path.join(f.home, "profiles"));
    const logical = path.join(f.home, "profiles/web");
    fs.symlinkSync(target, logical);
    assert.equal(
      defaultProfile(f.home, { env: {}, argv: ["node", "host", logical] }),
      target,
    );
    const manager = new Maintenance({
      home: f.home,
      profile: logical,
      aiBase: f.npm,
    });
    await installWithDsh("/fixture.tgz", manager, { env: {}, argv: [] });
    const invocation = JSON.parse(
      fs.readFileSync(path.join(f.home, "invocation.json"), "utf8"),
    );
    assert.equal(invocation.profile, "web");
  } finally {
    f.close();
  }
});
