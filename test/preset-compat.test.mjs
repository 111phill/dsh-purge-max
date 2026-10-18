import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundledPresetDir } from "../lib/presets.js";
import { readPresetDefinition } from "../lib/redteam/preset-composition.js";
import {
  migratePresetDefinition,
  backupPresetMigration,
  registerPresetDefinitions,
} from "../lib/preset-compat.js";

const walk = (rows) =>
  rows.flatMap((row) => (row.group ? [row, ...walk(row.config)] : [row]));
const spawn = (def) =>
  walk(def.plugins).find(
    (row) =>
      row.name === "@deepseek-ai/dsh-tool-subagent" &&
      row.config.provider === "spawn",
  );
const definition = () =>
  readPresetDefinition("unrestricted", bundledPresetDir());

test("legacy filters become child presets without dropping parent tools, settings or persona", () => {
  const before = definition();
  const original = structuredClone(before);
  spawn(before).config.maxDepth = 1;
  const {
    definitions: [child, parent],
    policies,
  } = migratePresetDefinition(before);
  assert.deepEqual(before, original, "caller definition is not modified");
  const expected = structuredClone(original);
  delete spawn(expected).config.toolFilter;
  spawn(expected).config.agentPreset = child.id;
  assert.deepEqual(parent, expected, "only legacy policy replaced on parent");
  assert.deepEqual(
    child.plugins.find((row) => row.id === "persona"),
    before.plugins.find((row) => row.id === "persona"),
  );
  assert.equal(spawn(child).config.maxDepth, 1);
  assert.equal(
    spawn(child).config.agentPreset,
    undefined,
    "no self-reference at activation",
  );
  assert(
    !walk(child.plugins).some((row) =>
      ["tool-subagent-fork", "tool-workflow", "tool-ralph"].includes(row.id),
    ),
  );
  for (const id of ["tool-subagent-fork", "tool-workflow", "tool-ralph"])
    assert(walk(parent.plugins).some((row) => row.id === id));
  assert.deepEqual(policies[0].deny, ["subagent_fork", "workflow", "ralph"]);
  assert.deepEqual(
    migratePresetDefinition(parent),
    { definitions: [parent], policies: [] },
    "modern declarations pass through",
  );
});

test("ambiguous or unrepresentable policies stop without broadening the child tool plane", () => {
  for (const filter of [
    { allow: ["read"] },
    { deny: ["unknown_global_tool"] },
    { deny: ["ralph", "ralph"] },
    null,
  ]) {
    const before = definition();
    spawn(before).config.toolFilter = filter;
    const snapshot = structuredClone(before);
    assert.throws(
      () => migratePresetDefinition(before),
      /configuration retained/,
    );
    assert.deepEqual(before, snapshot);
  }
  for (const patch of [
    { provider: "fork" },
    { agentPreset: "custom-child" },
    { allowedAgentPresets: ["custom-child"] },
  ]) {
    const before = definition();
    Object.assign(spawn(before).config, patch);
    assert.throws(
      () => migratePresetDefinition(before),
      /configuration retained/,
    );
  }
});

test("backup is byte-exact, idempotent, private, and refuses corrupt snapshots", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "purge-preset-compat-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const dir = path.join(home, ".agent-presets/unrestricted");
  fs.cpSync(bundledPresetDir(), dir, { recursive: true });
  // Include custom text/CRLF/expressions; backup must not serialize or evaluate it.
  fs.appendFileSync(
    path.join(dir, "agent.cordis.yml"),
    "# custom user text\r\n",
  );
  const args = {
    home,
    dir,
    id: "unrestricted",
    policies: migratePresetDefinition(definition()).policies,
  };
  const before = fs.readFileSync(path.join(dir, "agent.cordis.yml"));
  const backup = backupPresetMigration(args);
  assert.deepEqual(
    fs.readFileSync(path.join(backup, "agent.cordis.yml")),
    before,
  );
  assert.deepEqual(fs.readFileSync(path.join(dir, "agent.cordis.yml")), before);
  assert.equal(backupPresetMigration(args), backup);
  if (process.platform !== "win32")
    assert.equal(
      fs.statSync(path.join(backup, "agent.cordis.yml")).mode & 0o777,
      0o600,
    );
  fs.writeFileSync(path.join(backup, "preset.yml"), "corrupt");
  assert.throws(() => backupPresetMigration(args), /mismatch/);
  assert.equal(backupPresetMigration({ policies: [] }), undefined);
});

test("native activation failures unwind helpers; successful registration disposes parent first exactly once", async () => {
  const defs = migratePresetDefinition(definition()).definitions;
  const events = [];
  const reg = {
    async register(def) {
      events.push("+" + def.id);
      return async () => {
        events.push("-" + def.id);
      };
    },
    async resolve(id) {
      return {
        id,
        ...(id === "unrestricted" ? { broken: "actual Loader error" } : {}),
      };
    },
  };
  await assert.rejects(
    registerPresetDefinitions(reg, defs),
    /actual Loader error/,
  );
  assert.deepEqual(events, [
    "+" + defs[0].id,
    "+unrestricted",
    "-unrestricted",
    "-" + defs[0].id,
  ]);
  events.length = 0;
  reg.resolve = async (id) => ({ id });
  const release = await registerPresetDefinitions(reg, defs);
  await release();
  await release();
  assert.deepEqual(events, [
    "+" + defs[0].id,
    "+unrestricted",
    "-unrestricted",
    "-" + defs[0].id,
  ]);
});
