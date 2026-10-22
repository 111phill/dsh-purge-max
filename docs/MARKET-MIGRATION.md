# 从插件市场安装或迁移 Purge

首次安装可在 dsh-market 搜索 `kingcharleslzy-ai/dsh-purge`。确认仓库作者和包名 `dsh-purge-community`；同名镜像不是同一发行来源。不要运行 `dsh plugin add dsh-purge` 或裸包名 `dsh-purge-community`：本项目通过 GitHub Releases 发行，不依赖这两个 npm 名称。

## 已装旧版：直接迁移，不先卸载

市场提示“已以 dsh-purge 安装”时，不代表社区版已经装好。两个包沿用相同的入口 ID，强行同时启用会冲突。请使用 [README 的 macOS / Windows 安装入口](../README.md)；它会校验来源与 SHA256、先备份，再迁移到当前 profile。**不要先卸载、删除 DSH_HOME 或清空提示词。**

1. 确认目标 DSH、数据目录及 profile。运行安装器的 `--dry-run`（Windows `-DryRun`）核对；路径不唯一时明确指定。不要拿其他用户的目录照抄。
2. 去掉 dry-run 执行迁移。需要提前结束其他安装操作；不必停止聊天或自动重启 DSH。
3. 安装器保留提示词、规则、更新偏好、权限、其他插件及旧包文件。仅切换 Purge bundle 和已识别的旧包 `name` 引用，配置值与注释保留。
4. 成功后记录 `backup_id`。用户方便时手动退出重开，核对加载版本；安装、应用宿主补丁、重启是三个独立动作，不自动执行后两项。

### Agent 必须注意

- 官方宿主 CLI 的安装规则一致，但第三方市场可能增加目录筛选、重复安装保护、来源转换和加载验证。市场网页列出插件，不等于其 `index.json` 包含该插件。
- 缺少 npm 发布不等于没有安装包。独立索引是 <https://kingcharleslzy-ai.github.io/dsh-purge/index.json>，Git 版本固定完整提交 SHA。第三方索引遗漏应修生成器，不能伪造 npm 元数据或降低完整性校验。
- 迁移仅识别 `dsh-purge`、redteam、presets、store、ui 的标准入口。手动 `insert`、未知 ID、动态包名、错误 YAML 保持失败并恢复依赖；报告具体入口冲突，不能删参数或盲目禁用来消除错误。
- `migrated_references` 是实际改写的包引用数量。0 不代表失败：没有显式旧包覆盖时无需改配置。成功后还需检查启用列表只有社区包、配置合成无重复 ID、用户配置值仍在。
- 回滚使用 `purge-community rollback <backup_id>`，恢复旧包入口并保留当前配置值。配置被并发修改、迁移记录损坏、恢复失败应明确报告并保留恢复目录；不能把备份存在当作回滚成功。
- 失败时只索取脱敏的市场名/版本、DSH 版本、系统、安装来源和错误码；不要收集完整提示词、密钥、配置或备份。

## 测试与边界

`scripts/check-market-migration-runtime.mjs <官方CLI> <旧版tgz> <候选tgz>` 创建全新隔离 home，执行真实安装、配置合成、回滚、再升级和失败恢复，并检查私有内容哨兵。它不启动宿主或运行插件 apply，不代表完整模型行为测试。Mac 与 Windows 均需运行。

第三方 dsh-market 的迁移提示与社区索引生成器需由其维护者合并发布。我们的新版独立安装器可先用于迁移；不能声称更新 Purge 就能改掉尚未加载 Purge 的市场拦截逻辑。
