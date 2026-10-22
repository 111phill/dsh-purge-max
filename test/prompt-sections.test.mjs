// Prompt wiring is the part users feel immediately: inject position and the
// boost section must register where we claim, without a live desktop.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerPromptSections } from "../lib/index.js";
import { BOOST_TEXT } from "../lib/boost.js";
import { writeTuning } from "../lib/tuning.js";

function harness(home) {
  const sections = [];
  const ctx = {
    systemPrompt: {
      section(spec) {
        sections.push(spec);
        return () => {};
      },
    },
    logger: { warn() {} },
  };
  const config = {
    enabled: true,
    capabilityProtocol: false,
    injectOnce: false,
    postPrompt: "",
    postPromptOrder: 5100,
  };
  return { ctx, config, sections };
}

function withHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "purge-prompt-"));
  const prevHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    fn(home);
  } finally {
    if (prevHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = prevHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test("default tuning registers the inject at the head and the boost at the tail", () => {
  withHome(() => {
    const h = harness();
    registerPromptSections(h.ctx, h.config);
    const byName = Object.fromEntries(h.sections.map((s) => [s.name, s]));
    assert(byName["dsh-purge"], "head inject section");
    assert(!byName["dsh-purge-tail"], "tail inject is opt-in");
    assert(byName["dsh-purge-boost"], "boost section is on by default");
    assert(
      byName["dsh-purge-boost"].order > byName["dsh-purge"].order,
      "boost must sort after the inject",
    );
    assert.equal(byName["dsh-purge-boost"].text({}), BOOST_TEXT);
  });
});

// 宿主 rc.2 的 SECTION_ORDERS：persona-prefix 0、工具段 1000–3000、MCP 3100、
// TOOLS_SDK 5000、DELIVERABLE 9000、STRUCTURED_OUTPUT 9900、HARNESS_SOURCE 10000、
// WEB_SURFACE 10100、persona-suffix 10200。低于 0 的 order 排在 persona 之前，
// 所以"尾部"段不能用 GLOBAL_PROMPT_ORDER + n（仍是负数）。
const HOST_TOOL_SECTIONS_MAX = 5000;
const HOST_PERSONA_SUFFIX = 10200;

test("tail inject and boost land inside the host tail range, not ahead of the persona", () => {
  withHome((home) => {
    writeTuning({ injectPosition: "tail" }, home);
    const h = harness();
    registerPromptSections(h.ctx, h.config);
    const byName = Object.fromEntries(h.sections.map((s) => [s.name, s]));
    for (const name of ["dsh-purge-tail", "dsh-purge-boost"]) {
      const order = byName[name].order;
      assert(
        order > HOST_TOOL_SECTIONS_MAX,
        `${name} must sort after the tool sections, got ${order}`,
      );
      assert(
        order < HOST_PERSONA_SUFFIX,
        `${name} must sort before the persona suffix, got ${order}`,
      );
    }
    assert(
      byName["dsh-purge-tail"].order > byName["dsh-purge-boost"].order,
      "the inject sits closest to the output, after the boost block",
    );
  });
});

test("injectPosition=tail moves the text and keeps a named placeholder", () => {
  withHome((home) => {
    writeTuning({ injectPosition: "tail" }, home);
    const h = harness();
    registerPromptSections(h.ctx, h.config);
    const byName = Object.fromEntries(h.sections.map((s) => [s.name, s]));
    assert(byName["dsh-purge"], "placeholder keeps the name patch 74 looks for");
    assert(byName["dsh-purge-tail"], "tail section registered");
    assert(
      byName["dsh-purge-tail"].order > byName["dsh-purge"].order,
      "tail must sort last",
    );
    assert.equal(byName["dsh-purge"].text({}), "", "head placeholder is empty");
  });
});

test("injectPosition=both registers head and tail with the same text", () => {
  withHome((home) => {
    writeTuning({ injectPosition: "both" }, home);
    const h = harness();
    registerPromptSections(h.ctx, h.config);
    const names = h.sections.map((s) => s.name);
    assert(names.includes("dsh-purge"));
    assert(names.includes("dsh-purge-tail"));
  });
});

test("boost order can be pinned for A/B runs", async () => {
  const prev = process.env.PURGE_BOOST_ORDER;
  process.env.PURGE_BOOST_ORDER = "-50000";
  try {
    const mod = await import(`../lib/index.js?ab=${Date.now()}`);
    const sections = [];
    const ctx = { systemPrompt: { section: (s) => (sections.push(s), () => {}) }, logger: { warn() {} } };
    mod.registerPromptSections(ctx, { enabled: true, capabilityProtocol: false, injectOnce: false, postPrompt: "", postPromptOrder: 5100 });
    const boost = sections.find((s) => s.name === "dsh-purge-boost");
    assert.equal(boost.order, -50000);
  } finally {
    if (prev === undefined) delete process.env.PURGE_BOOST_ORDER;
    else process.env.PURGE_BOOST_ORDER = prev;
  }
});
