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
  // ключ автора: подписи Ed25519 считает Node (в приложении — главный процесс)
  const nodeCrypto = require('crypto');
  let author = null;
  const keyIdOf = (pub) => nodeCrypto.createHash('sha256').update(Buffer.from(pub, 'base64')).digest('hex').slice(0, 16);
  const info = () => (author ? { publicKey: author.publicKey, keyId: keyIdOf(author.publicKey), name: author.name } : null);
  await page.exposeFunction('__keysOp', (op, a, b, c) => {
    if (op === 'author') return info();
    if (op === 'ensure') {
      if (!author) { const k = nodeCrypto.generateKeyPairSync('ed25519'); author = { publicKey: k.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), privateKey: k.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), name: a || undefined }; }
      else if (a) author.name = a;
      return info();
    }
    if (op === 'setName') { if (author) author.name = a; return info(); }
    if (op === 'sign') return nodeCrypto.sign(null, Buffer.from(a), nodeCrypto.createPrivateKey({ key: Buffer.from(author.privateKey, 'base64'), format: 'der', type: 'pkcs8' })).toString('base64');
    if (op === 'verify') { try { return nodeCrypto.verify(null, Buffer.from(b), nodeCrypto.createPublicKey({ key: Buffer.from(a, 'base64'), format: 'der', type: 'spki' }), Buffer.from(c, 'base64')); } catch { return false; } }
    if (op === 'export') return author ? JSON.stringify(author) : null;
    if (op === 'import') { try { const j = JSON.parse(a); if (!j.publicKey || !j.privateKey) return null; author = j; return info(); } catch { return null; } }
    return null;
  });
  await page.addInitScript(({ plugins, seed }) => {
    const db = JSON.parse(JSON.stringify(seed || {}));
    const scaffolds = [];
    window.__db = db; window.__scaffolds = scaffolds;
    // файлы проекта: id = sha256 + расширение (как в настоящем хранилище)
    const files = new Map();
    window.__files = files;
    const sniff = (b) => (b[0] === 0x89 && b[1] === 0x50 ? 'png' : b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : b[0] === 0x47 && b[1] === 0x49 ? 'gif' : null);
    const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
    const DOCS = ['systems', 'campaigns', 'app', 'plugin-data'];
    const backups = [];
    window.__backups = backups;
    const snapshot = (reason, note) => {
      const data = {}; for (const k of DOCS) data[k] = JSON.parse(JSON.stringify(db[k] || {}));
      const m = { id: `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${String(backups.length).padStart(3, '0')}-${reason}`, createdAt: new Date().toISOString(), reason, note, app: '0.2.0', systems: Object.keys(data.systems).length, campaigns: Object.keys(data.campaigns).length, bytes: JSON.stringify(data).length };
      backups.push({ m, data }); return m;
    };
    const K = (op) => (...a) => window.__keysOp(op, ...a);
    window.rpi = {
      keys: { author: K('author'), ensure: K('ensure'), setName: K('setName'), sign: K('sign'), verify: K('verify'), export: K('export'), import: K('import') },
      env: async () => ({ version: '0.2.0', launcherMode: false, lang: navigator.language }),
      plugins: async () => plugins, changelog: async () => '## 0.2.0\n- test', openPluginsFolder: async () => {},
      scaffoldPlugin: async (id, f) => { scaffolds.push({ id, files: f }); return id; }, installExamples: async () => 2,
      store: {
        list: async (k) => Object.keys(db[k] || {}), read: async (k, i) => (db[k] || {})[i] ?? null,
        write: async (k, i, d) => { (db[k] ||= {})[i] = JSON.parse(JSON.stringify(d)); }, remove: async (k, i) => { delete (db[k] || {})[i]; },
      },
      assets: {
        put: async (bytes) => {
          const ext = sniff(bytes); if (!ext) return { ok: false, code: 'bad-type', message: 'bad' };
          if (bytes.length > 10 * 1024 * 1024) return { ok: false, code: 'too-big', message: 'big' };
          const id = hex(await crypto.subtle.digest('SHA-256', bytes)) + '.' + ext;
          const existed = files.has(id);
          if (!existed) files.set(id, { bytes: new Uint8Array(bytes), url: URL.createObjectURL(new Blob([bytes], { type: 'image/' + ext })) });
          return { ok: true, id, size: bytes.length, existed };
        },
        read: async (id) => files.get(id)?.bytes ?? null,
        list: async () => [...files].map(([id, f]) => ({ id, size: f.bytes.length })),
        gc: async (extra) => {
          const text = JSON.stringify([db, backups.map((b) => b.data)]) + JSON.stringify(extra);
          let deleted = 0, bytes = 0, kept = 0;
          for (const [id, f] of [...files]) { if (text.includes('asset:' + id)) kept++; else { files.delete(id); deleted++; bytes += f.bytes.length; } }
          return { deleted, bytes, kept };
        },
        url: (id) => files.get(id)?.url ?? 'about:blank',
      },
      backups: {
        list: async () => backups.map((b) => b.m).reverse(),
        create: async (reason = 'manual', note) => snapshot(reason, note),
        auto: async () => (backups.some((b) => b.m.reason === 'auto') ? null : snapshot('auto')),
        restore: async (id) => { const b = backups.find((x) => x.m.id === id); if (!b) return null; const safety = snapshot('before-restore'); for (const k of DOCS) db[k] = JSON.parse(JSON.stringify(b.data[k])); return { restored: b.m, safety }; },
        delete: async (id) => { const i = backups.findIndex((x) => x.m.id === id); if (i < 0) return false; backups.splice(i, 1); return true; },
        openFolder: async () => '',
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
