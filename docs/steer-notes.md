# steer / 插话：现状与复现计划

> 未改动代码。补丁 #85/#86 仍按原样生效。本文件记录静态核查结果与下一步的复现设计。

## 1. 现状（补丁做了什么）

| 补丁 | 位置 | 改动 |
| --- | --- | --- |
| #85 | `api-session-controller` `prompt()` | 原版 `if (request.mode === "steer") agent.steer(message); else agent.followup(message);` → 一律 `followup` |
| #86 | `api-session-controller` `updateQueue()` `case "steer"` | 原版 `agent.steer(message)` → `agent.followup(message)` |

结果：Ctrl+Enter（插话）与队列里的 steer 都变成"下一轮投递"。

## 2. 静态核查（原始宿主源码，取自 `.dshpurge.bak`）

`dsh-agent-loop/lib/index.js`：

```js
send(message, target, wakeup) {
  const wakingAfterAbort = wakeup && this.phase.kind !== "idle" && this.phase.abort.signal.aborted;
  const resolvedTarget = wakingAfterAbort ? "next-turn" : target;
  this.inbox.splice(resolvedTarget, Infinity, 0, [message]);
  if (wakeup) this.wakeDriver(wakingAfterAbort);
}
steer(input) { this.send(input, "next-step", true); }
```

结论：**`steer()` 在 idle 时不会抛错**，它把消息塞进 `next-step` 并唤醒 driver。所以"空闲调用 steer 被拒"这个根因假设（补丁注释里那句"二轮立刻发被拒根因"）在 agent-loop 层不成立。

## 3. 两个仍可能的失效点

1. **消息滞留**：回合结束条件是 `turnEnds && this.inbox.nextStep.length === 0`（`index.js:1008/1015`）。如果 steer 恰好在最后一次 `step/end` 之后、break 判定之前到达，消息留在 `next-step`，而下一回合只消费 `next-turn` → 表现为"发了没反应"。
2. **客户端层拒绝**：`mode: "steer"` 可能在 UI/网关层就被拦（例如 agent 状态非 running 时不允许插话），与 agent-loop 无关。

两者都不是"agent.steer 抛错"，需要运行时证据区分。

## 4. 复现设计（下一步实施）

用 `test/desktop-presets.mjs` 相同的方式起真实 Agent（Loader + 预设 + 空 Agent），但模型用**可控 stub**（不调 LLM，按脚本产出固定步骤）：

- 场景 A：agent idle 时 `prompt(mode="steer")` ×2（间隔 50ms）→ 断言两条都进入 `inbox.nextTurn` 或都被消费；
- 场景 B：agent running（stub 第一步故意 sleep 300ms）时 `prompt(mode="steer")` → 断言进入 `nextStep` 且在当前回合被消费；
- 场景 C：在最后一步 `step/end` 后 10ms 投递 steer → 断言不滞留；
- 场景 D：`updateQueue` 的 `case "steer"`（队列里点"插话"）→ 断言进入 `nextStep`。

每条都记录 `session` 事件序列（`turn/start`、`step/start`、`message` 投递、`turn/end`），失败时打印序列而不是只报 true/false。

## 5. 验收标准

- 消息不丢：投递后必定出现在 `inbox` 或 session 事件里；
- 不重复：同一请求只消费一次；
- 插话及时：场景 B 的 steer 在当前回合内被消费，不跨回合；
- 排队正确：`mode:"followup"` 即使 agent running 也必须留在 `nextTurn`。

通过后，再把 #85/#86 还原成原生写法（或按复现结论做最小修正），并跑同一套测试回归。
