# 1.6.61 分发说明（Windows DSH NEXT 候选版）

> **状态：本地构建包，尚未作为正式 Release 发布。**
> 当前适合小范围分发测试；如果要公开推广，建议先提交源码并发布带校验文件的正式版本。

其他用户可以使用，但需要按「本地 TGZ 安装 + 核对 SHA256」的方式自行安装，并按**测试版 / 候选版本**对待。

---

## 1. 使用要求：正式验证过的组合

| 组件 | 值 |
| --- | --- |
| 操作系统 | Windows |
| DSH NEXT | `2.0.19-next` |
| 内置 DSH | `0.2.1-rc.2` |
| Purge | `1.6.61` |

其他 NEXT 版本**可以被识别**，但会显示“未验证”，不能保证补丁锚点仍然一致。遇到“未验证”先跑 `diagnose` 看锚点漂移，不要直接点应用。

## 2. 安装包与校验

| 项 | 值 |
| --- | --- |
| 文件 | `dsh-purge-community-1.6.61.tgz` |
| SHA256 | `93511F5B758808E85C7B3455F9308B70851C9E0BA99A00E34F69D9056A7517F0` |

校验命令：

```powershell
# PowerShell
(Get-FileHash .\dsh-purge-community-1.6.61.tgz -Algorithm SHA256).Hash
```

```bash
# bash / Git Bash
sha256sum dsh-purge-community-1.6.61.tgz
```

哈希不一致说明文件在传输或解压中被改动，停止安装、重新获取。Windows PowerShell 5.1 读 JSON/文档请用 `Get-Content -Raw -Encoding UTF8`，不要把默认 ANSI 解码出的乱码当成包损坏。

## 3. 正确安装方式

其他用户**不能**直接复制你的 `.dsh`、`node_modules` 或 DSH NEXT 安装目录，应按下列步骤在自己机器上安装：

1. 获取上述 TGZ 文件并核对 SHA256。
2. 找到自己 DSH NEXT 的实际安装目录。
3. 使用自己安装中的 `resources\app\lib\desktop-cli.js`。
4. 通过 NEXT CLI 安装到自己的 `desktop` Profile（示例，路径换成自己的）：

   ```powershell
   $tgz = "C:\path\to\dsh-purge-community-1.6.61.tgz"
   $cli = "C:\path\to\DSH NEXT\resources\app\lib\desktop-cli.js"

   $env:ELECTRON_RUN_AS_NODE = '1'
   $env:DSH_PROFILE = 'desktop'
   node --expose-internals $cli plugin --profile desktop add $tgz
   ```

   保留 `DSH_HOME`、Profile 与 `ELECTRON_RUN_AS_NODE` 环境，不要换成 `npx` 或全局 npm 安装到另一个宿主。
5. 完整退出并重新打开一次 DSH NEXT。
6. 打开 Purge 面板，确认显示 **1.6.61** 和正确的 NEXT 版本。
7. 点击一次「应用」。

安装目录不必和维护者相同（例如维护者是 `D:\cs\DSH NEXT`）：插件按**文件身份**识别宿主，不依赖盘符或目录名称。反之，把整份安装目录复制给别人也不能代替安装。

## 4. 首次应用注意事项

如果用户仍是**密封布局**：

```
resources\app.asar
```

首次「应用」会：

- 解开宿主到 `resources\app`
- 写入补丁
- 等待用户完整退出 DSH NEXT
- 安全移走旧 `app.asar`
- 用户再手动打开 DSH NEXT

不能只关闭窗口，**需要从系统托盘完整退出**。换包期间归档被官方更新替换会中止，必须重新应用新宿主。

如果已经是**解包布局**，后续「应用」会使用 NEXT 原生 `desktopActions.requestRestart()` 重建 Host，**不使用 `taskkill`**。原生接口缺失时明确要求手动重启，不要改回通用 helper。

## 5. 不应分发的内容

不要分发这些本机数据：

| 路径 / 内容 | 原因 |
| --- | --- |
| `C:\Users\<用户>\.dsh` | 含本机路径、profile 与历史 |
| `dsh-next-acceptance*` | 验收夹具，绑定本机布局 |
| Purge 快照与审计日志（`dsh-purge-community/backups/`、`audit.jsonl`） | 含本机操作记录 |
| `prompt-inject.md` | 用户自己的提示词正文 |
| 用户 Profile 配置（`cordis.patch.yml` 等） | 含权限与个人设置 |
| `app.asar.purge-backup.bak` | 宿主归档备份，体积大且与本机绑定 |

其他用户只需要 **TGZ + 安装说明**（即本文件）。

## 6. 当前分发限制

当前源码修改和 TGZ 都是本地版本，因此：

- GitHub 的 `latest` 地址可能仍然提供旧版 **1.6.60**；
- 其他用户不能通过“检测更新”可靠获得本地 1.6.61；
- 移动或删除其本机 TGZ 后，Profile 中的 `file:` 安装来源可能失效；已安装插件暂时仍能运行，但以后重装或依赖恢复会失败；
- 大范围分发前最好创建正式 Git 提交、版本标签和 Release，并上传 TGZ 与 SHA256 文件。

## 7. 结论

同版本 Windows DSH NEXT 用户可以正常使用，但目前应通过**本地 TGZ** 安装，并按「测试版 / 候选版本」方式分发。

## 8. 想转成正式发布时

1. 打 tag `1.6.61`，推送源码与 tag；
2. Release 上传 `dsh-purge-community-1.6.61.tgz` 和 `dsh-purge-community-1.6.61.tgz.sha256`；
3. 把 `package.json` 的 `dsh-purge.install.tarball` / `install.git` 改成正式发行仓库地址（否则装出来的仍是旧仓库的包）；
4. 之后“检测更新”与 `latest` 地址才会指向本版。
