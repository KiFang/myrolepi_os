// Общая обвязка e2e: статический сервер dist/, браузер и подставное хранилище (вместо Electron IPC).
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html', '.png': 'image/png' };

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', path.join(process.env.HOME || '', '.cache/ms-playwright')].filter(Boolean);
  for (const b of bases) {
    if (!fs.existsSync(b)) continue;
    for (const d of fs.readdirSync(b).filter((x) => x.startsWith('chromium')).sort().reverse()) {
      for (const rel of ['chrome-linux/chrome', 'chrome-win/chrome.exe', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(b, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  throw new Error('Chromium не найден: задайте CHROME_PATH');
}

function serve(port) {
  const dist = path.join(ROOT, 'dist');
  return new Promise((resolve) => {
    const srv = http.createServer((q, r) => {
      const f = path.join(dist, q.url === '/' ? 'index.html' : q.url.split('?')[0]);
      if (!f.startsWith(dist) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
      r.end(fs.readFileSync(f));
    }).listen(port, () => resolve(srv));
  });
}

const plug = (d) => ({ dir: d, manifest: JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', d, 'plugin.json'), 'utf8')), errors: [], code: fs.readFileSync(path.join(ROOT, 'plugins', d, 'index.js'), 'utf8') });

/** Запускает сценарий в чистом браузере. opts: { locale, plugins: ['example-extras', ...], seed: {kind: {id: data}} } */
async function run(name, port, opts, scenario) {
  const srv = await serve(port);
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, locale: opts.locale || 'ru-RU', acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  // confirm() в Electron работает, prompt() — нет: приложение его не использует, поэтому prompt-диалог считаем ошибкой
  page.on('dialog', (d) => (d.type() === 'prompt' ? (errors.push('используется window.prompt(), которого нет в Electron'), d.dismiss()) : d.accept()));
  await page.addInitScript(({ plugins, seed }) => {
    const db = JSON.parse(JSON.stringify(seed || {}));
    const scaffolds = [];
    window.__db = db; window.__scaffolds = scaffolds;
    window.rpi = {
      env: async () => ({ version: '0.1.0', launcherMode: false, lang: navigator.language }),
      plugins: async () => plugins, changelog: async () => '## 0.1.0\n- test', openPluginsFolder: async () => {},
      scaffoldPlugin: async (id, files) => { scaffolds.push({ id, files }); return id; }, installExamples: async () => 2,
      store: {
        list: async (k) => Object.keys(db[k] || {}), read: async (k, i) => (db[k] || {})[i] ?? null,
        write: async (k, i, d) => { (db[k] ||= {})[i] = JSON.parse(JSON.stringify(d)); }, remove: async (k, i) => { delete (db[k] || {})[i]; },
      },
    };
  }, { plugins: (opts.plugins || []).map(plug), seed: opts.seed });
  let failed = 0;
  const step = async (title, fn) => {
    try { await fn(); console.log('  ok   ', title); } catch (e) { failed++; console.log('  FAIL ', title, '—', String(e.message).split('\n')[0]); }
  };
  console.log(name);
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('.ws-header');
  try { await scenario({ page, step, btn: (n) => page.getByRole('button', { name: n, exact: true }), db: () => page.evaluate(() => window.__db) }); }
  catch (e) { failed++; console.log('  FAIL scenario aborted —', e.message.split('\n')[0]); }
  if (errors.length) { failed++; console.log('  FAIL console errors:\n   ', errors.join('\n    ')); }
  await browser.close(); srv.close();
  return failed;
}

module.exports = { run, ROOT };
