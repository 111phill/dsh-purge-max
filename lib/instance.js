/** Instance-local maintenance discovery. No PATH or other-app/global desktop scan. */
import fs from "node:fs";
import path from "node:path";

function canonical(file, reader) {
  try {
    return reader.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
}
function directory(file, reader) {
  try {
    return reader.statSync(file).isDirectory();
  } catch {
    return false;
  }
}
function profileName(name) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name || ""))
    throw Error("profile 名称无效");
  return name;
}
export function resolveProfile(home, options = {}) {
  const {
    env = process.env,
    argv = process.argv,
    reader = fs,
    profile,
  } = options;
  if (!home) throw Error("未确定 DSH_HOME，无法定位当前 profile");
  const root = canonical(
    path.join(canonical(home, reader), "profiles"),
    reader,
  );
  const select = (value, source, isPath = false) => {
    const dir = isPath
      ? path.resolve(value)
      : path.join(root, profileName(value));
    if (!directory(dir, reader))
      throw Error(`未找到 ${source} 指定的 profile：${dir}`);
    return {
      directory: canonical(dir, reader),
      name: path.basename(dir),
      source,
    };
  };
  if (profile) return select(profile, "显式参数", path.isAbsolute(profile));
  if (env.PURGE_PROFILE_DIR)
    return select(env.PURGE_PROFILE_DIR, "PURGE_PROFILE_DIR", true);
  const paths = [
    ...new Set(
      argv.filter(
        (arg) =>
          typeof arg === "string" &&
          path.isAbsolute(arg) &&
          canonical(path.dirname(arg), reader) === root,
      ),
    ),
  ];
  if (paths.length > 1)
    throw Error("启动参数中出现多个 profile 目录，无法确定当前实例");
  if (paths.length) return select(paths[0], "宿主启动参数", true);
  if (
    argv.some(
      (arg) =>
        typeof arg === "string" &&
        path.isAbsolute(arg) &&
        /[\\/]profiles[\\/][^\\/]+$/.test(arg),
    )
  ) {
    throw Error(
      "宿主启动参数中的 profile 不属于当前 DSH_HOME；请核对服务环境，未选择其他目录",
    );
  }

  const flags = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--profile") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--"))
        throw Error("--profile 缺少名称");
      flags.push(argv[++i]);
    } else if (argv[i]?.startsWith("--profile=")) flags.push(argv[i].slice(10));
  }
  if (new Set(flags).size > 1)
    throw Error("启动参数中出现多个 --profile，无法确定当前实例");
  if (flags.length) return select(flags[0], "--profile");
  if (env.DSH_PROFILE) return select(env.DSH_PROFILE, "DSH_PROFILE");
  let candidates = [];
  try {
    candidates = reader
      .readdirSync(root, { withFileTypes: true })
      .filter(
        (e) =>
          (e.isDirectory() ||
            (e.isSymbolicLink() &&
              directory(path.join(root, e.name), reader))) &&
          /^[a-zA-Z0-9]/.test(e.name) &&
          e.name !== "node_modules" &&
          reader.existsSync(path.join(root, e.name, "package.json")),
      )
      .map((e) => e.name);
  } catch {}
  if (candidates.length === 1)
    return select(candidates[0], "唯一已初始化 profile");
  throw Error(
    `无法唯一确定当前 profile${candidates.length ? "（" + candidates.join("、") + "）" : ""}；请传入 --profile，或设置 DSH_PROFILE / PURGE_PROFILE_DIR`,
  );
}

function packageAbove(file, reader) {
  if (!file) return null;
  let dir = path.dirname(canonical(file, reader));
  for (let i = 0; i < 8; i++) {
    try {
      const meta = JSON.parse(
        reader.readFileSync(path.join(dir, "package.json"), "utf8"),
      );
      if (
        ["@deepseek-ai/dsh", "@deepseek-ai/dsh-desktop-host"].includes(
          meta.name,
        )
      )
        return { root: dir, meta };
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
export function desktopResourcesForHost(host) {
  const normalized = String(host || "").replace(/\\/g, "/");
  const match =
    /^(.*\/resources)\/(?:app|app\.asar|app\.asar\.unpacked)\/(?:dsh\/)?node_modules\/@deepseek-ai\/?$/i.exec(
      normalized,
    );
  return match ? path.normalize(match[1]) : "";
}
export function hostSurface(host) {
  if (!host) return "unknown";
  if (desktopResourcesForHost(host)) return "desktop";
  for (const pkg of ["dsh", "dsh-agent-loop", "dsh-system-prompt"]) {
    if (fs.existsSync(path.join(host, pkg, "package.json"))) return "web";
  }
  return "unknown";
}
/**
 * npm/Node 宿主的两种磁盘布局：
 *   A. 平铺  @deepseek-ai/ 下直接是 dsh-agent-loop 等组件（旧包布局）
 *   B. 嵌套  @deepseek-ai/dsh/node_modules/@deepseek-ai/…（dsh 单包布局，官方 npm 包就是这种）
 * B 才是当前官方包的常态，但调用方（以及用户）常把外层 @deepseek-ai 传给 DSH_BASE。
 * 传错了不能让整个 CLI 退化成 no-host：这里按目录内容归一化到真正的组件根。
 */
// 必须有版本化的运行时组件才算组件根；只认 dsh 会放过「装了 dsh 但组件在更深一层」的中间目录。
const HOST_COMPONENT_DIRS = ["dsh-agent-loop", "dsh-system-prompt", "dsh-agent-instructions"];
const HOST_PROBE_DEPTH = 3;

function nestedCandidates(dir, depth = HOST_PROBE_DEPTH) {
  // 只在「更深一层」里找：给定目录自己的 node_modules 已经由调用方先试过。
  const out = [];
  const visited = new Set();
  const push = (candidate) => {
    const normalized = path.normalize(candidate);
    if (visited.has(normalized)) return;
    visited.add(normalized);
    out.push(normalized);
  };
  let level = [path.normalize(dir)];
  for (let i = 0; i < depth && level.length; i++) {
    const next = [];
    for (const current of level) {
      // 只沿约定的嵌套形状下钻，不递归扫盘：容器/云盘挂载下扫全树会把 CLI 挂死。
      for (const candidate of [
        path.join(current, "node_modules", "@deepseek-ai"),
        path.join(current, "@deepseek-ai", "dsh", "node_modules", "@deepseek-ai"),
      ]) {
        push(candidate);
        next.push(candidate);
      }
    }
    level = next;
  }
  return out;
}

/** 把「用户可能给的任意一层」归一化成真正含组件的 @deepseek-ai 根；找不到就返回原值。 */
export function normalizeHostBase(base, reader = fs) {
  if (!base) return "";
  const start = canonical(base, reader);
  // 已经是组件根本尊就原样返回；否则按优先级挑一个真正含组件的目录。
  if (isComponentRoot(start, reader)) return start;
  // 平铺布局：组件就在 start/<组件> 下；若 start 本身是 @deepseek-ai，
  // 单包布局再往 @deepseek-ai/dsh/node_modules 里找一层。
  for (const flat of [
    start,
    path.join(start, "@deepseek-ai", "dsh"),
    path.join(start, "@deepseek-ai"),
    path.join(start, "dsh", "node_modules", "@deepseek-ai"),
  ]) {
    if (isComponentRoot(flat, reader)) return canonical(flat, reader);
  }
  for (const candidate of nestedCandidates(start)) {
    if (isComponentRoot(candidate, reader)) return canonical(candidate, reader);
  }
  return start;
}

/**
 * DSH_BASE / aiBase 给哪一层都算数：能解析出组件就归一化到组件根，
 * 解析不出就原样返回（指向哪就报哪，不伪装成找到了别的安装）。
 */
function normalizeExplicit(base, reader) {
  const normalized = normalizeHostBase(base, reader);
  return isComponentRoot(normalized, reader) ? normalized : canonical(base, reader);
}

function isComponentRoot(dir, reader) {
  return HOST_COMPONENT_DIRS.some((pkg) => {
    try {
      return reader.statSync(path.join(dir, pkg, "package.json")).isFile();
    } catch {
      return false;
    }
  });
}

export function currentHost(options = {}) {
  const { env = process.env, argv = process.argv, reader = fs } = options;
  if (options.aiBase) return normalizeExplicit(options.aiBase, reader);
  if (env.DSH_BASE) return normalizeExplicit(env.DSH_BASE, reader);
  // Explicit CLI means that installation, not an unrelated global/npm binary.
  if (env.PURGE_DSH_CLI) {
    const found = packageAbove(env.PURGE_DSH_CLI, reader);
    if (found) return path.dirname(found.root);
    // Desktop's shipped shell launcher lives under Resources/runtime/cli/bin.
    const launcher = canonical(env.PURGE_DSH_CLI, reader).replace(/\\/g, "/");
    const resources = /^(.*\/resources)\/runtime\/cli\/bin\/dsh$/i.exec(
      launcher,
    )?.[1];
    if (resources) {
      for (const layout of ["app.asar", "app.asar.unpacked", "app"]) {
        const candidate = path.join(
          resources,
          layout,
          "dsh/node_modules/@deepseek-ai",
        );
        if (directory(candidate, reader)) return canonical(candidate, reader);
      }
    }
    return "";
  }
  const running = packageAbove(argv[1], reader);
  if (!running) return "";
  // 与历史行为一致：返回 dsh 包所在的 @deepseek-ai 外层目录（调用方据此拼 dsh/…）。
  // 平铺布局外层就含组件；单包布局外层只有 dsh，组件在 dsh/node_modules/@deepseek-ai 下，
  // 那种情况 normalizeHostBase 会再往下找一层。
  const outer = path.dirname(running.root);
  return isComponentRoot(outer, reader) ? canonical(outer, reader) : outer;
}
function npmCli(host, reader) {
  const root = path.join(host, "dsh");
  try {
    const meta = JSON.parse(
      reader.readFileSync(path.join(root, "package.json"), "utf8"),
    );
    if (meta.name !== "@deepseek-ai/dsh") return "";
    const bin = typeof meta.bin === "string" ? meta.bin : meta.bin?.dsh;
    if (!bin) return "";
    const cli = path.resolve(root, bin),
      relative = path.relative(root, cli);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return "";
    return reader.statSync(cli).isFile() ? cli : "";
  } catch {
    return "";
  }
}
export function resolveDshCli(options = {}) {
  const {
    env = process.env,
    argv = process.argv,
    reader = fs,
    execPath = process.execPath,
    resourcesPath = process.resourcesPath,
    platform = process.platform,
  } = options;
  let cli = "",
    source = "",
    desktop = false;
  if (env.PURGE_DSH_CLI) {
    cli = canonical(env.PURGE_DSH_CLI, reader);
    source = "PURGE_DSH_CLI";
    if (!reader.existsSync(cli))
      throw Error(`PURGE_DSH_CLI 指向的文件不存在：${cli}`);
    desktop = /[\\/]resources[\\/](?:app|app\.asar|app\.asar\.unpacked)[\\/]dsh[\\/]node_modules[\\/]@deepseek-ai[\\/]dsh-desktop-host[\\/]lib[\\/]cli\.js$/i.test(cli);
  } else {
    const host = currentHost({ ...options, env, argv, reader });
    const resources =
      desktopResourcesForHost(host) || (!host ? resourcesPath : "");
    if (resources) {
      cli =
        ["app.asar", "app.asar.unpacked", "app"]
          .map((layout) =>
            path.join(
              resources,
              layout,
              "dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js",
            ),
          )
          .find((file) => reader.existsSync(file)) || "";
      desktop = true;
      source = "当前 Desktop 实例";
    } else if (host) {
      cli = npmCli(host, reader);
      source = "当前 npm/Node 实例";
    }
  }
  if (!cli)
    throw Error(
      "无法定位当前 DSH 实例的 CLI；请设置 PURGE_DSH_CLI 指向此服务使用的 dsh 启动文件，并明确 DSH_PROFILE（例如 web）。不会尝试其他全局安装。",
    );
  let command = cli,
    args = [];
  if (/\.[cm]?js$/i.test(cli)) {
    command = execPath;
    args = [...(desktop ? ["--expose-internals"] : []), cli];
  } else if (platform !== "win32") {
    try {
      reader.accessSync(cli, fs.constants.X_OK);
    } catch {
      if (
        !/^#!\/bin\/(?:ba)?sh(?:\r?\n|$)/.test(
          reader.readFileSync(cli, "utf8").slice(0, 64),
        )
      )
        throw Error("DSH CLI 不可执行；请指定当前实例的 CLI 文件");
      command = "/bin/sh";
      args = [cli];
    }
  }
  return { command, args, cli, source, node: command === execPath };
}
