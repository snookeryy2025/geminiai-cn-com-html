# Gemini AI CN 静态网站

正式域名：`https://geminiai-cn.com`。Node.js 22，无第三方构建依赖。

## 部署到 Vercel

导入本仓库，Root Directory 选仓库根目录，Framework Preset 选 **Other**。
仓库的 `vercel.json` 已设置：

- Build Command：`npm run build`
- Output Directory：`dist`
- 跳过依赖安装（项目无依赖）
- 保留 `.html` 地址，和 canonical、sitemap 一致

在 Vercel 的 Domains 中绑定 `geminiai-cn.com` 并完成 DNS 配置。
部署成功后可手动通知 Bing；Preview 部署和普通本地构建不会提交。
不需要另配 IndexNow 环境变量，仓库中的验证文件属于公开域名验证文件。

## IndexNow 自动提交

`npm run build` 只校验 sitemap 和本地验证文件并打包公开文件到 `dist`：

1. 从 sitemap 提取、去重 URL，检查正式域名及页面文件。
2. 构建完成后，确认正式域名上的验证文件返回 HTTP 200，且内容与本地一致。
3. 向 `https://www.bing.com/indexnow` POST `host`、`key`、`keyLocation`、`urlList`。
4. HTTP 200 / 202 记录为已接收。DNS、超时或 Bing 拒绝不会影响网页部署；本地配置错误会阻止构建。

**IndexNow 不在 Vercel 构建阶段运行。**构建阶段访问正式域名会遇到 DNS、重定向或新部署尚未生效的问题，导致网页构建被误判为失败。
等 Production 部署成功且域名能公开访问后，在本地执行 `npm run indexnow:production` 提交打包后的 sitemap；也可以执行 `npm run indexnow` 使用源码目录提交。

执行提交命令时查看 `[IndexNow] ACCEPTED`、`SKIPPED` 或
`NOT SUBMITTED/UNCONFIRMED`。200 / 202 只表示接收请求，不保证抓取或收录。
可在 Bing Webmaster Tools 中登记 `https://geminiai-cn.com/sitemap.xml`。

## 本地命令

```sh
npm run build          # 生成 dist；不访问线上域名
npm run indexnow:dry   # 检查和展示网址，不发网络请求
npm run indexnow:production # 部署成功后提交 dist 中的 sitemap
npm run indexnow       # 正式提交；失败返回非零状态，可在上线后补交
npm test              # 用模拟网络验证成功、失败和环境分支，不通知搜索引擎
```

新增页面时更新 `sitemap.xml`，并保持 canonical、robots 和正式域名一致。
脚本提交 sitemap 中的全部页面，目前为首页、models 页、使用指南页、Gemini 3.8 模型文章页和 Gemini 3.1 / 3.8 Flash 指南页。
构建只复制 HTML、css、js、images、robots、sitemap 和验证文件，不公开脚本或仓库配置。

协议参考：[IndexNow 官方文档](https://www.indexnow.org/documentation)。

## 提交失败排查

脚本会显示失败阶段、请求地址与底层网络错误。首先读取正式域名上的验证文件，
验证通过后才向 Bing 发送 POST，因此验证文件请求失败并不代表 Bing 拒绝。

- `ENOTFOUND` / `EAI_AGAIN`：域名解析失败。确认 Vercel Domains 中已添加 `geminiai-cn.com`，并在域名的 DNS 管理面板配置 Vercel 为该域名实际提供的记录。本站使用不带 `www` 的根域名；还需检查本机 DNS。
- HTTP 404：新验证文件尚未部署或路由不正确，先完成 Production 部署。
- HTTP 200 且 `content mismatch`：可能仍是旧 Key、重定向页面或 HTML 回退页，验证地址必须返回当前 Key 的纯文本。
- `ETIMEDOUT` / `TimeoutError`：检查网络连接和运行环境设置后重试。
- `提交到 Bing失败` 且带 HTTP 状态码：请求已到提交阶段，按 Bing 返回的状态排查验证、请求内容或频率。

验证文件公开可访问后，再运行 `npm run indexnow`。不要为了跳过验证而直接改为另一个域名；如更换正式域名，应同步 canonical、sitemap、robots 和脚本。
