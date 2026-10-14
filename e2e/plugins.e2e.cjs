module.exports = { name: 'Плагины: согласие, возможности, настройки, ИИ-помощник', port: 5702, opts: { locale: 'en-US', plugins: ['example-extras', 'example-hello'] }, scenario: async ({ page, step, btn }) => {
  await page.getByRole('button', { name: 'Plugins', exact: true }).click(); await page.waitForSelector('.plugin-card');
  await step('новые плагины просят разрешение и ничего не делают', async () => {
    const n = await page.locator('.plugin-card.state-needs-approval').count(); if (n !== 2) throw new Error('needs-approval=' + n);
    if ((await page.locator('.ws-theme option', { hasText: 'Sunset' }).count()) !== 0) throw new Error('тема появилась без разрешения');
    await page.waitForSelector('.plugin-consent li');
  });
  await step('разрешение включает плагин; тема доступна и применяется', async () => {
    await page.locator('.plugin-card', { hasText: 'example-extras' }).getByRole('button', { name: 'Allow and enable' }).click();
    await page.waitForSelector('.plugin-card.state-active');
    await page.locator('.ws-theme').selectOption({ label: 'Sunset' });
    const acc = await page.locator('.workspace').evaluate((e) => getComputedStyle(e).getPropertyValue('--accent').trim()); if (acc !== '#ffb067') throw new Error('accent ' + acc);
  });
  await step('разрешение запоминается между перезагрузками', async () => { await btn('Reload').click(); await page.waitForSelector('.plugin-card.state-active'); const st = await page.evaluate(() => window.__db.app.plugins); if (!st.approved['example-extras']) throw new Error('не сохранено'); });
  await step('функция плагина и настройка работают', async () => {
    await page.locator('.plugin-card', { hasText: 'example-hello' }).getByRole('button', { name: 'Allow and enable' }).click();
    await page.waitForSelector('.plugin-card.state-active >> text=Chance bonus');
    await page.getByLabel('Chance bonus').fill('50'); await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Formulas', exact: true }).click();
    await page.locator('textarea').first().fill('percent(60) ? 1 : 0'); // 60+50 = 110% → всегда
    await page.waitForSelector('.card .big >> text=1');
    const saved = await page.evaluate(() => window.__db['plugin-data']['example-hello'].settings.bonus); if (saved !== 50) throw new Error('настройка не сохранена: ' + saved);
  });
  await step('пресет плагина на странице «Dice»', async () => { await page.getByRole('button', { name: 'Dice', exact: true }).click(); await page.waitForSelector('.chip.plugin >> text=Attack +5'); });
  await step('команда плагина в палитре (Ctrl+K) показывает уведомление', async () => {
    await page.keyboard.press('Control+k'); await page.getByPlaceholder(/What to do/).fill('quick d20'); await page.waitForSelector('.palette-item');
    await page.keyboard.press('Enter'); await page.waitForSelector('.toast >> text=1d20 =');
  });
  await step('блок плагина виден в конструкторе и очищается', async () => {
    await page.getByRole('button', { name: 'Studio', exact: true }).click(); await btn('See an example').click(); await page.getByRole('tab', { name: 'Cards' }).click();
    await btn('Power badge').click(); await page.waitForSelector('.power-badge'); if (!/Power level/.test(await page.locator('.power-badge').first().innerText())) throw new Error('render');
  });
  await step('выключение плагина убирает его возможности', async () => {
    await page.getByRole('button', { name: 'Plugins', exact: true }).click();
    await page.locator('.plugin-card', { hasText: 'example-extras' }).getByRole('button', { name: 'Turn off' }).click(); await page.waitForSelector('.plugin-card.state-disabled');
    if ((await page.locator('.ws-theme option', { hasText: 'Sunset' }).count()) !== 0) throw new Error('тема осталась');
  });
  await step('ИИ-помощник: запрос содержит гайд и идею', async () => {
    await page.getByLabel('Make a plugin with an AI').fill('add a crit() function');
    await btn('Copy the prompt').click(); await page.waitForSelector('text=Copied');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    if (!text.includes('add a crit() function') || !text.includes('registerFormulaFunction') || !text.includes('Checklist before answering')) throw new Error('запрос неполный (' + text.length + ' симв.)');
  });
  await step('создание шаблона плагина', async () => {
    await btn('Create a template').click(); await page.getByLabel('Name of the new plugin').fill('Test plugin'); await btn('Create').click(); await page.waitForSelector('text=Template created');
    const s = await page.evaluate(() => window.__scaffolds[0]); if (!s.files['plugin.json'] || !s.files['index.js'].includes('registerFormulaFunction')) throw new Error('шаблон');
  });
} };
