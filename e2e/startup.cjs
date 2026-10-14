// Замер запуска настоящего Electron: от старта процесса до готовой шапки и до готовой студии. Запуск: npm run build && node e2e/startup.cjs
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
(async () => {
  const runs = Number(process.argv[2] || 3), times = [];
  for (let i = 0; i < runs; i++) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rolepi-perf-'));
    const port = 9340 + i + Math.floor(Math.random() * 500);
    const t0 = Date.now();
    const app = spawn('xvfb-run', ['-a', require('electron'), ROOT, '--no-sandbox', `--user-data-dir=${path.join(tmp, 'ud')}`, `--remote-debugging-port=${port}`, '--launcher', '--data-dir', path.join(tmp, 'data'), '--plugins-dir', path.join(tmp, 'plugins'), '--lang', 'ru'], { stdio: 'ignore', detached: true });
    let browser; for (let k = 0; k < 600 && !browser; k++) { try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await new Promise((r) => setTimeout(r, 50)); } }
    const page = browser.contexts()[0].pages()[0];
    await page.waitForSelector('.ws-header'); const header = Date.now() - t0;
    await page.waitForSelector('.ws-welcome'); const ready = Date.now() - t0;
    const m = await page.evaluate(() => ({ scripts: performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.js')).length, kb: Math.round(performance.getEntriesByType('resource').filter((r) => /\.(js|css)$/.test(r.name)).reduce((n, r) => n + (r.encodedBodySize || 0), 0) / 1024), domContentLoaded: Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd) }));
    times.push({ header, ready, ...m });
    await browser.close(); try { process.kill(-app.pid, 'SIGKILL'); } catch { /* уже завершился */ } fs.rmSync(tmp, { recursive: true, force: true });
    await new Promise((r) => setTimeout(r, 800));
  }
  const med = (k) => times.map((t) => t[k]).sort((a, b) => a - b)[Math.floor(times.length / 2)];
  console.log(JSON.stringify({ runs, header_ms: med('header'), ready_ms: med('ready'), domContentLoaded_ms: med('domContentLoaded'), js_files: times[0].scripts, js_css_kb: times[0].kb }));
  process.exit(0);
})();
