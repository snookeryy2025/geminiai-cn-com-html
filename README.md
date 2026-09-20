# Gemini AI CN 静态网站

正式域名：`https://www.geminiai-cn.com`。Node.js 22，无第三方构建依赖。

## 部署到 Vercel

导入本仓库，Root Directory 选仓库根目录，Framework Preset 选 **Other**。
仓库的 `vercel.json` 已设置：

- Build Command：`npm run build`
- Output Directory：`dist`
- 跳过依赖安装（项目无依赖）
- 保留 `.html` 地址，和 canonical、sitemap 一致

在 Vercel 的 Domains 中绑定 `www.geminiai-cn.com` 并完成 DNS 配置。
使用 Production 部署才能自动通知 Bing；Preview 部署和普通本地构建不会提交。
不需要另配 IndexNow 环境变量，仓库中的验证文件属于公开域名验证文件。

## IndexNow 自动提交

`npm run build` 先校验 sitemap 和本地验证文件、打包公开文件到 `dist`，
然后在 `VERCEL_ENV=production` 时自动运行提交脚本：

1. 从打包后的 `sitemap.xml` 提取、去重 URL，检查正式域名及页面文件。
2. 确认正式域名上的验证文件返回 HTTP 200，且内容与本地一致。
3. 向 `https://www.bing.com/indexnow` POST `host`、`key`、`keyLocation`、`urlList`。
4. HTTP 200 / 202 记录为已接收。DNS、超时或 Bing 拒绝会记录警告，不阻止上线；本地配置错误会阻止构建。

**触发时机是 Production 构建结束阶段，不是部署成功之后的回调。**
首次上线、更换域名或验证文件时，新文件可能尚未公开：此次自动提交可能失败。
等部署成功且域名能公开访问后，执行 `npm run indexnow` 补交，或重新进行一次 Production 部署。
此流程没有后台重试，预览晋升为正式版本且不重新构建时也需手动补交。

查看 Vercel Build Logs 中的 `[IndexNow] ACCEPTED`、`SKIPPED` 或
`NOT SUBMITTED/UNCONFIRMED`。200 / 202 只表示接收请求，不保证抓取或收录。
可在 Bing Webmaster Tools 中登记 `https://www.geminiai-cn.com/sitemap.xml`。

## 本地命令

```sh
npm run build          # 生成 dist；本地默认不联网提交
npm run indexnow:dry   # 检查和展示网址，不发网络请求
npm run indexnow       # 正式提交；失败返回非零状态，可在上线后补交
npm test              # 用模拟网络验证成功、失败和环境分支，不通知搜索引擎
```

新增页面时更新 `sitemap.xml`，并保持 canonical、robots 和正式域名一致。
脚本提交 sitemap 中的全部页面，目前为首页、models 页和使用指南页。
构建只复制 HTML、css、js、images、robots、sitemap 和验证文件，不公开脚本或仓库配置。

协议参考：[IndexNow 官方文档](https://www.indexnow.org/documentation)。
