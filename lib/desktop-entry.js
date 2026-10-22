/** Resolve only the selected app's physical desktop-shell entry. */
import path from "node:path";
import { hostFs } from "./extract-asar.js";

export const SHELL_MAIN_CANDIDATES = [
  "main.js",
  "lib/main.js",
  "out/main/index.js",
  "out/main/main.js",
];

export function resolveDesktopEntry(appDir, fs = hostFs) {
  const app = path.resolve(appDir);
  const result = (state, file = "", extra = {}) => ({ state, file, ...extra });
  const inside = (root, file) => {
    const rel = path.relative(root, file);
    return (
      rel !== "" &&
      rel !== ".." &&
      !rel.startsWith(".." + path.sep) &&
      !path.isAbsolute(rel)
    );
  };
  const inspect = (rel) => {
    if (
      typeof rel !== "string" ||
      !rel.trim() ||
      rel.includes("\0") ||
      path.posix.isAbsolute(rel) ||
      path.win32.isAbsolute(rel) ||
      /^[A-Za-z]:/.test(rel)
    )
      return result("invalid_main");
    const file = path.resolve(app, rel.replaceAll("\\", "/"));
    if (!inside(app, file)) return result("outside_app");
    try {
      if (!fs.statSync(file).isFile()) return result("not_file");
      if (!inside(fs.realpathSync(app), fs.realpathSync(file)))
        return result("outside_app");
      return result("resolved", file);
    } catch (error) {
      return result(
        error.code === "ENOENT" ? "missing_entry" : "unreadable_entry",
        "",
        { code: error.code || "UNKNOWN" },
      );
    }
  };
  let meta;
  try {
    meta = JSON.parse(
      fs
        .readFileSync(path.join(app, "package.json"), "utf8")
        .replace(/^\uFEFF/, ""),
    );
  } catch (error) {
    if (error.code !== "ENOENT")
      return result("invalid_manifest", "", {
        code: error.code || "INVALID_JSON",
      });
  }
  if (
    meta !== undefined &&
    (!meta || typeof meta !== "object" || Array.isArray(meta))
  )
    return result("invalid_manifest");
  // An explicit but broken declaration must not silently select a stale file.
  if (meta && Object.hasOwn(meta, "main"))
    return { ...inspect(meta.main), source: "package.main" };
  const candidates = SHELL_MAIN_CANDIDATES.map(inspect);
  const broken = candidates.find(
    (x) => !["resolved", "missing_entry"].includes(x.state),
  );
  if (broken) return { ...broken, source: "known_layout" };
  const found = candidates.filter((x) => x.state === "resolved");
  if (found.length !== 1)
    return result(found.length ? "ambiguous_entry" : "missing_entry", "", {
      source: "known_layout",
    });
  return { ...found[0], source: "known_layout" };
}
