// Настоящий Electron (без подставного хранилища): запуск с аргументами лаунчера, согласие на плагин, сохранение на диск.
// Запуск: npm run build && npx tsc -p tsconfig.main.json && npm run e2e:electron   (нужны xvfb-run и установленный electron)
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rolepi-e2e-'));
  const plugins = path.join(tmp, 'plugins'); fs.mkdirSync(plugins);
  fs.cpSync(path.join(ROOT, 'plugins', 'example-extras'), path.join(plugins, 'example-extras'), { recursive: true });
  const electron = require('electron');
  const app = spawn('xvfb-run', ['-a', electron, ROOT, '--no-sandbox', '--remote-debugging-port=9334', '--launcher', '--data-dir', path.join(tmp, 'data'), '--plugins-dir', plugins, '--lang', 'ru'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; app.stdout.on('data', (d) => (out += d)); app.stderr.on('data', (d) => (out += d));
  let browser;
  for (let i = 0; i < 60 && !browser; i++) { try { browser = await chromium.connectOverCDP('http://127.0.0.1:9334'); } catch { await new Promise((r) => setTimeout(r, 500)); } }
  if (!browser) { console.log('FAIL не удалось подключиться к Electron\n', out.slice(-800)); app.kill(); process.exit(1); }
  const page = browser.contexts()[0].pages()[0];
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('dialog', (d) => d.accept());
  let failed = 0;
  const step = async (n, fn) => { try { await fn(); console.log('  ok   ', n); } catch (e) { failed++; console.log('  FAIL ', n, '—', String(e.message).split('\n')[0]); } };
  console.log('Electron: аргументы лаунчера, плагины, сохранение на диск');
  await page.waitForSelector('.ws-welcome', { timeout: 20000 });
  await step('язык из лаунчера (--lang ru)', async () => { await page.waitForSelector('text=Создайте собственную ролевую игру'); });
  await step('плагин из --plugins-dir просит разрешение, после согласия появляется тема', async () => {
    await page.getByRole('button', { name: 'Плагины', exact: true }).click(); await page.waitForSelector('.plugin-card.state-needs-approval');
    await page.getByRole('button', { name: 'Разрешить и включить' }).click(); await page.waitForSelector('.plugin-card.state-active');
    if (!fs.existsSync(path.join(tmp, 'data', 'app', 'plugins.json'))) throw new Error('согласие не записано на диск');
    if (!(await page.locator('.ws-theme option').allInnerTexts()).includes('Закат')) throw new Error('тема не появилась');
  });
  await step('шаблон плагина создаётся в папке плагинов', async () => {
    await page.getByRole('button', { name: 'Создать шаблон' }).click(); await page.getByLabel('Название нового плагина').fill('Мой тест'); await page.getByRole('button', { name: 'Создать', exact: true }).click(); await page.waitForSelector('text=Шаблон создан');
    const dirs = fs.readdirSync(plugins).filter((d) => d !== 'example-extras'); if (!dirs.length) throw new Error('папка не создана');
    JSON.parse(fs.readFileSync(path.join(plugins, dirs[0], 'plugin.json'), 'utf8')); if (!fs.readFileSync(path.join(plugins, dirs[0], 'index.js'), 'utf8').includes('registerFormulaFunction')) throw new Error('index.js');
  });
  await step('Ctrl+S записывает систему и кампанию в реальные файлы', async () => {
    await page.getByRole('button', { name: 'Студия', exact: true }).click(); await page.getByRole('button', { name: 'Посмотреть пример', exact: true }).click(); await page.waitForSelector('.ws-table');
    await page.getByRole('button', { name: 'Новая кампания', exact: true }).click(); await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await page.keyboard.press('Control+s'); await page.waitForSelector('.ws-status >> text=Сохранено', { timeout: 6000 });
    const sys = fs.readdirSync(path.join(tmp, 'data', 'systems')), cam = fs.readdirSync(path.join(tmp, 'data', 'campaigns'));
    if (sys.length !== 1 || cam.length !== 1) throw new Error(sys + '|' + cam);
    if (JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'systems', sys[0]), 'utf8')).entityTypes.length < 4) throw new Error('битый JSON');
  });
  await step('панельный плагин: согласие, изоляция рамки, создание героя из панели', async () => {
    fs.cpSync(path.join(ROOT, 'plugins', 'example-generator'), path.join(plugins, 'example-generator'), { recursive: true });
    await page.getByRole('button', { name: 'Плагины', exact: true }).click();
    await page.getByRole('button', { name: 'Перезагрузить' }).click();
    await page.waitForSelector('.plugin-card:has-text("генератор имён").state-needs-approval');
    await page.locator('.plugin-card:has-text("генератор имён")').getByRole('button', { name: 'Разрешить и включить' }).click(); await page.waitForSelector('.plugin-card:has-text("генератор имён").state-active');
    await page.getByRole('button', { name: 'Студия', exact: true }).click();
    await page.locator('.ws-inspector .ws-bottom-tabs button', { hasText: 'Имена' }).click();
    const frame = await (async () => { for (let i = 0; i < 40; i++) { const f = page.frames().find((x) => x.url().startsWith('rolepi-plugin://example-generator/')); if (f) return f; await new Promise((r) => setTimeout(r, 250)); } throw new Error('рамка панели не открылась'); })();
    await frame.waitForSelector('#target:has-text("ампани")', { timeout: 10000 });
    const iso = await frame.evaluate(async () => {
      const r = {};
      try { await fetch('https://example.com'); r.fetch = 'ok'; } catch (e) { r.fetch = 'blocked'; }
      try { r.parent = window.parent.document.title; } catch (e) { r.parent = 'blocked'; }
      try { r.ls = String(localStorage.length); } catch (e) { r.ls = 'blocked'; }
      r.rpi = typeof window.rpi; r.require = typeof window.require; r.process = typeof window.process;
      return r;
    });
    if (iso.fetch !== 'blocked' || iso.parent !== 'blocked' || iso.ls !== 'blocked' || iso.rpi !== 'undefined' || iso.require !== 'undefined' || iso.process !== 'undefined') throw new Error('рамка не изолирована: ' + JSON.stringify(iso));
    await frame.click('#gen');
    await frame.locator('#results li button').first().click();
    await frame.waitForSelector('#msg:has-text("Готово")');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await page.waitForSelector('.ws-status >> text=Сохранено', { timeout: 6000 });
    const cam = fs.readdirSync(path.join(tmp, 'data', 'campaigns'));
    if (JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'campaigns', cam[0]), 'utf8')).notes.length + JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'campaigns', cam[0]), 'utf8')).entities.length < 1) throw new Error('ничего не создано');
  });
  await step('правка файлов панели после согласия сбрасывает согласие', async () => {
    fs.appendFileSync(path.join(plugins, 'example-generator', 'panel', 'names.js'), '\n// изменено\n');
    await page.getByRole('button', { name: 'Плагины', exact: true }).click();
    await page.getByRole('button', { name: 'Перезагрузить' }).click();
    await page.waitForSelector('.plugin-card:has-text("генератор имён").state-needs-approval');
  });
  await step('звук: файл из папки появляется сам, играет, перематывается; чужие пути закрыты', async () => {
    const wav = (() => { const n = 16000, b = Buffer.alloc(44 + n, 128); b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); return b; })();
    fs.mkdirSync(path.join(tmp, 'data', 'audio', 'music', 'Бой'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'data', 'audio', 'music', 'Бой', 'тест.wav'), wav);
    fs.writeFileSync(path.join(tmp, 'secret.wav'), wav);
    await page.getByRole('button', { name: 'Звук', exact: true }).click();
    await page.waitForSelector('.audio-row >> text=тест', { timeout: 10000 }); // обновляется слежением за папкой или при возврате в окно
    await page.getByRole('button', { name: 'Играть: тест' }).click();
    await page.waitForSelector('.mini-player >> text=тест', { timeout: 10000 });
    await page.waitForSelector('.audio-player button[aria-label="Пауза"]');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.setBypassCSP', { enabled: true });
    await page.reload(); await page.waitForSelector('.ws-header');
    const r = await page.evaluate(async () => {
      const get = async (u, h) => { const x = await fetch(u, { headers: h }); return { status: x.status, len: (await x.arrayBuffer()).byteLength, range: x.headers.get('content-range') }; };
      const base = 'rolepi-audio://music/' + encodeURIComponent('Бой') + '/' + encodeURIComponent('тест.wav');
      return { full: await get(base), part: await get(base, { Range: 'bytes=0-9' }), tail: await get(base, { Range: 'bytes=-4' }), bad: await get(base, { Range: 'bytes=999999-' }),
        up: await get('rolepi-audio://music/..%2F..%2Fsecret.wav'), other: await get('rolepi-audio://evil/x.wav'), notAudio: await get('rolepi-audio://music/_README.txt') };
    });
    if (r.full.status !== 200 || r.full.len !== 16044) throw new Error('полный: ' + JSON.stringify(r.full));
    if (r.part.status !== 206 || r.part.len !== 10 || !/^bytes 0-9\/16044$/.test(r.part.range)) throw new Error('диапазон: ' + JSON.stringify(r.part));
    if (r.tail.status !== 206 || r.tail.len !== 4) throw new Error('хвост: ' + JSON.stringify(r.tail));
    if (r.bad.status !== 416) throw new Error('за пределами: ' + JSON.stringify(r.bad));
    for (const k of ['up', 'other', 'notAudio']) if (r[k].status !== 404) throw new Error(k + ': ' + JSON.stringify(r[k]));
  });
  await step('«О программе»: версия и changelog', async () => { await page.getByRole('button', { name: 'О программе', exact: true }).click(); await page.waitForSelector('text=Версия 0.4.0'); if (!/0\.4\.0/.test(await page.locator('.ws-page pre').innerText())) throw new Error('нет changelog'); });
  if (errors.length) { failed++; console.log('  FAIL ошибки страницы:', errors.join('; ')); }
  await browser.close(); app.kill('SIGTERM');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `\nПровалено: ${failed}` : '\nElectron e2e пройден');
  setTimeout(() => process.exit(failed ? 1 : 0), 400);
})();
