// Isolated real Electron application/status/diagnostic agreement. Never relaunch DSH.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { removeTreeNoFollowSync } from "../lib/remove-tree.js";
if (!process.versions.electron) {
  const binary =
    process.env.PURGE_ELECTRON_EXEC ||
    "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness";
  console.log(
    execFileSync(binary, [fileURLToPath(import.meta.url)], {
      encoding: "utf8",
      timeout: 90000,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    }),
  );
} else {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "purge-entry-runtime-"));
  try {
    const home = path.join(root, "home"),
      profile = path.join(home, "profiles/desktop");
    fs.mkdirSync(profile, { recursive: true });
    Object.assign(process.env, {
      DSH_HOME: home,
      DSH_PROFILE: "desktop",
      DSH_SURFACE: "desktop",
      PURGE_PROFILE_DIR: profile,
      DSH_BASE: "",
    });
    fs.writeFileSync(path.join(profile, "package.json"), "{}");
    const settings = path.join(profile, "cordis.patch.yml"),
      prompt = path.join(home, "prompt-inject.md");
    fs.writeFileSync(settings, "# unchanged settings\n");
    fs.writeFileSync(prompt, "unchanged prompt");
    const { ALL_PATCHES, applyPatches, patchStatus, patchDrift, targetFiles } =
      await import("../lib/core.js");
    const patches = ALL_PATCHES.filter((p) => [82, 83, 84].includes(p.id));
    const reports = [];
    for (const layout of [
      "main.js",
      "lib/main.js",
      "out/main/index.js",
      "out/main/main.js",
    ]) {
      const app = path.join(root, layout.replaceAll("/", "-"), "resources/app"),
        host = path.join(app, "dsh/node_modules/@deepseek-ai");
      fs.mkdirSync(host, { recursive: true });
      const file = path.join(app, layout);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        path.join(app, "package.json"),
        JSON.stringify({ main: layout }),
      );
      const original = patches
        .filter((p) => p.id !== 84)
        .map((p) => p.replacements[0].pattern)
        .join("\n");
      fs.writeFileSync(file, original);
      const decoy = path.join(app, "unused.js");
      fs.writeFileSync(decoy, "DO NOT CHANGE");
      assert.equal(targetFiles(host, home)["desktop-shell"], file);
      const applied = await applyPatches(host, patches);
      assert(
        applied.every((p) => p.status === "applied"),
        JSON.stringify(applied),
      );
      assert.deepEqual(
        await patchStatus(host, patches, { dshHome: home, surface: "desktop" }),
        { 82: "applied", 83: "applied", 84: "applied" },
      );
      assert.equal(
        (await patchDrift(host, patches, { dshHome: home, surface: "desktop" }))
          .desktop_entry.file,
        file,
      );
      const after = fs.readFileSync(file);
      await applyPatches(host, patches);
      assert.deepEqual(fs.readFileSync(file), after);
      fs.writeFileSync(file, original);
      assert.equal(
        (
          await patchStatus(host, patches, {
            dshHome: home,
            surface: "desktop",
          })
        )[83],
        "pending",
      );
      fs.unlinkSync(file);
      const missing = await applyPatches(host, patches);
      assert(
        missing.some((p) => p.patch_id === 83 && p.status === "missing_file"),
      );
      assert.equal(fs.readFileSync(decoy, "utf8"), "DO NOT CHANGE");
      reports.push({
        layout,
        applied: true,
        idempotent: true,
        missingVisible: true,
      });
    }
    assert.equal(fs.readFileSync(settings, "utf8"), "# unchanged settings\n");
    assert.equal(fs.readFileSync(prompt, "utf8"), "unchanged prompt");
    console.log(
      JSON.stringify(
        {
          platform: process.platform,
          electron: process.versions.electron,
          node: process.versions.node,
          reports,
          settingsPreserved: true,
          restart: false,
        },
        null,
        2,
      ),
    );
  } finally {
    removeTreeNoFollowSync(root);
  }
}
