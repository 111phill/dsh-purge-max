import { test } from "node:test";
import assert from "node:assert/strict";
import { registerCommand } from "../lib/command-registration.js";

test("a conflict preserves its owner and registers Purge's discoverable fallback", () => {
  const original = { name: "rewind", handler() {} }, entries = new Map([["rewind", original]]), warnings = [];
  const commands = { register(def) {
    if (entries.has(def.name)) throw Error(`command "${def.name}" is already registered (for a per-agent variant...)`);
    entries.set(def.name, def);
  } };
  const def = { name: "rewind", handler() { return "purge"; } };
  assert.equal(registerCommand(commands, def, "purge-rewind", (s) => warnings.push(s)).state, "fallback");
  assert.equal(entries.get("rewind"), original);
  assert.equal(entries.get("purge-rewind").handler(), "purge");
  assert.equal(warnings.length, 1);
  assert.equal(registerCommand(commands, def, "purge-rewind", () => {}).state, "conflict");
  assert.equal(registerCommand(commands, {name:"rules"}, "purge-rules").state, "registered");
});

test("an inactive context and unexpected registration failures are not disguised as conflicts", () => {
  for (const error of [Object.assign(Error("inactive context"), {code:"INACTIVE_EFFECT"}), Error("schema invalid"), Error('command "other" is already registered')]) {
    assert.throws(() => registerCommand({register() {throw error;}}, {name:"rewind"}, "purge-rewind"), (e) => e === error);
  }
});
