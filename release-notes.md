# 1.6.6

- 修复 [issue #7](https://github.com/kingcharleslzy-ai/dsh-purge/issues/7) 的独立安装恢复路径：公开镜像缺少 `@dsh-ops/bash-win32-x64` 指定版本元数据时，验证 npm 官方元数据后只对该 scope 重试一次。保留全部 pnpm 校验，不改变全局源、不切换私有源、不重试真实完整性/信任/发布时间错误。
- 新增 Windows PowerShell 5.1 / 7 安装入口，自动定位唯一 Desktop（可显式指定），使用应用运行时，不要求全局 Node/pnpm；参数、空格/中文路径、失败退出与进程环境恢复纳入测试。
- macOS / Windows 共用下载、大小边界、SHA256、包身份核对与备份迁移；修复校验清单含稳定别名但未下载该别名时的误报。
- 同步 README、中文副本、英文指南、AGENTS 与维护说明；明确市场首次安装由 DSH 执行，需选择 npm 官方源或使用独立安装器，不声称插件能接管加载前的宿主流程。
- 安装前备份，保留现有提示词、规则、更新偏好及其他插件；不自动重启、不自动应用宿主补丁。完整 Windows 宿主补丁/界面兼容仍需独立验收。

验证：89 项功能回归、7 项面板测试、Linux/macOS/Windows 安装器、PowerShell 5.1/7 入口及 Mac 真实 DSH 隔离迁移/回滚通过。详见 [验收记录](docs/releases/1.6.6.md)。

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
