const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  path = require("node:path");
const { buildSync } = require("esbuild");
const code = buildSync({
  entryPoints: [path.join(__dirname, "../src/components/restart.js")],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "browser",
  external: ["react", "react-dom"],
}).outputFiles[0].text;
test("manualQuit response cancels timeout, clears busy, and never polls/reloads or retries restart", async () => {
  const timers = new Map(),
    calls = [],
    notices = [],
    busy = [];
  let id = 0,
    reloads = 0;
  const ctx = {
    module: { exports: {} },
    exports: {},
    require,
    console,
    window: {
      location: {
        reload() {
          reloads++;
        },
      },
    },
    setTimeout: (fn) => {
      timers.set(++id, fn);
      return id;
    },
    clearTimeout: (n) => timers.delete(n),
    fetch: async (url) => {
      calls.push(url);
      return {
        json: async () => ({
          ok: true,
          manualQuit: true,
          restarting: false,
          note: "Please fully quit manually.",
        }),
      };
    },
  };
  ctx.exports = ctx.module.exports;
  vm.runInNewContext(code, ctx);
  ctx.module.exports.restartDsh(
    (x) => notices.push(x),
    (x) => busy.push(x),
    (x) => x,
    "desktop",
  );
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(calls, ["/dsh-purge/restart"]);
  assert.equal(timers.size, 0);
  assert.equal(busy.at(-1), false);
  assert.equal(notices.at(-1).text, "Please fully quit manually.");
  assert.equal(reloads, 0);
});
