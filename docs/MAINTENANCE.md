# 维护、迁移与恢复

当前版本 **1.6.12**。包名 `dsh-purge-community`，来源仅本仓库正式 GitHub Releases；保留内部 Cordis ID `dsh-purge`、HTTP `/dsh-purge/*` 及用户数据目录。主安装步骤与镜像故障决策树统一见 [安装指南](INSTALLATION.md)；[AGENTS.md](../AGENTS.md) 是 Agent 操作说明。

## 兼容与操作边界

已验证宿主目标为 Desktop 0.2.1-rc.1 / rc.2。缺失宿主布局时停止写入；其他版本标为未验证，组件版本不一致只报告。兼容状态不是“全部补丁已生效”的保证，使用 selfcheck/diagnose 逐条核对。安装器支持 Windows 入口不等于完整 Windows 补丁/UI 已验收。

安装/更新、应用宿主补丁、重启是独立动作。安装前备份，应用宿主补丁前也备份；不因安装成功自动应用或重启。更新检查与自动安装分别设置，默认检查开、安装关，已有偏好继续保留。

## 快照

路径 `$DSH_HOME/dsh-purge-community/backups/<id>/manifest.json`，完整性清单含 SHA256 与原 profile、Purge bundles；大文件内容寻址去重在 `objects/`。默认保留最近 5 份、每天 1 份共 7 天、200MB 上限，当前操作快照受保护。维护锁防止并发；异常退出残留锁先确认没有维护进程，不能盲目删锁。

包含已安装 Purge 包、profile 的 package.json/cordis.patch.yml/pnpm-lock.yaml、Purge 状态、prompt-inject.md、规则。不会额外扫描独立凭证、会话或 Qwen 图库/模型。profile 本身可能含私密连接信息，**不要公开整个备份**。

## 失败恢复

下载/校验失败未进入迁移；迁移开始后先快照再安装。安装包复制到持久 pkgs 目录，避免 file: 依赖指向临时下载。失败返回备份 ID；原 package.json 仅在无其他依赖并发变更时恢复，不宣称整个 node_modules/锁文件已原子回滚。核对实际状态后再走回滚。

回滚先验证快照、备份当前状态，用当前实例 DSH CLI 安装快照代码，仅恢复 Purge 启用入口，保留现在的提示词、规则和其他插件配置。用户内容若要取回，从快照按文件人工选择；不整份覆盖 profile。安装器失败的原锁文件可供核对，不能覆盖别的插件的新变化。

```sh
purge-community backup
purge-community rollback <backup-id>
# 已装插件无法加载时，用另行校验过的发行包 CLI：
# 设置 PURGE_DSH_CLI / DSH_HOME / DSH_PROFILE 后执行
node package/bin/community.js rollback <backup-id>
```

profile 不存在/有多个且未明确选择时停止。Web/Headless 只用当前服务 CLI；见 [实例定位](WEB-MAINTENANCE.md)。不扫描并误操作其他桌面安装。

## 镜像与更新

独立迁移器只为 issue #7 的明确公开包缺版本错误执行一次 scoped 官方源重试。官方元数据不完整、私有/未知源、真实发布时间/完整性/信任失败均停止。安装失败日志保留原错误，不清锁、不清全局缓存、不关闭校验、不全局换源。DSH 市场安装前置于插件加载，需选择官方源或换用独立入口。

## 发布约束

同步 package.json、release-notes、README.md、README.zh-CN.md、英文指南、AGENTS.md、维护与安装文档的当前版本。`npm run check:docs` 检查中文副本一致及关键安装边界。CI 运行功能/打包回归和三个操作系统的安装器测试，Windows 入口同时跑 PowerShell 5.1/7；通过后 tag 发布 tgz、稳定别名、SHA256。市场索引跟随正式 release。真实宿主验收与模拟测试分别报告，不把未知平台写成已验证。

## Windows 换包状态与离线恢复（issue #10）

1.6.12 不再通过定时退出后台或杀掉桌面壳换包。用户点「应用」后助手等待所有同安装路径的 DSH 进程退出，保存唯一的原归档备份，验证 SHA256，然后停止；用户自行打开。正在运行的其他安装不受影响。等待期间官方替换归档会报错并保留新归档，须对新版本重新应用。

诊断位于 `resources/app.asar.purge-handoff.json` 和 `.json.log`。`starting` 不是就绪，`waiting_for_quit` 不是完成，磁盘补丁数不是当前进程已加载。助手没有确认就绪、提前结束或超时时，宿主保持运行。不要仅删除 pending 标记就宣布修复，不要禁用防病毒软件、全局调整权限或修改宿主崩溃提示来掩盖错误。

启动错误另见 `.json.broker.log`、`.json.launch.log`、`.json.launch.log.error`。实机发现 Electron 的 detached PowerShell 会退出 0 却不执行脚本，因此用短 broker 启动独立助手。broker 成功不代表握手成功；最终以状态文件为准。维护回归必须提供真实 Electron，并验证启动进程退出后助手仍存活，直到归档换包完成。

助手始终没有完成时：先保留日志，从系统托盘完整退出 DSH，确认任务管理器没有**该安装路径**的进程。仅当本次「应用」已成功、`resources/app/package.json` 及宿主文件完整时，才在独立 PowerShell 中将 `resources/app.asar` **改名保留**为新的带时间戳 `.bak`，再手动打开 DSH。这绕开的是失效的交接进程，不是重写补丁。若文件仍被占用/权限不足，保持原件并停止；不要删除 app.asar 或强杀所有 Electron。此步骤不能套到刚被官方更新替换的新归档。

回到原宿主：完整退出后，核对状态文件记录的 `backup` 与 `archive_sha256`，用 `Get-FileHash -Algorithm SHA256` 校验该原归档备份，确认没有跨官方版本。保留当前解包目录及现存归档，再将原备份复制回 `resources/app.asar`，手动打开。此过程不恢复 profile，不覆盖当前提示词、规则或其他插件设置。插件版本回滚仍使用前文 `rollback <id>`，两种回滚不要混淆。

## 原生设置接口与 #42 迁移（issue #9）

新版在原生 `describe` / `replace` 宿主只补设置更新事件，不制造混合 API。已注入的精确旧版 legacy shim 会在下次「应用」移除，需手动退出重开后生效。用户的 entry Config、settings.yaml/imported/legacy 文档均保留；这次修复不会把历史写入错误存储的数据静默合并。若其他插件此前把数据写入旧文档，先备份后由用户选择性迁移。未知第三方改写的 shim 停止应用，保留原文件、备份与诊断。

## 解包后 pnpm 路径缺失

1.6.9 预发布后发现 Windows 相对 junction 会随启动目录指错。1.6.12 使用绝对目标，安装前修复当前实例的链接，旧错误链接改名留存。若旧更新器已报 pnpm.mjs 不存在，使用独立安装入口固定 1.6.12；不要删除 app/runtime 目录内容或手动清空锁文件。换包前运行时不可用时保留原归档。

## 命令重名、接口 404 与自检黄色项（1.6.12）

#12 的作者已更正最初推测：实测中断点是 `/rewind` 重名，不是 inactive context。新版保留命令原持有者，并通过备用命令继续提供 Purge 功能。无需卸载其他插件或添加进程级轮询。

#15 将文件原值与有效值混淆。新版把 `inferred`、`unknown` 与 `broken` 分开；面板问号展示证据和范围。CLI 不执行配置表达式、不通过扫描别的安装猜测当前实例。参见 AGENTS §16；不要自动修改用户权限。
