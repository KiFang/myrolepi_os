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
  await step('«О программе»: версия и changelog', async () => { await page.getByRole('button', { name: 'О программе', exact: true }).click(); await page.waitForSelector('text=Версия 0.2.0'); if (!/0\.2\.0/.test(await page.locator('.ws-page pre').innerText())) throw new Error('нет changelog'); });
  if (errors.length) { failed++; console.log('  FAIL ошибки страницы:', errors.join('; ')); }
  await browser.close(); app.kill('SIGTERM');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `\nПровалено: ${failed}` : '\nElectron e2e пройден');
  setTimeout(() => process.exit(failed ? 1 : 0), 400);
})();
