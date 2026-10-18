// #90：插话不可用时降级为排队（不再抛 steer-unavailable）；
// 同时把旧版 85/86 写进宿主的改写迁回原生。
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_PATCHES, applyReplacementsToText } from "../lib/core.js";

const p = ALL_PATCHES.find((x) => x.id === 90);
const GUARD =
  '\t\tif (request.action.kind === "steer" && (target !== "next-turn" || agent.status !== "running")) throw new RemoteError("session/steer-unavailable", "current turn no longer accepts steering", { itemId: request.itemId });';
const OLD85 =
  "\t\t\t\t\tagent.followup(message); // [dsh-purge-85] user prompt always next-turn (kill steer→next-step race)";
const OLD86 =
  '\t\t\tcase "steer":\n\t\t\t\tagent.inbox.remove(request.itemId);\n\t\t\t\tagent.followup(message); // [dsh-purge-86] queue steer → next-turn';

test("an unavailable steer queues the message instead of throwing", () => {
  const out = applyReplacementsToText(GUARD, p, "x").text;
  assert.doesNotMatch(out, /throw new RemoteError\("session\/steer-unavailable"/);
  assert.match(out, /agent\.followup\(message\)/);
  assert.match(out, /degraded: "followup"/);
});

test("the old prompt() rewrite is restored to mode-based delivery", () => {
  const out = applyReplacementsToText(OLD85, p, "x").text;
  assert.match(out, /if \(request\.mode === "steer"\) agent\.steer\(message\);/);
  assert.doesNotMatch(out, /dsh-purge-85/);
});

test("the old queue-case rewrite is restored to a real steer", () => {
  const out = applyReplacementsToText(OLD86, p, "x").text;
  assert.match(out, /case "steer":\n\t\t\t\tagent\.inbox\.remove\(request\.itemId\);\n\t\t\t\tagent\.steer\(message\);/);
  assert.doesNotMatch(out, /dsh-purge-86/);
});
