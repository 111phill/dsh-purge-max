import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ALL_PATCHES, applyReplacementsToText } from "../lib/core.js";
import {
  nativeSteeringRestored,
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
const fixture = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/steering-rc2.json", import.meta.url),
    "utf8",
  ),
);
const controller = fixture.controller,
  loop = fixture.agentMethods;
export const variants = {
  native: { controller, loop },
  upstream169: {
    controller: controller
      .replace(NATIVE_PROMPT, OLD_PROMPT)
      .replace(NATIVE_QUEUE_CASE, OLD_QUEUE_CASE),
    loop: loop.replace(NATIVE_STEER, OLD_STEER),
  },
  upstream171: {
    controller: controller
      .replace(NATIVE_PROMPT, OLD_PROMPT)
      .replace(NATIVE_QUEUE_CASE, OLD_QUEUE_CASE),
    loop: loop.replace(NATIVE_STEER, UPSTREAM_RECOVERED_STEER),
  },
  fork125: {
    controller: controller
      .replace(NATIVE_PROMPT, OLD_PROMPT)
      .replace(NATIVE_QUEUE_CASE, OLD_QUEUE_CASE),
    loop,
  },
  fork126: {
    controller: controller.replace(NATIVE_QUEUE_GUARD, OLD_QUEUE_FALLBACK),
    loop,
  },
  partial: {
    controller: controller
      .replace(NATIVE_QUEUE_GUARD, OLD_QUEUE_FALLBACK)
      .replace(NATIVE_PROMPT, OLD_PROMPT),
    loop: loop.replace(NATIVE_STEER, OLD_STEER),
  },
};
for (const [version, input] of Object.entries(variants))
  for (const newline of ["LF", "CRLF"]) {
    test(`${version} ${newline}: full migration and repeat application preserve native semantics`, () => {
      for (const [kind, text] of Object.entries(input)) {
        const source = newline === "CRLF" ? text.replace(/\n/g, "\r\n") : text;
        const result = applyReplacementsToText(source, p);
        assert.equal(nativeSteeringRestored(result.text), true, kind);
        assert.equal(
          result.text
            .replace(/\r\n/g, "\n")
            .replace("// [dsh-purge] native steering restored (#90)\n", ""),
          kind === "controller" ? controller : loop,
        );
        assert.equal(applyReplacementsToText(result.text, p).changed, false);
        if (newline === "CRLF") assert(!/(?<!\r)\n/.test(result.text));
      }
    });
  }
test("unknown mixed steering rewrite is left untouched rather than partly migrated", () => {
  const unknown = variants.partial.controller.replace(
    OLD_PROMPT,
    OLD_PROMPT.replace("agent.followup(message)", "agent.customSend(message)"),
  );
  assert.deepEqual(applyReplacementsToText(unknown, p), {
    text: unknown,
    changed: false,
  });
  assert.equal(nativeSteeringRestored(unknown), false);
  assert.equal(p.strictFiles, true);
});
test("settlement requires every native controller branch, not just one guard marker", () => {
  assert.equal(
    nativeSteeringRestored(
      controller.replace(NATIVE_PROMPT, "// unknown prompt handler"),
    ),
    false,
  );
  assert.equal(
    nativeSteeringRestored(
      controller.replace(NATIVE_QUEUE_CASE, "// unknown queue handler"),
    ),
    false,
  );
  assert.deepEqual(p.file, ["api-session-controller", "agent-loop"]);
});
test("migration changes no unrelated payload or wait settings", () => {
  const extra =
    '\n// untouched settings sentinel\nconst promptText = "ordinary test";\nconst timeout = 300;\n';
  const result = applyReplacementsToText(
    variants.fork126.controller + extra,
    p,
  ).text;
  assert.equal(
    result.replace("// [dsh-purge] native steering restored (#90)\n", ""),
    controller + extra,
  );
});
