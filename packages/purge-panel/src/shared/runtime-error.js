// Only runtime-repair diagnostics belong in this error. Do not stringify an
// entire API response: other endpoints can contain prompts or configuration.
export function runtimeRepairDetails(report) {
  if (!report || report.ok !== false) return [];
  const text = (value) =>
    typeof value === "string"
      ? value.replace(/[\r\n\t]+/g, " ").slice(0, 1200)
      : "";
  const details = [];
  const add = (label, value) => {
    const safe = text(value);
    if (safe) details.push(`${label}: ${safe}`);
  };
  add("runtime", report.reason);
  add("runtime error", report.error);
  add("runtime code", report.code);
  const link = report.symlink;
  if (link?.ok === false) {
    add("runtime link", link.reason);
    add("link error", link.error);
    add("link code", link.code);
    add("backup", link.backup);
    add("retained candidate", link.failedLink);
    if (link.rollback?.ok === false) {
      details.push("rollback: failed");
      add("rollback error", link.rollback.error);
    } else if (link.rollback?.ok === true) {
      details.push("rollback: original link restored");
    }
  }
  for (const shim of (Array.isArray(report.shims) ? report.shims : []).slice(
    0,
    8,
  )) {
    if (!["read_error", "write_error"].includes(shim?.status)) continue;
    add("launcher", shim.path);
    add("launcher status", shim.status);
    add("launcher error", shim.error);
  }
  return details;
}
