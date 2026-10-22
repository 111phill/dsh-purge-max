// Presentation of apply results only. Never converts unknown or failed work into success.
export function incompleteApplyDetail(result, t) {
  const parts = [];
  if (result.failed > 0) {
    const ids = (Array.isArray(result.failed_items) ? result.failed_items : [])
      .map((item) => item?.id)
      .filter((id) => id != null)
      .join(",");
    parts.push(
      t("restart.incomplete.patches", {
        failed: String(result.failed),
        ids: ids || "?",
      }),
    );
  }
  if (result.cmd_flash?.ok === false)
    parts.push(
      t("restart.incomplete.flash", {
        entry: String(result.cmd_flash.entry || "unknown"),
      }),
    );
  if (result.host_written === false) parts.push(t("restart.incomplete.host"));
  if (result.hook_restore_failed === true)
    parts.push(t("restart.incomplete.restore"));
  if (result.cli_repair?.ok === false)
    parts.push(t("restart.incomplete.runtime"));
  return parts.length ? parts.join("；") : t("restart.incomplete.unknown");
}
