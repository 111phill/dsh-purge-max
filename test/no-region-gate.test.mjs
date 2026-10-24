// 破甲插件不做「公网目标一律拒绝」的门禁：那是上游 1.1.7x 的靶场限制。
// 这里钉住两件事：net-scope 不再导出安装器；index 不再安装它。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as netScope from "../lib/net-scope.js";

test("net-scope no longer ships a request gate", () => {
  assert.equal(netScope.installRegionGate, undefined);
  assert.equal(netScope.isAttackTask, undefined);
  assert.equal(netScope.taskTargetHit, undefined);
});

test("the plugin entry never installs a region gate", () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, "../lib/index.js"), "utf8");
  assert.doesNotMatch(src, /installRegionGate/);
  assert.doesNotMatch(src, /严令禁止/);
});

test("allow-list helpers stay exported for the settings card", () => {
  for (const name of ["readAllowText", "writeAllowText", "normalizeAllowText", "ownServerNote"]) {
    assert.equal(typeof netScope[name], "function", `${name} 应保留`);
  }
});
