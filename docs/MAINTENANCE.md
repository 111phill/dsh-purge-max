# 维护、迁移与恢复

当前版本 **1.6.7**。包名 `dsh-purge-community`，来源仅本仓库正式 GitHub Releases；保留内部 Cordis ID `dsh-purge`、HTTP `/dsh-purge/*` 及用户数据目录。主安装步骤与镜像故障决策树统一见 [安装指南](INSTALLATION.md)；[AGENTS.md](../AGENTS.md) 是 Agent 操作说明。

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
