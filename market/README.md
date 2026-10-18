# DSH 自定义市场索引

正式源地址：**https://kingcharleslzy-ai.github.io/dsh-purge/index.json**

DSH「插件 → 实验性插件 → 更多 → 自定义插件市场」开启后，在「发现 → 添加索引源」粘贴该地址。没有这个功能的旧宿主仍可通过 GitHub Release 安装。

索引遵循官方 format 1，只收录本仓库从 1.6.5 起的已发布正式版本；源码安装固定到完整 Git 提交，不指向可变分支。发布工作流成功后生成并部署 GitHub Pages，不需要手改索引。

兼容范围保守标为 `>=0.2.1-rc.1 <0.2.2-0`，表示该市场条目的验证范围，不声称其他宿主已验证。市场展示不代表 DeepSeek 官方背书，也不会自动应用宿主补丁。

社区目录收录与自建源是两件事：自建源由用户添加；社区目录需提交条目并等待维护者审核。

官方规范：https://deepseek-harness.github.io/deepseek-harness/en/guide/plugin-market
