import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPayload, submitIndexNow, endpoint, siteOrigin, keyFileName } from './submit-indexnow.mjs';

const key = keyFileName.slice(0, -4);
const quiet = { log() {}, warn() {} };
const sitemap = urls => `<urlset>${urls.map(url => `<url><loc>${url}</loc></url>`).join('')}</urlset>`;

async function fixture(t, urls = [siteOrigin + '/', siteOrigin + '/models.html']) {
    const directory = await mkdtemp(join(tmpdir(), 'gemini-indexnow-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, keyFileName), key);
    await writeFile(join(directory, 'index.html'), '<h1>Home</h1>');
    await writeFile(join(directory, 'models.html'), '<h1>Models</h1>');
    await writeFile(join(directory, 'sitemap.xml'), sitemap(urls));
    return directory;
}

test('payload uses the canonical host, public key and deduplicated sitemap URLs', async t => {
    const directory = await fixture(t, [siteOrigin + '/', siteOrigin + '/', siteOrigin + '/models.html']);
    const payload = await createPayload(directory);
    assert.equal(payload.host, 'geminiai-cn.com');
    assert.equal(payload.keyLocation, `${siteOrigin}/${keyFileName}`);
    assert.equal(payload.key, key);
    assert.deepEqual(payload.urlList, [siteOrigin + '/', siteOrigin + '/models.html']);
});

test('local and Preview builds do not make requests; dry runs also stay offline', async t => {
    const fetchImpl = () => { throw new Error('Network must not be used'); };
    for (const env of [{}, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }]) {
        assert.equal((await submitIndexNow({ productionOnly: true, env, fetchImpl, log: quiet })).status, 'skipped');
    }
    const directory = await fixture(t);
    assert.equal((await submitIndexNow({ directory, dryRun: true, fetchImpl, log: quiet })).status, 'dry-run');
});

for (const status of [200, 202]) {
    test(`Production submits JSON to Bing after key verification and accepts HTTP ${status}`, async t => {
        const directory = await fixture(t);
        const calls = [];
        const fetchImpl = async (url, options) => {
            calls.push({ url, options });
            return calls.length === 1 ? new Response(key) : new Response('', { status });
        };
        const result = await submitIndexNow({ directory, productionOnly: true, env: { VERCEL_ENV: 'production' }, fetchImpl, log: quiet });
        assert.equal(result.status, 'accepted');
        assert.equal(result.count, 2);
        assert.equal(calls.length, 2);
        assert.equal(calls[0].url, `${siteOrigin}/${keyFileName}`);
        assert.equal(calls[1].url, endpoint);
        assert.equal(calls[1].options.method, 'POST');
        assert.deepEqual(JSON.parse(calls[1].options.body), await createPayload(directory));
    });
}

test('an unavailable or wrong public key prevents submission without failing deployment', async t => {
    const directory = await fixture(t);
    for (const response of [new Response('not found', { status: 404 }), new Response('wrong-key')]) {
        let requests = 0;
        const warnings = [];
        const result = await submitIndexNow({ directory, nonBlocking: true,
            fetchImpl: async () => { requests++; return response; },
            log: { log() {}, warn(message) { warnings.push(message); } } });
        assert.equal(result.status, 'failed');
        assert.equal(requests, 1);
        assert.match(warnings[0], /NOT SUBMITTED\/UNCONFIRMED/);
    }
});

test('Bing rejection is a visible deployment warning and a strict manual failure', async t => {
    const directory = await fixture(t);
    for (const status of [403, 422, 429, 500]) {
        const fetchImpl = async url => url === endpoint ? new Response('', { status }) : new Response(key);
        assert.equal((await submitIndexNow({ directory, fetchImpl, nonBlocking: true, log: quiet })).status, 'failed');
        await assert.rejects(submitIndexNow({ directory, fetchImpl, log: quiet }), new RegExp(`HTTP ${status}`));
    }
});

test('DNS/timeout errors preserve deployment but fail manual submission', async t => {
    const directory = await fixture(t);
    const fetchImpl = async () => { throw new Error('network timeout'); };
    assert.equal((await submitIndexNow({ directory, fetchImpl, nonBlocking: true, log: quiet })).status, 'failed');
    await assert.rejects(submitIndexNow({ directory, fetchImpl, log: quiet }), /network timeout/);
});

test('invalid local configuration fails even in non-blocking mode', async t => {
    const directory = await fixture(t);
    const fetchImpl = () => { throw new Error('Network must not be used'); };
    for (const urls of [[], ['https://other.example/'], [siteOrigin + '/missing.html'], [siteOrigin + '/models.html#section']]) {
        await writeFile(join(directory, 'sitemap.xml'), sitemap(urls));
        await assert.rejects(submitIndexNow({ directory, fetchImpl, nonBlocking: true, log: quiet }));
    }
    await writeFile(join(directory, 'sitemap.xml'), sitemap([siteOrigin + '/']));
    await writeFile(join(directory, keyFileName), 'incorrect-key');
    await assert.rejects(createPayload(directory), /key content/);
});

test('Vercel configuration invokes the guarded build and publishes only dist', async () => {
    const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(config.buildCommand, 'npm run build');
    assert.equal(config.outputDirectory, 'dist');
    assert.equal(config.cleanUrls, false);
    assert.match(pkg.scripts.build, /--production-only --non-blocking --dist/);
});

test('nested DNS failure identifies the verification URL and preserves the error code', async t => {
    const directory = await fixture(t);
    let requests = 0;
    const fetchImpl = async () => {
        requests++;
        throw new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo ENOTFOUND geminiai-cn.com'), { code: 'ENOTFOUND' }) });
    };
    await assert.rejects(submitIndexNow({ directory, fetchImpl, log: quiet }), error => {
        assert.match(error.message, /读取线上验证文件失败/);
        assert.ok(error.message.includes(`${siteOrigin}/${keyFileName}`));
        assert.match(error.message, /ENOTFOUND/);
        assert.match(error.message, /DNS 解析失败/);
        return true;
    });
    assert.equal(requests, 1);
});

test('Bing connection failures identify the POST stage and aggregate timeout causes', async t => {
    const directory = await fixture(t);
    const fetchImpl = async url => {
        if (url !== endpoint) return new Response(key);
        throw new TypeError('fetch failed', { cause: new AggregateError([
            Object.assign(new Error('connection timed out'), { code: 'ETIMEDOUT' }),
        ]) });
    };
    const result = await submitIndexNow({ directory, fetchImpl, nonBlocking: true, log: quiet });
    assert.equal(result.status, 'failed');
    assert.match(result.reason, /提交到 Bing失败/);
    assert.ok(result.reason.includes(endpoint));
    assert.match(result.reason, /ETIMEDOUT/);
    assert.match(result.reason, /请求超时/);
});

test('HTTP 200 with an outdated key reports content mismatch, not network failure', async t => {
    const directory = await fixture(t);
    await assert.rejects(submitIndexNow({ directory, fetchImpl: async () => new Response('old-key'), log: quiet }), /content mismatch/);
});
