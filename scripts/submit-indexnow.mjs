import { readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const siteOrigin = 'https://geminiai-cn.com';
export const keyFileName = '24c2c525638b4e06b795732f0c7ce30a.txt';
export const endpoint = 'https://www.bing.com/indexnow';
const root = fileURLToPath(new URL('../', import.meta.url));

function requestError(error, stage, url) {
    const details = [];
    function collect(cause) {
        if (!cause) return;
        details.push([cause.code || cause.name, cause.message].filter(Boolean).join(': '));
        collect(cause.cause);
        for (const nested of cause.errors || []) collect(nested);
    }
    collect(error);
    const reason = [...new Set(details)].join(' | ');
    let hint = '';
    if (/ENOTFOUND|EAI_AGAIN/.test(reason)) {
        hint = ' DNS 解析失败：请核对域名的 DNS 记录、Vercel Domains 绑定以及本机 DNS/网络。';
    } else if (/TIMEOUT|ETIMEDOUT|TimeoutError/.test(reason)) {
        hint = ' 请求超时：请检查网络连接或代理配置后重试。';
    }
    return new Error(`${stage}失败：${url}\n${reason}${hint}`, { cause: error });
}

export async function createPayload(directory = root) {
    const key = (await readFile(join(directory, keyFileName), 'utf8')).trim();
    if (!/^[a-zA-Z0-9-]{8,128}$/.test(key) || `${key}.txt` !== keyFileName) {
        throw new Error('IndexNow key content must match its public filename.');
    }
    const sitemap = await readFile(join(directory, 'sitemap.xml'), 'utf8');
    const urlList = [...new Set([...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)]
        .map(match => match[1].replace(/&amp;/g, '&')))];
    if (!urlList.length || urlList.length > 10000) {
        throw new Error('IndexNow requires 1–10,000 sitemap URLs.');
    }
    for (const value of urlList) {
        const url = new URL(value);
        if (url.origin !== siteOrigin || url.username || url.password || url.hash || url.search) {
            throw new Error(`Unexpected sitemap URL: ${value}`);
        }
        const path = decodeURIComponent(url.pathname);
        if (path !== '/' && !/^\/[a-zA-Z0-9_-]+\.html$/.test(path)) {
            throw new Error(`Unsupported static page URL: ${value}`);
        }
        await access(join(directory, path === '/' ? 'index.html' : path.slice(1)));
    }
    return { host: new URL(siteOrigin).host, key, keyLocation: `${siteOrigin}/${keyFileName}`, urlList };
}

export async function submitIndexNow({
    directory = root, env = process.env, fetchImpl = globalThis.fetch,
    log = console, productionOnly = false, nonBlocking = false, dryRun = false,
} = {}) {
    if (productionOnly && env.VERCEL_ENV !== 'production') {
        log.log(`[IndexNow] SKIPPED: ${env.VERCEL_ENV || 'local'} build; only Vercel Production submits.`);
        return { status: 'skipped' };
    }
    // Local configuration errors are build errors, not transient submission errors.
    const payload = await createPayload(directory);
    if (dryRun) {
        log.log(`[IndexNow] DRY RUN: ${payload.urlList.length} URLs to ${endpoint}\n${payload.urlList.join('\n')}`);
        return { status: 'dry-run', payload };
    }
    let stage = '读取线上验证文件';
    let requestUrl = payload.keyLocation;
    try {
        // On first deploy the new key may not be public yet. Never submit an unverified key.
        log.log(`[IndexNow] Verifying public key: ${payload.keyLocation}`);
        const keyResponse = await fetchImpl(payload.keyLocation, { signal: AbortSignal.timeout(10000) });
        if (keyResponse.status !== 200) {
            throw new Error(`Public key verification failed (HTTP ${keyResponse.status}). 请先部署验证文件，确保该地址可公开访问。`);
        }
        if ((await keyResponse.text()).trim() !== payload.key) {
            throw new Error('Public key content mismatch (HTTP 200). 线上文件内容与当前 Key 不一致，请部署最新验证文件。');
        }
        stage = '提交到 Bing';
        requestUrl = endpoint;
        log.log(`[IndexNow] Submitting ${payload.urlList.length} URLs to Bing.`);
        const response = await fetchImpl(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000),
        });
        if (response.status !== 200 && response.status !== 202) {
            throw new Error(`Bing rejected the submission: HTTP ${response.status}.`);
        }
        log.log(`[IndexNow] ACCEPTED: HTTP ${response.status}, ${payload.urlList.length} URLs. Receipt is not a guarantee of crawling or indexing.`);
        return { status: 'accepted', httpStatus: response.status, count: payload.urlList.length };
    } catch (error) {
        const diagnostic = requestError(error, stage, requestUrl);
        if (!nonBlocking) throw diagnostic;
        log.warn(`[IndexNow] NOT SUBMITTED/UNCONFIRMED: ${diagnostic.message} Website build continues. After the production domain and key are live, run npm run indexnow to retry.`);
        return { status: 'failed', reason: diagnostic.message };
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const flags = new Set(process.argv.slice(2));
    try {
        await submitIndexNow({
            directory: flags.has('--dist') ? join(root, 'dist') : root,
            productionOnly: flags.has('--production-only'),
            nonBlocking: flags.has('--non-blocking'),
            dryRun: flags.has('--dry-run'),
        });
    } catch (error) {
        console.error(`[IndexNow] FAILED: ${error.message}`);
        process.exitCode = 1;
    }
}
