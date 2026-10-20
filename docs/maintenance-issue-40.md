# #40：桌面归档入口与磁盘诊断目标不一致

## 已复现的根因

1.6.31 的面板状态经 `gatherState → findAiBase` 查找实际目录，自检经
`currentHost → normalizeHostBase` 从当前启动脚本定位。Electron 从
`Resources/app.asar/dsh/.../dsh-desktop-host/lib/index.js` 启动时，后者得到归档内根。
补丁检查器的 `isFile` 明确排除 `.asar/` 内路径，因而把其中的必需目标报告为
`missing_file`，即使同一安装的 `Resources/app/dsh/...` 已有对应文件。

真实 Electron 44.7.0 的临时归档已复现：同一测试文件，实际目录为 `applied`，
归档路径为 `missing_file`。这证明代码缺陷存在，不代表仅凭报告者的截图已确认其
每一个红项的原因。#40 仍需补充 DSH 版本、启动方式、目标路径及布局详情。

## 1.6.32 的处理

- 新增只读 `diagnosticHost`，供面板 status、自检、diagnose 和 CLI diagnose 共用。
- 只将已选定安装的归档入口解析为同一 Resources 下的实际目录：优先 `app`，
  其次 `app.asar.unpacked`。已有但不完整/不可读的优先目录不切换到更健康的目录。
- 显式实际路径保持原目标；没有启动或显式实例证据时返回未知，不扫描其他安装。
- `currentHost`、安装、应用、补丁表、迁移、提示词与权限逻辑保持不变。
- 原始补丁明细与分层自检使用同一磁盘目标；面板合并显示组与原始条目计数仍不同，
  #76 的只读预设适用性判断也仍保留，不能强行让两个数字相等。
- `app.asar` 仍存在时继续报告布局问题；缺失文件、失败、未知以及权限不匹配均不隐藏。
  磁盘已应用不证明当前进程加载了修改。

## 验证

`npm run test:electron` 新增真实 ASAR 场景，并通过 Cordis 注册的实际
status/selfcheck/diagnose HTTP handler 验证目标一致。使用中性的诊断夹具，不调用模型。
同时检查真正缺失项、密封归档和主动配置的权限差异仍报错，临时提示词/profile 字节不变。
`test/instance.test.mjs` 覆盖两种物理目录、部分目录、未解包、权限拒绝、
显式目标和无实例证据。原有默认预设、未知/失败优先级和 npm 嵌套目录测试继续执行。

CI 在 macOS 与 Windows 运行真实 Electron 诊断；三个平台继续执行安装器与打包测试。
真实桌面 UI、报告者的 macOS 15 安装和当前进程加载状态不由这些测试代替。

## 排查与回滚边界

先收集 DSH 精确版本、安装/启动方式以及是否刚更新过 DSH，核对 status.ai_base、
selfcheck.host、host-status 的 disk/process 字段和报错条目。分享前脱敏用户名、
私人目录名；不要上传提示词、凭证、全量配置或整个备份。

不要仅为消红改权限、删除归档或重新应用全部补丁。需要用户完整退出时先说明原因，
不能自动重启。此修复不迁移用户数据；回滚插件包会恢复旧诊断行为，不应恢复旧用户设置。

Windows CI 的全套 Node 测试固定 `--test-concurrency=2`，避免多个测试文件同时启动
PowerShell 时的冷启动争用。曾在 GitHub runner 复现 12 秒状态等待超时、另一
PowerShell 用例耗时约 26 秒；相同源码在 4090 全套通过。仅限制测试并发，测试列表、
断言、生产助手超时与失败检查保持不变。
