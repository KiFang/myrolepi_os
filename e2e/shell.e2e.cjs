module.exports = { name: 'Оболочка: палитра, справочник, темы, язык', port: 5703, opts: { locale: 'ru-RU' }, scenario: async ({ page, step, btn }) => {
  await step('шапка помещается в окно минимальной ширины (960 px)', async () => {
    await page.setViewportSize({ width: 960, height: 700 });
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (w.sw > w.cw) throw new Error('горизонтальная прокрутка: ' + w.sw + ' > ' + w.cw);
    await page.setViewportSize({ width: 1500, height: 950 });
  });
  await step('палитра по Ctrl+K: поиск и запуск команды смены темы', async () => {
    await page.keyboard.press('Control+k'); await page.waitForSelector('.palette');
    await page.getByPlaceholder(/Что сделать/).fill('тема лес'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.workspace').dataset.theme === 'forest');
  });
  await step('Esc закрывает палитру', async () => { await page.keyboard.press('Control+k'); await page.waitForSelector('.palette'); await page.keyboard.press('Escape'); await page.waitForSelector('.palette', { state: 'detached' }); });
  await step('команда «Новая система» из палитры работает', async () => { await page.keyboard.press('Control+k'); await page.getByPlaceholder(/Что сделать/).fill('новая система'); await page.keyboard.press('Enter'); await page.waitForSelector('.ws-table, .ws-type-tabs'); });
  await step('светлая тема: активная вкладка читается', async () => {
    await page.locator('.ws-theme').selectOption('daylight');
    const c = await page.locator('.ws-menu button.active').evaluate((e) => getComputedStyle(e).color); if (/rgb\(255, 255, 255\)/.test(c)) throw new Error('белый текст на светлом фоне: ' + c);
  });
  await step('тема запоминается после перезагрузки', async () => { await page.reload(); await page.waitForSelector('.ws-header'); await page.waitForTimeout(200); if ((await page.locator('.workspace').getAttribute('data-theme')) !== 'daylight') throw new Error('тема сбросилась'); });
  await page.getByRole('button', { name: 'Справка', exact: true }).click();
  await step('справочник: 10+ статей и таблица функций', async () => {
    await page.waitForSelector('.help-item'); if ((await page.locator('.help-item').count()) < 10) throw new Error('мало статей');
    await page.locator('.help-item', { hasText: 'Формулы' }).click(); await page.waitForSelector('.help-table code >> text=floor(x)');
  });
  await step('поиск по справочнику', async () => { await page.getByPlaceholder('Поиск по справочнику').fill('инициатива'); await page.waitForSelector('.help-item'); const n = await page.locator('.help-item').count(); if (n < 1 || n > 4) throw new Error('найдено ' + n); await page.getByPlaceholder('Поиск по справочнику').fill('qqqzzz'); await page.waitForSelector('.help-none'); await page.getByPlaceholder('Поиск по справочнику').fill(''); });
  await step('«Попробовать» открывает калькулятор с формулой', async () => { await page.locator('.help-item', { hasText: 'Формулы' }).click(); await page.locator('.help-code .help-try').first().click(); await page.waitForSelector('.ws-page h1 >> text=Калькулятор формул'); if (!(await page.locator('textarea').first().inputValue()).includes('level')) throw new Error('формула не передалась'); });
  await step('кубики: бросок и анимация кубиков', async () => { await page.getByRole('button', { name: 'Кубики', exact: true }).click(); await btn('Бросить').click(); await page.waitForSelector('.ws-page .die'); });
  await step('переключение языка меняет интерфейс и ошибки', async () => { await page.locator('select[aria-label="Язык"]').selectOption('en'); await page.waitForSelector('text=Dice roller'); await page.getByRole('button', { name: 'Formulas', exact: true }).click(); await page.locator('textarea').first().fill('nope + 1'); await page.waitForSelector('text=Unknown variable'); });
  await step('логотип прозрачный (PNG с альфой в углу)', async () => { const fs = require('fs'), path = require('path'); const png = fs.readFileSync(path.join(__dirname, '..', 'docs', 'assets', 'logo.png')); if (png[25] !== 6) throw new Error('цветовой тип PNG ' + png[25] + ' (нужен RGBA=6)'); });
} };
