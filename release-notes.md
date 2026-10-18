# 1.6.10

修复 1.6.9 发布后实机复测发现的 Windows 解包运行时路径问题。1.6.9 已改为预发布，不建议安装。

- Windows app/runtime junction 使用绝对目标，独立于启动目录；错误链接先保留再修复，不删除运行时目录或用户文件。
- 安装器在调用解包 Desktop CLI 前检查并修复当前实例的运行时链接；换包助手在 CLI 运行时不可用时保留原归档并停止。
- 增加“换包之后再次安装/升级”的实机回归。已有 #9、#10、PR #11 修复与用户设置保留逻辑全部保留。

# 1.6.9（预发布）

Windows 交接与设置兼容修复；实机结果与边界见 [1.6.9 验收记录](docs/releases/1.6.9.md)。

- Windows 归档换包采用可查询状态的手动完整退出流程，不再无握手定时退出后台，不再杀进程或自动重开；保留唯一命名的原始归档备份，失败与超时可诊断。完善 PR #11，处理 issue #10。
- 有原生 describe/replace 的设置服务不再注入 legacy register，按精确模板移除旧版已注入兼容层，保留原生配置存储、设置事件和用户文件；老宿主兼容接口保留。处理 issue #9。
- pending/助手启动/磁盘补丁计数与当前进程加载状态分开显示；更新仍不自动重启。
- 修复 Windows Electron 以 detached 启动 PowerShell 时静默退出的问题；使用独立等待助手并保留启动日志，实测助手在 Electron 启动进程结束后仍能完成换包。
- 补齐备份文件描述符关闭；宿主备份任一文件失败即停止写补丁。安装后核对实际版本，修复从本插件管理的回滚目录重新升级时仍加载旧代码的问题。
- 用户须知自带完整弹窗样式，不再依赖可选演练台 CSS；保持用户自行确认的行为。

# 1.6.8

- 修复真实 Windows Electron 安装竞争条件：PowerShell call operator 可能提前返回，临时 bootstrap 被清理后子进程报 MODULE_NOT_FOUND，而父进程显示成功。改为等待明确的进程对象、读取真实 ExitCode 和 UTF-8 日志后再清理。
- 新增真正 GUI 子系统可执行文件的延迟启动、参数和失败退出回归，PowerShell 5.1/7 均验证；不再只以 node.exe 代替 Electron。
- 在真实 Windows 11 专业版 build 26300、签名有效的官方 DSH Desktop 0.2.1-rc.2 上做隔离安装、备份与回滚验收，保留当前及备份后新增的提示词。未修改默认 DSH 用户目录或既有生图服务，未自动重启或应用宿主补丁。
- README、Agent 安装说明补充 Desktop profile 初始化限制和 PowerShell 5.1 UTF-8 读取方式。界面/登录/完整宿主补丁能力仍与安装器验收分开记录。

验证明细见 [1.6.8 实机记录](docs/releases/1.6.8.md)。1.6.7 的 Windows 独立安装入口请改用本版。

# 1.6.7

- 修复 macOS 临时目录路径别名导致独立 bootstrap 入口静默跳过的问题；使用真实文件路径判断入口，并加入 symlink 启动回归。
- 修复 [issue #7](https://github.com/kingcharleslzy-ai/dsh-purge/issues/7) 的独立安装恢复路径：公开镜像缺少 `@dsh-ops/bash-win32-x64` 指定版本元数据时，验证 npm 官方元数据后只对该 scope 重试一次。保留全部 pnpm 校验，不改变全局源、不切换私有源、不重试真实完整性/信任/发布时间错误。
- 新增 Windows PowerShell 5.1 / 7 安装入口，自动定位唯一 Desktop（可显式指定），使用应用运行时，不要求全局 Node/pnpm；参数、空格/中文路径、失败退出与进程环境恢复纳入测试。
- macOS / Windows 共用下载、大小边界、SHA256、包身份核对与备份迁移；修复校验清单含稳定别名但未下载该别名时的误报。
- 同步 README、中文副本、英文指南、AGENTS 与维护说明；明确市场首次安装由 DSH 执行，需选择 npm 官方源或使用独立安装器，不声称插件能接管加载前的宿主流程。
- 安装前备份，保留现有提示词、规则、更新偏好及其他插件；不自动重启、不自动应用宿主补丁。完整 Windows 宿主补丁/界面兼容仍需独立验收。

验证：90 项功能回归、7 项面板测试、Linux/macOS/Windows 安装器、PowerShell 5.1/7 入口及 Mac 真实 DSH 隔离迁移/回滚通过。详见 [验收记录](docs/releases/1.6.7.md)。

# 1.6.6

安装器修复初版，已由 1.6.7 取代。下载入口验收补出了 macOS 临时目录别名问题，请使用 1.6.7。

# 1.6.5

独立更新设置、Electron ASAR 自检修复与官方格式市场索引。

## 更新检查与安装分开

- 维护区新增「自动检查更新」「自动安装更新」两个开关，检查间隔可调整（1–168 小时，默认 6 小时）。默认只检查、不自动安装；首次检查在启动 30 秒后。
- 更新流程与自动应用宿主补丁解耦，`autoApplyOnStart=false` 不再跳过更新。旧 `autoUpdateOnStart` 保留为自动安装偏好的兼容默认，新偏好单独保存，不重写原 profile、提示词及其他插件设置。
- 关闭检查暂停自动安装，但保留安装偏好；手动检查和安装仍可用。自动安装尊重锁定版本，沿用发行包校验、备份与失败恢复。
- 更新后只显示待手动重启，不自动重启 DSH 或刷新客户端；待重启时不重复自动安装。关闭开关或卸载插件能取消尚未开始的安装；已经进入安装的操作会完成并记录结果。

## 修复 issue #5：Electron ASAR 双向误判

感谢 [@OGHong](https://github.com/OGHong) 在 [issue #5](https://github.com/kingcharleslzy-ai/dsh-purge/issues/5) 中提供复现与最小修复。宿主归档检查改用已有 `diskFs()`，覆盖直接调用及完整 selfCheck 入口；归档存在、缺失及权限错误分别如实显示，不通过忽略异常强行标绿，也不改全局 `process.noAsar`。

## 市场与安装包

- 新增官方 format-1 市场索引，固定完整 Git 提交，仅展示已发布正式版本；发布成功后通过 GitHub Pages 自动部署。
- 添加源地址：**https://kingcharleslzy-ai.github.io/dsh-purge/index.json**。启用 DSH 实验性的「自定义插件市场」后，在发现页添加。
- 兼容范围按已验证的 0.2.1 rc.1/rc.2 保守标注；第三方社区目录收录需另外审核，不冒充官方背书。
- 附件包含版本安装包、固定名称 `dsh-purge-community.tgz` 和 SHA256SUMS.txt；固定名称方便社区目录跟随最新正式版本。

## 验证

63 项后端测试、面板既有测试与 7 项维护交互测试、构建一致性、发行包 smoke 通过。使用 DSH 自带 Electron 44.7.0 在临时目录运行真实 ASAR 测试，覆盖归档存在/缺失、完整 selfCheck 入口及权限错误；不启动、不重启、不修改用户 DSH。市场索引使用官方解析器验证。

本版不改宿主补丁表、提示词或现有权限选择。现有用户需手动安装/更新本版并重启一次，新的更新设置才会出现；本次发布不会自动安装到维护者或其他用户的机器。

[1.6.4 发布记录](https://github.com/kingcharleslzy-ai/dsh-purge/releases/tag/v1.6.4) · [更新设置说明](https://github.com/kingcharleslzy-ai/dsh-purge/blob/v1.6.5/docs/AUTO-UPDATE.md)
