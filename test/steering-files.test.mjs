import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  ALL_PATCHES,
  backupAll,
  applyPatches,
  revertAll,
} from "../lib/core.js";
import {
  NATIVE_QUEUE_GUARD,
  OLD_QUEUE_FALLBACK,
  nativeSteeringRestored,
} from "../lib/steering.js";
const f = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/steering-rc2.json", import.meta.url),
    "utf8",
  ),
);
const p = ALL_PATCHES.find((x) => x.id === 90);
test("isolated files: backup, migrate, apply twice and rollback preserve bytes/settings", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "purge-steer-files-"));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = path.join(root, "home");
  try {
    const home = process.env.DSH_HOME;
    fs.mkdirSync(path.join(home, "profiles/desktop"), { recursive: true });
    fs.writeFileSync(path.join(home, "profiles/desktop/package.json"), "{}");
    const settings = path.join(home, "prompt-inject.md");
    fs.writeFileSync(settings, "User-owned ordinary task instructions.");
    const aiBase = path.join(root, "node_modules/@deepseek-ai");
    const controller = path.join(
        aiBase,
        "dsh-api-session-controller/lib/index.js",
      ),
      loop = path.join(aiBase, "dsh-agent-loop/lib/index.js");
    for (const file of [controller, loop])
      fs.mkdirSync(path.dirname(file), { recursive: true });
    const original = f.controller.replace(
      NATIVE_QUEUE_GUARD,
      OLD_QUEUE_FALLBACK,
    );
    fs.writeFileSync(controller, original);
    fs.writeFileSync(loop, f.agentMethods);
    assert.deepEqual((await backupAll(aiBase)).errors, []);
    let report = await applyPatches(aiBase, [p]);
    assert.equal(report[0].status, "applied");
    assert(nativeSteeringRestored(fs.readFileSync(controller, "utf8")));
    assert.equal(
      fs.readFileSync(controller + ".dshpurge.bak", "utf8"),
      original,
    );
    const once = fs.readFileSync(controller, "utf8");
    report = await applyPatches(aiBase, [p]);
    assert.equal(report[0].status, "already");
    assert.equal(fs.readFileSync(controller, "utf8"), once);
    assert.deepEqual((await revertAll(aiBase)).errors, []);
    assert.equal(fs.readFileSync(controller, "utf8"), original);
    assert.equal(
      fs.readFileSync(settings, "utf8"),
      "User-owned ordinary task instructions.",
    );
    // Unknown variant is rejected, and no partial content reaches disk.
    const unknown = original.replace(
      "else agent.followup(message);",
      "else agent.customSend(message);",
    );
    fs.writeFileSync(controller, unknown);
    report = await applyPatches(aiBase, [p]);
    assert.equal(report[0].status, "pattern_not_found");
    assert.equal(fs.readFileSync(controller, "utf8"), unknown);
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
