const fs = require('fs'), os = require('os'), path = require('path');

const system = { schema: 2, id: 'sys1', name: 'Космо', version: '1.0.0', entityTypes: [{ id: 'hero', label: 'Герой', category: 'character', fields: [{ id: 'hp', label: 'Здоровье', type: 'number', default: 5 }], cardViews: [{ id: 'v', name: 'Лист', blocks: [] }] }] };
const campaign = { schema: 2, id: 'c1', name: 'Поход', systemId: 'sys1', entities: [], notes: [] };

// плагин-«шпион»: пытается выйти из песочницы; права только ui
const spy = fs.mkdtempSync(path.join(os.tmpdir(), 'rolepi-spy-'));
fs.writeFileSync(path.join(spy, 'plugin.json'), JSON.stringify({ id: 'spy', name: 'Spy', version: '1.0.0', apiVersion: 1, permissions: ['ui'], panels: [
  { id: 'pg', title: 'Шпион', entry: 'p.html', placement: 'page' },
  { id: 'bt', title: 'Низ', entry: 'p.html', placement: 'bottom' },
] }));
fs.writeFileSync(path.join(spy, 'p.html'), '<!doctype html><meta charset=utf-8><link rel=stylesheet href="@sdk.css"><h2>Spy</h2><pre id=out>wait</pre><script src="@sdk.js"></script><script src="p.js"></script>');
fs.writeFileSync(path.join(spy, 'p.js'), `
(async function () {
  var r = {};
  async function t(name, fn) { try { r[name] = String(await fn()); } catch (e) { r[name] = 'ERR:' + (e && e.name) + ':' + (e && e.message || '').slice(0, 60); } }
  await window.rolepi.ready;
  await t('fetch', function () { return fetch(location.href).then(function (x) { return x.status; }); });
  await t('xhr', function () { return new Promise(function (ok, no) { var x = new XMLHttpRequest(); x.open('GET', location.href); x.onload = function () { ok('loaded'); }; x.onerror = function () { no(new Error('blocked')); }; x.send(); }); });
  await t('parent', function () { return window.parent.document.title; });
  await t('storage', function () { return window.localStorage.length; });
  await t('rpi', function () { return typeof window.rpi; });
  await t('read', function () { return window.rolepi.project.listSystems(); });
  await t('write', function () { return window.rolepi.project.createNote('c1', { title: 'x' }); });
  await t('notify', function () { return window.rolepi.notify('привет из панели'); });
  document.getElementById('out').textContent = JSON.stringify(r);
})();
`);

module.exports = { name: 'Панели плагинов: изоляция, права, генератор', port: 5706, opts: { allowErrors: /Content Security Policy|Blocked a frame|Failed to read a named property|Access to storage/, locale: 'ru-RU', plugins: ['example-generator', spy], seed: { systems: { sys1: system }, campaigns: { c1: campaign } } }, scenario: async ({ page, step, btn }) => {
  await step('панельные плагины ждут согласия и показывают права', async () => {
    await page.getByRole('button', { name: 'Плагины', exact: true }).click();
    await page.waitForSelector('.plugin-card.state-needs-approval');
    const text = await page.locator('.plugin-card', { hasText: 'генератор имён' }).innerText();
    if (!/Читать ваши системы и кампании/.test(text) || !/Создавать заметки/.test(text)) throw new Error('нет описания прав: ' + text.slice(0, 200));
    if (await page.getByRole('button', { name: 'Панели', exact: true }).count()) throw new Error('панели видны до согласия');
    while (await page.getByRole('button', { name: 'Разрешить и включить' }).count()) { await page.getByRole('button', { name: 'Разрешить и включить' }).first().click(); await page.waitForTimeout(300); }
    await page.waitForFunction(() => document.querySelectorAll('.plugin-card.state-active').length === 2);
  });
  await step('страничная панель появляется в меню «Панели»', async () => {
    await page.getByRole('button', { name: 'Панели', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Панели', exact: true }).click();
    await page.waitForSelector('[data-testid=panel-spy-pg] iframe');
  });
  await step('панель не выходит из песочницы: сеть, родитель, хранилище, rpi', async () => {
    const fr = page.frameLocator('[data-testid=panel-spy-pg] iframe');
    await fr.locator('#out:not(:text("wait"))').waitFor({ timeout: 8000 });
    const r = JSON.parse(await fr.locator('#out').innerText());
    if (!/^ERR/.test(r.fetch)) throw new Error('fetch прошёл: ' + r.fetch);
    if (!/^ERR/.test(r.xhr)) throw new Error('xhr прошёл: ' + r.xhr);
    if (!/^ERR:SecurityError/.test(r.parent)) throw new Error('родитель доступен: ' + r.parent);
    if (!/^ERR:SecurityError/.test(r.storage)) throw new Error('localStorage доступен: ' + r.storage);
    if (r.rpi !== 'undefined') throw new Error('виден window.rpi: ' + r.rpi);
  });
  await step('права: без project.* чтение и запись отклоняются, ui.notify работает', async () => {
    const fr = page.frameLocator('[data-testid=panel-spy-pg] iframe');
    const r = JSON.parse(await fr.locator('#out').innerText());
    if (!/Нет права «project.read»/.test(r.read)) throw new Error('read: ' + r.read);
    if (!/Нет права «project.write»/.test(r.write)) throw new Error('write: ' + r.write);
    if (r.notify !== 'true') throw new Error('notify: ' + r.notify);
    await page.waitForSelector('.toast >> text=spy: привет из панели');
  });
  await step('нижняя панель — вкладка рядом с «Проблемы» и «Броски»', async () => {
    await page.getByRole('button', { name: 'Студия', exact: true }).click();
    await page.locator('.ws-bottom-tabs button', { hasText: 'Низ' }).click();
    await page.waitForSelector('[data-testid=panel-spy-bt] iframe');
  });
  await step('генератор имён: панель справа создаёт героя в выбранной кампании', async () => {
    await page.locator('.ws-row-main', { hasText: 'Поход' }).click();
    await page.locator('.ws-inspector .ws-bottom-tabs button', { hasText: 'Имена' }).click();
    const fr = page.frameLocator('[data-testid=panel-example-generator-names] iframe');
    await fr.locator('#target:text("Поход")').waitFor({ timeout: 8000 });
    await fr.locator('#gen').click();
    if ((await fr.locator('#results li').count()) !== 5) throw new Error('нет 5 имён');
    const name = await fr.locator('#results li b').first().innerText();
    await fr.locator('#results li button', { hasText: 'Героя' }).first().click();
    await fr.locator('#msg:text("Готово")').waitFor();
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await page.waitForSelector('.ws-status >> text=Сохранено');
    const c = await page.evaluate(() => window.__db.campaigns.c1);
    if (c.entities.length !== 1 || c.entities[0].name !== name) throw new Error('герой не создан: ' + JSON.stringify(c.entities));
  });
  await step('создание из панели можно отменить кнопкой «Отменить»', async () => {
    await btn('Отменить').click();
    await page.keyboard.press('Control+s').catch(() => {});
    await page.locator('.ws-save-state', { hasText: /Есть несохранённые|Всё сохранено/ }).waitFor();
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click().catch(() => {});
    await page.waitForFunction(() => window.__db.campaigns.c1.entities.length === 0, null, { timeout: 5000 });
  });
  await step('панель получает тему приложения', async () => {
    const fr = page.frameLocator('[data-testid=panel-example-generator-names] iframe');
    const bg = await fr.locator('body').evaluate((e) => getComputedStyle(e).backgroundColor);
    const app = await page.locator('.workspace').evaluate((e) => getComputedStyle(e).getPropertyValue('--panel').trim());
    if (!bg || bg === 'rgba(0, 0, 0, 0)') throw new Error('фон не задан: ' + bg + ' / ' + app);
  });
} };
