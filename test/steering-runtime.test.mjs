// Execute actual shipped method bodies, not replacement-string assertions.
// Persistence, admission services and client projection are in-memory doubles;
// no live DSH, network, model, account, or default profile is accessed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { ALL_PATCHES, applyReplacementsToText } from "../lib/core.js";
import {
  NATIVE_QUEUE_GUARD,
  NATIVE_PROMPT,
  NATIVE_QUEUE_CASE,
  NATIVE_STEER,
  OLD_QUEUE_FALLBACK,
  OLD_PROMPT,
  OLD_QUEUE_CASE,
  OLD_STEER,
  UPSTREAM_RECOVERED_STEER,
} from "../lib/steering.js";
const p = ALL_PATCHES.find((x) => x.id === 90);
const f = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/steering-rc2.json", import.meta.url),
    "utf8",
  ),
);
function method(text, name, indent = "\t", async = false) {
  const a = text.indexOf(indent + (async ? "async " : "") + name + "(");
  assert(a >= 0);
  const b = text.indexOf("\n" + indent + "}", a) + indent.length + 2;
  assert(b > a);
  return text.slice(a, b);
}
// Optional private acceptance against current installed artifacts; read-only.
if (process.env.PURGE_TEST_HOST) {
  const read = (pkg, file) =>
    fs.readFileSync(
      path.join(process.env.PURGE_TEST_HOST, pkg, "lib", file),
      "utf8",
    );
  const c = read("dsh-api-session-controller", "index.js"),
    l = read("dsh-agent-loop", "index.js"),
    u = read("dsh-client-ui-conversation", "client.js");
  f.controller = applyReplacementsToText(
    method(c, "prompt", "\t", true) +
      ",\n" +
      method(c, "updateQueue", "\t", true),
    p,
  ).text;
  const a = l.indexOf("var ReactLoopInbox = class {");
  assert(a >= 0);
  f.inbox = l.slice(a, l.indexOf("\n};", a) + 3) + "\nReactLoopInbox;";
  f.agentMethods = applyReplacementsToText(
    ["send", "followup", "steer"].map((n) => method(l, n)).join(",\n"),
    p,
  ).text;
  f.uiSteerQueue = method(u, "steerQueue", "\t\t\t", true);
}
const versions = {
  native: { controller: f.controller, loop: f.agentMethods },
  upstream169: {
    controller: f.controller
      .replace(NATIVE_PROMPT, OLD_PROMPT)
      .replace(NATIVE_QUEUE_CASE, OLD_QUEUE_CASE),
    loop: f.agentMethods.replace(NATIVE_STEER, OLD_STEER),
  },
  upstream171: {
    controller: f.controller
      .replace(NATIVE_PROMPT, OLD_PROMPT)
      .replace(NATIVE_QUEUE_CASE, OLD_QUEUE_CASE),
    loop: f.agentMethods.replace(NATIVE_STEER, UPSTREAM_RECOVERED_STEER),
  },
  fork126: {
    controller: f.controller.replace(NATIVE_QUEUE_GUARD, OLD_QUEUE_FALLBACK),
    loop: f.agentMethods,
  },
};
class RemoteError extends Error {
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}
const globals = {
  RemoteError,
  hasApiSessionSubagentOwner: () => false,
  hasPromptContent: (c) => c.some((x) => x.type === "text" && x.text.trim()),
  freezeMessage: (x) => x,
  assertNever: () => {
    throw Error("unknown action");
  },
  hasPromptRequest: () => false,
  resolvePromptFileReceipts: (content) => ({ content, receiptIds: [] }),
  createUserMessage: (x) => ({ id: "direct", ...x }),
  __addDisposableResource$3: (_, x) => x,
  __disposeResources$3: (e) => {
    if (e.hasError) throw e.error;
  },
  remoteErrorOf: (e) => (e instanceof RemoteError ? e : undefined),
  AttachmentError: class extends Error {},
};
const Inbox = vm.runInNewContext(f.inbox),
  ui = vm.runInNewContext("({" + f.uiSteerQueue + "})");
const msg = (id) => ({
  id,
  source: { kind: "user" },
  content: [{ type: "text", text: "Use PostgreSQL." }],
});
function runtime(
  version,
  { migrate = true, status = "running", aborted = false, ids = ["a"] } = {},
) {
  const source = versions[version],
    patched = (x) => (migrate ? applyReplacementsToText(x, p).text : x);
  const commands = vm.runInNewContext(
    "({" + patched(source.controller) + "})",
    globals,
  );
  const methods = vm.runInNewContext("({" + patched(source.loop) + "})");
  const state = { "next-turn": ids.map(msg), "next-step": [] },
    events = [],
    wake = [];
  const session = {
    id: "test",
    append(type, data) {
      state[data.target].splice(
        data.start,
        data.removedCount ?? 0,
        ...data.inserted,
      );
      events.push({ type, data });
      return { data };
    },
  };
  const inbox = new Inbox({ stateOf: () => state }, session, {
    emit: (type, data) => events.push({ type, id: data.message?.id }),
  });
  const agent = {
    ...methods,
    id: "test",
    session,
    inbox,
    status,
    phase: {
      kind: status === "idle" ? "idle" : "running",
      abort: { signal: { aborted } },
    },
    wakeDriver: (x) => wake.push(x),
  };
  const self = {
    ctx: {
      agents: { get: () => agent },
      attachments: { admitPromptContent: async (x) => x },
      fileUploads: { bindPrompt: () => ({ commit() {} }), retirePrompt() {} },
    },
    resolveAgent: async () => agent,
    agents: {},
  };
  return {
    state,
    inbox,
    agent,
    events,
    wake,
    snapshot: () => JSON.parse(JSON.stringify(state)),
    async update(id = "a", kind = "steer", extra = {}) {
      try {
        return {
          ok: true,
          value: await commands.updateQueue.call(self, {
            sessionId: "test",
            itemId: id,
            action: { kind, ...extra },
          }),
        };
      } catch (e) {
        return { ok: false, error: { code: e.code, message: e.message } };
      }
    },
    direct: (mode) =>
      commands.prompt.call(
        self,
        { sessionId: "test", requestId: "r", mode, content: msg("x").content },
        { kind: "user" },
      ),
  };
}
function ids(messages) {
  return Array.from(messages, (m) => m.id);
}
for (const version of Object.keys(versions)) {
  test(`${version}: repeated UI gestures preserve one current-turn delivery`, async () => {
    const r = runtime(version),
      notices = [];
    const session = {
      projections: {
        faceOf: () => ({ getSnapshot: () => ({ "next-turn": [msg("a")] }) }),
      },
      updateQueue: (id, action) => r.update(id, action.kind),
    };
    await Promise.all(
      Array.from({ length: 4 }, () =>
        ui.steerQueue.call({ t: (x) => x }, session, {
          notify: (...a) => notices.push(a),
        }),
      ),
    );
    assert.deepEqual(ids(r.state["next-step"]), ["a"]);
    assert.equal(notices.length, 0);
    assert.deepEqual(ids(r.inbox.claim("next-step", "turn-1")), ["a"]);
    assert.deepEqual(ids(r.inbox.claim("next-step", "turn-1")), []);
    assert.equal((await r.update()).error.code, "session/queue-item-not-found");
  });
  test(`${version}: idle queue and transition to idle preserve FIFO`, async () => {
    const r = runtime(version, { ids: ["a", "b"], status: "idle" }),
      before = r.snapshot();
    assert.equal((await r.update()).error.code, "session/steer-unavailable");
    assert.deepEqual(r.snapshot(), before);
    r.agent.status = "running";
    await r.update();
    r.agent.status = "idle";
    await r.update();
    assert.deepEqual(ids(r.state["next-step"]), ["a"]);
    assert.deepEqual(ids(r.state["next-turn"]), ["b"]);
    assert.deepEqual(ids(r.inbox.claim("next-turn", "turn-2")), ["a", "b"]);
  });
  test(`${version}: direct steer, queue and native abort fallback`, async () => {
    for (const status of ["idle", "running"])
      for (const mode of ["steer", "queue"]) {
        const r = runtime(version, { ids: [], status });
        await r.direct(mode);
        assert.deepEqual(
          ids(r.state[mode === "steer" ? "next-step" : "next-turn"]),
          ["direct"],
        );
        assert.equal(r.wake.length, 1);
      }
    const r = runtime(version, { aborted: true });
    await r.update();
    assert.deepEqual(ids(r.state["next-turn"]), ["a"]);
    assert.deepEqual(r.wake, [true]);
  });
  test(`${version}: multi-message order, edit/remove, claimed items`, async () => {
    const r = runtime(version, { ids: ["a", "b", "c"] });
    await r.update("b", "edit", {
      content: [{ type: "text", text: "Use SQLite." }],
    });
    await r.update("c", "remove");
    await r.update("a");
    await r.update("b");
    const claimed = r.inbox.claim("next-step", "turn-1");
    assert.deepEqual(ids(claimed), ["a", "b"]);
    assert.equal(claimed[1].content[0].text, "Use SQLite.");
    assert.equal(
      (await r.update("a")).error.code,
      "session/queue-item-not-found",
    );
    assert.equal(r.inbox.hasPending, false);
  });
}
test("negative control: 1.6.26 reproduces silent undo and queue reordering without migration", async () => {
  const r = runtime("fork126", { migrate: false });
  await r.update();
  await r.update();
  assert.deepEqual(ids(r.inbox.claim("next-step", "turn-1")), []);
  assert.deepEqual(ids(r.state["next-turn"]), ["a"]);
  const idle = runtime("fork126", {
    migrate: false,
    status: "idle",
    ids: ["a", "b"],
  });
  await idle.update();
  assert.deepEqual(ids(idle.state["next-turn"]), ["b", "a"]);
});
test("negative control: historical upstream UI steering queues instead", async () => {
  for (const version of ["upstream169", "upstream171"]) {
    const r = runtime(version, { migrate: false });
    await r.update();
    assert.deepEqual(ids(r.state["next-step"]), []);
    assert.deepEqual(ids(r.state["next-turn"]), ["a"]);
  }
});
