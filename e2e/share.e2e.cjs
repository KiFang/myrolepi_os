const fs = require('fs');
const system = { schema: 2, id: 'sys1', name: 'Космо', version: '1.0.0', entityTypes: [{ id: 'hero', label: 'Герой', category: 'character', fields: [{ id: 'hp', label: 'Здоровье', type: 'number', default: 5 }], cardViews: [{ id: 'v', name: 'Лист', blocks: [] }] }] };

module.exports = { name: 'Обмен: пакет .rolepi, защита подписью, правимая копия', port: 5705, opts: { locale: 'ru-RU', seed: { systems: { sys1: system } } }, scenario: async ({ page, step, btn }) => {
  let file;
  await page.locator('.ws-row-main', { hasText: 'Космо' }).click();
  await step('защищённый экспорт: окно, автор, файл-архив', async () => {
    await page.locator('.ws-export').click();
    await page.getByLabel('Защитить систему', { exact: false }).check();
    await page.getByLabel('Имя автора').fill('Тестер');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Сохранить файл' }).click()]);
    const p = await dl.path(); file = fs.readFileSync(p);
    if (file[0] !== 0x50 || file[1] !== 0x4b) throw new Error('не zip');
    await page.waitForSelector('.toast >> text=Защищённый файл');
  });
  await step('исходная система осталась правимой', async () => {
    const db = await page.evaluate(() => window.__db.systems); if (db.sys1.protection) throw new Error('защита попала в оригинал');
  });
  await step('импорт: система появляется под замком, подпись верна', async () => {
    const tmp = require('path').join(require('os').tmpdir(), 'share-e2e.rolepi'); fs.writeFileSync(tmp, file);
    await page.locator('input[type=file][aria-label="Импорт"]').setInputFiles(tmp);
    await page.waitForSelector('.protect-banner.ok');
    await page.waitForSelector('.ws-lock.valid');
    if (!(await page.locator('.protect-banner').innerText()).includes('Тестер')) throw new Error('нет автора');
  });
  await step('защищённая система не правится', async () => {
    await page.getByRole('button', { name: 'Добавить параметр' }).click();
    await page.waitForSelector('.toast >> text=защищена автором');
    const sys = await page.evaluate(() => Object.values(window.__db.systems).filter((s) => s.protection).length);
    if (sys !== 0) throw new Error('защищённая система записалась до сохранения — проверим ниже');
  });
  await step('правимая копия снимает защиту и помнит источник', async () => {
    await btn('Сделать правимую копию').click();
    await page.waitForSelector('.toast >> text=правимая копия');
    if (await page.locator('.protect-banner').count()) throw new Error('баннер остался');
    await page.keyboard.press('Control+s'); await page.waitForSelector('.ws-status >> text=Сохранено');
    const list = Object.values(await page.evaluate(() => window.__db.systems));
    const copy = list.find((s) => s.meta && s.meta.derivedFrom);
    if (!copy || copy.protection) throw new Error('копия неверна');
  });
  await step('ключ автора виден в разделе «Данные»', async () => {
    await page.getByRole('button', { name: 'Данные', exact: true }).click();
    await page.waitForSelector('[data-testid=author-key] code');
  });
} };
