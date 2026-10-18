import {
  h,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "../shared/react.js";
import { apiJson } from "../api/client.js";
import { Btn, HelpTip } from "./primitives.js";
/**
 * 状态页顶部的两块紧凑信息：破甲自检（默认收起）+ 破甲强化段开关。
 * 单独拆出来，是为了让「应用」按钮留在页面最上面，而自检不占一屏。
 */
export function StatusExtras() {
  const [check, setCheck] = useState(null);
  const [boost, setBoost] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const load = () =>
    Promise.all([
      apiJson("/dsh-purge/selfcheck")
        .then(setCheck)
        .catch(() => setCheck(null)),
      apiJson("/dsh-purge/boost")
        .then((r) => setBoost(!!r.enabled))
        .catch(() => setBoost(null)),
    ]);
  useEffect(() => {
    load();
  }, []);
  async function toggle() {
    try {
      const r = await apiJson("/dsh-purge/boost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !boost }),
      });
      setBoost(!!r.enabled);
      setNotice(r.enabled ? "已开启，重启后生效" : "已关闭，重启后生效");
    } catch (e) {
      setNotice(e.message);
    }
  }
  async function rerun() {
    setBusy(true);
    try {
      setCheck(await apiJson("/dsh-purge/selfcheck"));
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  const layers = check && Array.isArray(check.layers) ? check.layers : [];
  const failed = layers.filter(
    (l) => l.state === "broken" || (!l.state && !l.ok),
  );
  const pendingLayers = layers.filter((l) => l.state === "pending");
  const pendingPatches = pendingLayers.reduce(
    (n, l) => n + (l.pending?.length || 0),
    0,
  );
  const total = layers.filter((layer) => layer.applicable !== false).length;
  return h(
    "section",
    { className: "dshpp-card", "aria-label": "破甲状态" },
    h(
      "div",
      { className: "dshpp-line" },
      h(
        "span",
        { className: "dshpp-line-main" },
        h("i", {
          className:
            "dshpp-dot " +
            (check
              ? failed.length
                ? "is-bad"
                : pendingLayers.length
                  ? "is-warn"
                  : "is-ok"
              : ""),
        }),
        "破甲自检",
        h(
          "b",
          null,
          check
            ? failed.length
              ? `${failed.length} 层未生效`
              : pendingLayers.length
                ? `${pendingPatches} 条待应用`
                : `${total} 层全部在位`
            : "检测中…",
        ),
      ),
      h(
        "details",
        { className: "dshpp-fold-inline" },
        h("summary", null, "查看逐层"),
        h(
          "div",
          { className: "dshpp-checks" },
          check && Array.isArray(check.layers)
            ? check.layers.map((layer) =>
                h(
                  "div",
                  {
                    key: layer.title,
                    className:
                      "dshpp-check" +
                      (layer.state === "pending"
                        ? " is-warn"
                        : layer.ok
                          ? ""
                          : " is-bad"),
                  },
                  h("i", {
                    className:
                      "dshpp-dot " +
                      (layer.state === "pending"
                        ? "is-warn"
                        : layer.ok
                          ? "is-ok"
                          : "is-bad"),
                  }),
                  h("span", { className: "dshpp-check-name" }, layer.title),
                  h(
                    "span",
                    { className: "dshpp-check-val" },
                    layer.applicable === false
                      ? "不适用"
                      : layer.state === "pending"
                        ? `待应用 #${(layer.pending || []).join("/#")}`
                        : `${layer.applied}/${layer.required ?? layer.total}`,
                  ),
                ),
              )
            : h("div", { className: "dshpp-muted" }, "检测中…"),
        ),
      ),
      h(
        Btn,
        { tiny: true, disabled: busy, onClick: rerun },
        busy ? "…" : "重测",
      ),
      h(
        Btn,
        {
          tiny: true,
          title: "生成一次性探针：下一轮回复里看模型有没有原样回显该标记",
          onClick: async () => {
            try {
              const r = await apiJson("/dsh-purge/probe", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{}",
              });
              setNotice(r.message || "");
            } catch (e) {
              setNotice(e.message);
            }
          },
        },
        "探针",
      ),
    ),
    h(
      "div",
      { className: "dshpp-line" },
      h(
        "span",
        { className: "dshpp-line-main" },
        "破甲强化段",
        h(
          HelpTip,
          { title: "破甲强化段" },
          "在系统提示词末尾追加一段与注入同级的文本：层级声明 / 拒绝即故障 / 抗谄媚 / 多轮重申。默认开启。",
        ),
        h("b", null, boost === null ? "…" : boost ? "已开启" : "已关闭"),
      ),
      h(
        Btn,
        { tiny: true, disabled: boost === null, onClick: toggle },
        boost ? "关闭" : "开启",
      ),
      notice ? h("span", { className: "dshpp-muted" }, notice) : null,
    ),
  );
}

export function assertMaintenanceResult(result) {
  if (!result || typeof result !== "object")
    throw new Error("维护接口返回了无效结果");
  if (result.ok === false) {
    const errors = Array.isArray(result.errors)
      ? result.errors.filter(Boolean).join("；")
      : "";
    const partial = result.applied
      ? "；部分目标已更新，请重启对应 DSH 进程加载"
      : "";
    throw new Error((result.error || errors || "维护操作失败") + partial);
  }
}
export function maintenanceNotice(op, result) {
  if (op === "backup") {
    if (!result.id)
      throw new Error("备份操作未返回备份编号，请刷新列表核对结果");
    return `备份已创建：${result.id}`;
  }
  if (op === "rollback")
    return (
      (result.note || "插件回滚已完成") +
      "。请重启 DSH 进程；仅刷新浏览器不会加载新版后端。"
    );
  if (op === "update") {
    if (result.applied === false || result.skipped)
      return result.note || "未安装新版本，当前安装未更新。";
    if (result.applied || result.needRestart || result.restart_required) {
      const version =
        result.release?.version || result.localVersion || result.remoteVersion;
      return `插件已安装${version ? "：" + version : ""}。请重启 DSH 进程；仅刷新浏览器不会加载新版后端。`;
    }
    return result.note || "更新请求已完成，请刷新状态核对安装结果。";
  }
  return result.note || "维护操作已完成";
}

export function UpdatePreferences({ value, status = {}, onSaved }) {
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const locked = useRef(false);
  if (!value) return null;
  async function save(patch) {
    if (locked.current) return;
    locked.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await apiJson("/dsh-purge/community", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "preferences", value: patch }),
      });
      assertMaintenanceResult(result);
      onSaved(result.update_preferences);
    } catch (e) {
      setError(e.message);
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }
  return h(
    "section",
    { "aria-label": "自动更新设置", className: "dshpp-card" },
    h(
      "div",
      { className: "dshpp-row" },
      h(
        "label",
        null,
        h("input", {
          type: "checkbox",
          checked: value.autoCheck,
          disabled: saving,
          onChange: (e) => save({ autoCheck: e.target.checked }),
          "aria-label": "自动检查更新",
        }),
        "自动检查更新",
      ),
      h(HelpTip, {
        title: "自动检查更新",
        children:
          "启动 30 秒后检查，之后按间隔检查。关闭不会改变已保存的自动安装偏好，但会暂停自动安装。",
      }),
      h(
        "select",
        {
          "aria-label": "更新检查间隔",
          value: value.intervalHours,
          disabled: saving || !value.autoCheck,
          onChange: (e) => save({ intervalHours: Number(e.target.value) }),
        },
        [...new Set([1, 6, 12, 24, value.intervalHours])]
          .sort((a, b) => a - b)
          .map((v) => h("option", { key: v, value: v }, `每 ${v} 小时`)),
      ),
    ),
    h(
      "div",
      { className: "dshpp-row" },
      h(
        "label",
        null,
        h("input", {
          type: "checkbox",
          checked: value.autoInstall,
          disabled: saving,
          onChange: (e) => save({ autoInstall: e.target.checked }),
          "aria-label": "自动安装更新",
        }),
        "自动安装更新",
      ),
      h(HelpTip, {
        title: "自动安装更新",
        children:
          "仅在自动检查开启、发现未锁定的新正式版时安装。安装前备份、校验发行包；失败不自动切换来源。安装后等待你手动重启，不会自动重启 DSH。",
      }),
    ),
    h(
      "p",
      { className: "dshpp-hint" },
      status.restartRequired
        ? `已安装 ${status.pendingVersion}，等待你手动重启 DSH。`
        : !value.autoCheck
          ? "自动检查已关闭，自动安装暂停。"
          : status.checkedAt
            ? `上次检查：${new Date(status.checkedAt).toLocaleString()}${status.hasUpdate ? ` · 可用版本 ${status.availableVersion}` : ""}`
            : "启动后自动检查；安装后仅提示手动重启。",
    ),
    status.error ? h("p", { role: "alert" }, status.error) : null,
    error ? h("p", { role: "alert" }, error) : null,
  );
}

export function CommunityMaintenance() {
  const [value, setValue] = useState(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(""),
    [releases, setReleases] = useState(null),
    [release, setRelease] = useState("");
  const [listState, setListState] = useState("loading"),
    [listError, setListError] = useState("");
  const mounted = useRef(false),
    generation = useRef(0),
    running = useRef(false);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setListState("loading");
    setListError("");
    try {
      const result = await apiJson("/dsh-purge/community");
      assertMaintenanceResult(result);
      if (!Array.isArray(result.backups)) throw new Error("备份列表响应无效");
      if (!mounted.current || request !== generation.current) return;
      setValue(result);
      setSelected((current) =>
        result.backups.some((b) => b.id === current) ? current : "",
      );
      setListState("ready");
    } catch (e) {
      if (!mounted.current || request !== generation.current) return;
      setListError(e.message);
      setListState("error");
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [load]);
  async function run(op) {
    if (running.current) return;
    if (
      op === "rollback" &&
      !window.confirm(
        "只回滚 Purge 插件及其入口，保留当前提示词和设置；完成后需重启 DSH 进程；仅刷新浏览器不会加载新版后端。继续？",
      )
    )
      return;
    if (
      op === "update" &&
      !window.confirm(
        "将先备份，再安装所选社区正式版；不会重新应用宿主补丁。安装后请重启 DSH 进程；仅刷新浏览器不会加载新版后端。继续？",
      )
    )
      return;
    running.current = true;
    setBusy(true);
    setNotice("处理中…");
    try {
      const r = await apiJson("/dsh-purge/community", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op, id: selected, ref: release }),
      });
      assertMaintenanceResult(r);
      if (!mounted.current) return;
      if (op === "check") {
        if (!Array.isArray(r.versions)) throw new Error("发行列表响应无效");
        setReleases(r.versions.filter((v) => v.asset));
        setRelease(r.versions.find((v) => v.asset)?.ref || "");
        setNotice(
          r.error
            ? `检查更新失败：${r.error}`
            : r.hasUpdate
              ? `发现新版本 ${r.remoteVersion}`
              : "当前已是最新正式版",
        );
      } else {
        setNotice(maintenanceNotice(op, r));
      }
    } catch (e) {
      if (mounted.current)
        setNotice(
          e.message === "timeout"
            ? "维护请求超时，操作可能仍在执行；请先刷新状态，勿重复提交。"
            : e.message,
        );
    } finally {
      // A failed write may already have created a recovery snapshot. Read once;
      // never replay the mutation to discover whether it succeeded.
      if (op !== "check" && mounted.current) await load();
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return h(
    "section",
    { className: "dshpp-panel", "aria-label": "社区版维护" },
    h("h3", null, "维护：更新与本机备份"),
    h(UpdatePreferences, {
      value: value?.update_preferences,
      status: value?.update_status,
      onSaved: (next) =>
        setValue((current) => ({ ...current, update_preferences: next })),
    }),
    h(
      "div",
      { className: "dshpp-row" },
      h(Btn, { disabled: busy, onClick: () => run("check") }, "检查社区版更新"),
      h(
        Btn,
        {
          disabled: busy,
          onClick: async () => {
            try {
              const r = await apiJson("/dsh-purge/audit?limit=10");
              const lines = (r.entries || []).map(
                (x) =>
                  `${new Date(x.at).toLocaleString()}  ${x.event}  ${JSON.stringify(
                    Object.fromEntries(
                      Object.entries(x).filter(
                        ([k]) => !["at", "event", "pid"].includes(k),
                      ),
                    ),
                  )}`,
              );
              setNotice(lines.length ? lines.join("\n") : "还没有动作记录");
            } catch (e) {
              setNotice(e.message);
            }
          },
        },
        "最近动作",
      ),
      h(
        "a",
        {
          href: "https://github.com/kingcharleslzy-ai/dsh-purge/releases",
          target: "_blank",
          rel: "noreferrer",
        },
        "发行记录",
      ),
    ),
    releases?.length
      ? h(
          "div",
          { className: "dshpp-row" },
          h(
            "select",
            {
              "aria-label": "选择社区发行版本",
              value: release,
              onChange: (e) => setRelease(e.target.value),
              disabled: busy,
            },
            releases.map((r) =>
              h("option", { key: r.ref, value: r.ref }, r.label),
            ),
          ),
          h(
            Btn,
            { disabled: busy || !release, onClick: () => run("update") },
            "安装所选版本",
          ),
        )
      : null,
    h("h3", { style: { marginTop: 20 } }, "本机备份"),
    h(
      Btn,
      { disabled: busy || listState === "loading", onClick: load },
      "刷新备份列表",
    ),
    listState === "loading"
      ? h("p", { role: "status" }, "正在读取备份…")
      : null,
    listState === "error"
      ? h("p", { role: "alert" }, `读取备份失败：${listError}`)
      : null,
    listState === "ready" && !value.backups.length
      ? h("p", { role: "status" }, "暂无备份")
      : null,
    h(
      "div",
      { className: "dshpp-row" },
      h(Btn, { disabled: busy, onClick: () => run("backup") }, "立即备份"),
      h(
        "select",
        {
          "aria-label": "选择回滚备份",
          value: selected,
          onChange: (e) => setSelected(e.target.value),
          disabled: busy || listState !== "ready",
        },
        h("option", { value: "" }, "选择备份"),
        ...(value?.backups || []).map((b) =>
          h(
            "option",
            { key: b.id, value: b.id },
            `${new Date(b.created_at).toLocaleString()} · ${b.plugins.map((p) => p.version).join(" / ")}`,
          ),
        ),
      ),
      h(
        Btn,
        {
          disabled: busy || !selected || listState !== "ready",
          onClick: () => run("rollback"),
        },
        "回滚插件",
      ),
    ),
    h(
      "p",
      { className: "dshpp-hint" },
      "备份只保存在本机。回滚保留当前提示词、规则和其他插件设置；安装或回滚后需要重启 DSH 进程；仅刷新浏览器不会加载新版后端。",
    ),
    notice ? h("p", { role: "status" }, notice) : null,
  );
}
