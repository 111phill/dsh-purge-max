const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  path = require("node:path");
const React = require("react"),
  { create, act } = require("react-test-renderer"),
  { buildSync } = require("esbuild");
const code = buildSync({
  entryPoints: [path.join(__dirname, "../src/components/welcome.js")],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "browser",
  external: ["react", "react-dom"],
  loader: { ".css": "text" },
}).outputFiles[0].text;
test("first-run notice carries its own modal CSS and never accepts itself", () => {
  const writes = [];
  const ctx = {
    module: { exports: {} },
    exports: {},
    require,
    console,
    window: {
      localStorage: {
        getItem: () => null,
        setItem: (...args) => writes.push(args),
      },
    },
  };
  ctx.exports = ctx.module.exports;
  vm.runInNewContext(code, ctx);
  let tree;
  act(() => {
    tree = create(React.createElement(ctx.module.exports.WelcomeNotice));
  });
  const modal = tree.root.findByProps({ role: "dialog" });
  assert.equal(modal.props.className, "dshpp-welcome-mask");
  const css = tree.root.findByType("style").children.join("");
  assert.match(css, /position: fixed/);
  assert.match(css, /max-height:/);
  assert.match(css, /\.dshpp-welcome-card/);
  assert.equal(tree.root.findByType("button").props.disabled, true);
  assert.equal(tree.root.findByType("input").props.checked, false);
  assert.deepEqual(writes, []);
  act(() => tree.unmount());
  assert.deepEqual(writes, []);
});
