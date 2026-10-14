const fs = require('fs'), path = require('path');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_URL = 'data:image/png;base64,' + PNG;
const oldSystem = { schema: 1, id: 'old', name: 'Старая система', version: '1', entityTypes: [{ id: 'hero', label: 'Герой', category: 'character', fields: [{ id: 'hp', label: 'HP', type: 'number', default: 5 }], cardViews: [{ id: 'v', name: 'Лист', background: { image: PNG_URL }, blocks: [{ id: 'h', kind: 'heading', x: 0, y: 0, w: 12, h: 2 }] }] }] };
const oldCampaign = { schema: 1, id: 'oldc', name: 'Старая кампания', systemId: 'old', notes: [], entities: [{ id: 'e1', typeId: 'hero', name: 'Ариэль', values: { hp: 9 } }] };

module.exports = { name: 'Данные: перенос старого формата, файлы проекта, резервные копии', port: 5704, opts: { locale: 'ru-RU', seed: { systems: { old: oldSystem }, campaigns: { oldc: oldCampaign } } }, scenario: async ({ page, step, btn }) => {
  await step('старые документы переносятся при открытии, с копией и сообщением', async () => {
    await page.waitForSelector('.ws-tree .ws-row', { timeout: 5000 });
    const db = await page.evaluate(() => window.__db);
    if (db.systems.old.schema !== 2 || db.campaigns.oldc.schema !== 2) throw new Error('схема не обновлена');
    if (JSON.stringify(db).includes('data:image')) throw new Error('картинка осталась внутри JSON');
    if (!/asset:[a-f0-9]{64}\.png/.test(db.systems.old.entityTypes[0].cardViews[0].background.image)) throw new Error('нет ссылки на файл');
    const b = await page.evaluate(() => window.__backups.map((x) => x.m.reason)); if (!b.includes('before-migration')) throw new Error('нет копии перед переносом: ' + b);
    const orig = await page.evaluate(() => JSON.stringify(window.__backups[0].data.systems.old)); if (!orig.includes('data:image')) throw new Error('в копии не исходный документ');
    await page.waitForSelector('.toast >> text=нового формата');
  });
  await step('картинка на карточке показывается через адрес файла', async () => {
    await page.locator('.ws-row-main', { hasText: 'Старая система' }).click(); await page.getByRole('tab', { name: 'Карточки' }).click(); await page.waitForSelector('.rpi-card');
    const bg = await page.locator('.rpi-card-bg').evaluate((e) => getComputedStyle(e).backgroundImage); if (!/blob:/.test(bg)) throw new Error('фон: ' + bg);
  });
  await step('загрузка картинки в конструкторе сохраняет файл, а не встраивает в JSON', async () => {
    const file = { name: 'p.png', mimeType: 'image/png', buffer: Buffer.concat([Buffer.from(PNG, 'base64'), Buffer.from([7])]) }; // другие байты — другой файл
    const before = await page.evaluate(() => window.__files.size);
    await page.locator('.ws-inspector input[type=file]').setInputFiles(file);
    await page.waitForFunction((n) => window.__files.size === n + 1, before);
    await page.keyboard.press('Control+s'); await page.waitForSelector('.ws-status >> text=Сохранено');
    const json = JSON.stringify(await page.evaluate(() => window.__db.systems)); if (json.includes('data:image')) throw new Error('data: попал в JSON');
  });
  await step('не-картинка отклоняется с понятным сообщением', async () => {
    let msg = ''; page.once('dialog', (d) => { msg = d.message(); });
    await page.locator('.ws-inspector input[type=file]').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('<svg onload=alert(1)>') });
    await page.waitForTimeout(300); if (!/PNG|JPEG/.test(msg)) throw new Error('сообщение: ' + msg);
  });

  await page.getByRole('button', { name: 'Данные', exact: true }).click(); await page.waitForSelector('.data-row');
  await step('страница «Данные» показывает копии и файлы', async () => {
    if ((await page.locator('.data-row').count()) < 1) throw new Error('нет копий'); await page.waitForSelector('text=Картинок: ');
  });
  await step('ручная копия с пометкой', async () => { await page.getByLabel('Пометка к копии (необязательно)').fill('до экспериментов'); await btn('Создать копию сейчас').click(); await page.waitForSelector('.data-row >> text=до экспериментов'); });
  await step('удаление системы и восстановление из копии возвращает её (и можно отменить)', async () => {
    await page.getByRole('button', { name: 'Студия', exact: true }).click();
    await page.getByLabel(/Удалить: Старая система/).click({ force: true }); await page.keyboard.press('Control+s'); await page.waitForSelector('.ws-status >> text=Сохранено');
    if (await page.evaluate(() => 'old' in window.__db.systems)) throw new Error('система не удалена');
    await page.getByRole('button', { name: 'Данные', exact: true }).click(); await page.waitForSelector('.data-row');
    await page.locator('.data-row', { hasText: 'до экспериментов' }).getByRole('button', { name: 'Восстановить' }).click();
    await page.waitForSelector('.toast >> text=Копия восстановлена');
    await page.getByRole('button', { name: 'Студия', exact: true }).click();
    await page.waitForSelector('.ws-row-main >> text=Старая система', { timeout: 5000 });
    const safety = await page.evaluate(() => window.__backups.some((b) => b.m.reason === 'before-restore')); if (!safety) throw new Error('нет страховой копии');
  });
  await step('очистка удаляет лишние файлы и не трогает используемые', async () => {
    const extra = await page.evaluate(async () => { const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]); const r = await window.rpi.assets.put(png); return r.id; });
    await page.getByRole('button', { name: 'Данные', exact: true }).click(); await btn('Очистить неиспользуемые файлы').click();
    await page.waitForSelector('.toast >> text=Удалено файлов');
    const state = await page.evaluate((extraId) => {
      const refs = [...JSON.stringify([window.__db, window.__backups.map((b) => b.data)]).matchAll(/asset:([a-f0-9]{64}\.[a-z]+)/g)].map((m) => m[1]);
      return { extraGone: !window.__files.has(extraId), usedKept: refs.every((r) => window.__files.has(r)), refs: refs.length };
    }, extra);
    if (!state.extraGone) throw new Error('лишний файл остался');
    if (!state.usedKept || !state.refs) throw new Error('удалён используемый файл');
  });
} };
