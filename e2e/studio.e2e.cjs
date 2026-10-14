module.exports = { name: 'Студия: система → карточки → действия → кампания → бой', port: 5701, opts: { locale: 'ru-RU' }, scenario: async ({ page, step, btn }) => {
  await page.waitForSelector('.ws-welcome');
  await btn('Посмотреть пример').click(); await page.waitForSelector('.ws-table');
  await step('пример содержит 4 типа', async () => { const n = await page.locator('.ws-type-tabs button').count(); if (n !== 4) throw new Error('types=' + n); });

  await step('конструктор: блоки на карточке', async () => { await page.getByRole('tab', { name: 'Карточки' }).click(); await page.waitForSelector('.rpi-card'); if ((await page.locator('.rpi-block').count()) < 8) throw new Error('мало блоков'); });
  await step('перетаскивание блока — один шаг отмены', async () => {
    await page.locator('.ws-block-overlay').nth(2).click();
    const x0 = await page.locator('.ws-inspector').getByLabel('Столбец').inputValue();
    const box = await page.locator('.ws-block-overlay.selected').boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down(); await page.mouse.move(box.x + 100, box.y + 60, { steps: 6 }); await page.mouse.up();
    const x1 = await page.locator('.ws-inspector').getByLabel('Столбец').inputValue();
    if (x0 === x1) throw new Error('не сдвинулся');
    await btn('Отменить').click();
    if ((await page.locator('.ws-inspector').getByLabel('Столбец').inputValue()) !== x0) throw new Error('отмена не вернула позицию');
  });
  await step('новый вид карточки с темой и блоками', async () => { await btn('Новый вид').click(); await page.getByLabel('Оформление').selectOption('parchment'); await btn('Заголовок').click(); await btn('Шкала').click(); });

  await step('действия: 4 штуки, ошибка формулы подсвечивается', async () => {
    await page.getByRole('tab', { name: 'Действия' }).click(); await page.waitForSelector('.ws-action');
    if ((await page.locator('.ws-action').count()) !== 4) throw new Error('actions');
    const f = page.locator('.ws-action').first().getByLabel('Формула броска'); await f.fill('1d20 +'); await page.waitForSelector('.ws-action .err'); await f.fill('1d20 + level + mod(str)');
  });

  await step('переименование параметра обновляет всё одним шагом (и отменяется)', async () => {
    await page.getByRole('tab', { name: 'Параметры' }).click();
    await page.locator('.ws-table tbody tr', { hasText: 'level' }).first().click();
    // переименовываем «str» → «power» (параметр «Сила»)
    await page.locator('.ws-table tbody tr', { hasText: 'str' }).first().click();
    const id = page.getByLabel('Имя в формулах'); await id.fill('power'); await id.press('Enter');
    await page.waitForSelector('.ws-table small:text-is("power")');
    const row = await page.locator('.ws-table tbody tr', { hasText: 'max_hp' }).first().innerText(); if (!/mod\(power\)/.test(row)) throw new Error('формула не обновилась: ' + row);
    await btn('Отменить').click();
    await page.waitForSelector('.ws-table small:text-is("str")');
    await btn('Повторить').click(); await page.waitForSelector('.ws-table small:text-is("power")');
  });
  await step('занятое имя отклоняется', async () => { await page.locator('.ws-table tbody tr', { hasText: 'power' }).first().click(); const id = page.getByLabel('Имя в формулах'); await id.fill('level'); await id.press('Enter'); await page.waitForSelector('text=уже занято'); await id.press('Escape'); });

  await btn('Новая кампания').click();
  await step('герой и существо', async () => { await btn('Добавить').click(); await page.getByLabel('Что добавить').selectOption({ label: 'Космическое существо' }); await btn('Добавить').click(); if ((await page.locator('.ws-entities button').count()) !== 2) throw new Error('heroes'); });
  await step('бросок действия попадает в журнал', async () => { await page.locator('.ws-entities button').first().click(); await btn('Атака').click(); await page.waitForSelector('.ws-roll'); });
  await step('эффект: урон 5 и «Применить» → карточка показывает 3 / 12', async () => {
    await btn('Получить урон').click(); await page.getByLabel('Сколько урона').fill('5'); await page.locator('.ws-actionbar').getByRole('button', { name: 'Бросить' }).click();
    await page.locator('.ws-roll >> button', { hasText: 'Применить' }).first().click();
    await page.getByRole('button', { name: 'Карточка', exact: true }).last().click(); await page.waitForSelector('.ws-card-solo .rpi-card');
    if (!/3 \/ 12/.test(await page.locator('.ws-card-solo').innerText())) throw new Error('hp');
  });
  await step('галерея и бестиарий', async () => { await page.getByRole('tab', { name: 'Карточки' }).click(); await page.waitForSelector('.ws-gallery .rpi-card'); await page.locator('select[aria-label="Показать"]').selectOption('creature'); if ((await page.locator('.ws-gallery .rpi-card').count()) !== 1) throw new Error('filter'); });
  await step('бой: инициатива, ходы, раунд, урон не уходит ниже нуля', async () => {
    await page.getByRole('tab', { name: 'Бой' }).click(); await btn('Новый бой').first().click(); await btn('Добавить всех').click();
    await page.getByLabel('Инициатива: Персонаж 1').fill('30'); await page.getByLabel('Инициатива: Космическое существо 1').fill('10');
    await btn('Следующий ход').click(); await page.waitForSelector('.ws-combatant:nth-child(2).active'); await btn('Следующий ход').click();
    if ((await page.locator('.ws-round strong').innerText()) !== '2') throw new Error('round');
    const first = page.locator('.ws-combatant').first(); await first.getByLabel('Сколько').fill('999'); await first.getByLabel('Урон').click();
    if (!/HP: 0/.test(await first.innerText())) throw new Error('hp: ' + (await first.innerText()).replace(/\n/g, '|'));
  });
  await step('заметки: связь и поиск', async () => { await page.getByRole('tab', { name: 'Заметки' }).click(); await btn('Добавить заметку').click(); await page.getByLabel('Связать с…').selectOption({ index: 1 }); await page.waitForSelector('.ws-chip'); await page.getByLabel('Поиск по заметкам').fill('zzzz'); await page.waitForSelector('text=Ничего не найдено'); });
  await step('сохранение пишет систему, кампанию и бой', async () => { await page.keyboard.press('Control+s'); await page.waitForSelector('.ws-status >> text=Сохранено'); const db = await page.evaluate(() => window.__db); const c = Object.values(db.campaigns)[0]; if (!c.encounters || c.encounters.length !== 1) throw new Error('encounters'); if (!JSON.stringify(Object.values(db.systems)[0]).includes('"power"')) throw new Error('rename not saved'); });
  await step('импорт/экспорт: скачанный файл читается обратно', async () => {
    const fs = require('fs'), os = require('os'), path = require('path');
    await page.getByRole('button', { name: /Сохранить в файл/ }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Сохранить файл' }).click()]);
    const file = path.join(os.tmpdir(), 'rolepi-e2e-export.rolepi'); fs.copyFileSync(await dl.path(), file);
    await page.locator('input[type=file][hidden]').setInputFiles(file); await page.waitForSelector('.ws-status >> text=добавлен');
    fs.writeFileSync(file, '{"hello":1}'); await page.locator('input[type=file][hidden]').setInputFiles(file); await page.waitForSelector('.ws-status >> text=Не получилось прочитать');
  });
} };
