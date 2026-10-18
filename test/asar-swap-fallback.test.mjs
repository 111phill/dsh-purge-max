// asar swap 失败后的兜底：不能只写 rename-pending 就走，得继续等空闲再换包。
// 背景：官方桌面版点「重启」时壳会在几秒内把进程拉回来，app.asar 被重新占用，
// 80 次 Move-Item 全部失败 → 旧逻辑写个 lock 就退出，lock 没有消费者，
// 用户看到报错、补丁仍旧没生效。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../lib/desktop.js", import.meta.url), "utf8");
const swapScript = source.slice(
  source.indexOf("const ASAR_SWAP_PS1 = ["),
  source.indexOf("const ASAR_RENAME_WHEN_IDLE_PS1 = ["),
);

test("ASAR_SWAP_PS1 换包失败后进入常驻等待分支", () => {
  assert.ok(swapScript, "找不到 ASAR_SWAP_PS1");
  const failed = swapScript.indexOf("} else {");
  assert.ok(failed > 0, "找不到失败分支");
  const tail = swapScript.slice(failed);
  assert.match(tail, /Set-Content -LiteralPath \$lock/, "失败分支要先落 rename-pending 标记");
  assert.match(tail, /while \(\(Get-Date\) -lt \$idleDeadline/, "失败分支要常驻等待，不能直接退出");
  assert.match(tail, /Test-Path -LiteralPath \$AsarPath/, "等待条件要盯 asar 是否还在");
  assert.match(tail, /Move-Item -LiteralPath \$AsarPath -Destination \$bak/, "等到空闲后要真的换包");
  assert.match(tail, /Remove-Item -LiteralPath \$lock/, "换包成功要清掉 lock");
  assert.match(tail, /Start-Process -FilePath \$ExePath/, "换包成功后要自己把客户端拉起来");
});
