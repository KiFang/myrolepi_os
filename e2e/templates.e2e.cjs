module.exports = { name: 'Шаблоны, готовые параметры, бестиарий', port: 5708, opts: { locale: 'ru-RU' }, scenario: async ({ page, step, btn }) => {
  const save = async () => { await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await page.waitForSelector('.ws-status >> text=Сохранено'); };
  await step('тип из шаблона «Существо» добавляется с параметрами и карточкой', async () => {
    await btn('Новая система').click();
    await page.getByRole('button', { name: 'Из шаблона' }).click();
    await page.locator('.template-row', { hasText: 'Существо' }).click();
    await page.locator('.ws-type-tabs button', { hasText: 'Существо' }).waitFor();
    await page.waitForSelector('.ws-table td button >> text=Здоровье');
    const sys = Object.values(await page.evaluate(() => ({})))[0]; void sys;
  });
  await step('готовые параметры: отмеченные добавляются в таблицу и на карточку, повторно не дублируются', async () => {
    await page.getByRole('button', { name: 'Готовые параметры' }).click();
    await page.locator('.preset-row', { hasText: 'Мана с максимумом' }).locator('input').check();
    await page.getByRole('button', { name: /Добавить выбранные \(1\)/ }).click();
    await page.waitForSelector('.ws-table td button >> text=Мана');
    await page.waitForSelector('.toast >> text=Добавлено параметров: 2');
    await page.getByRole('button', { name: 'Готовые параметры' }).click();
    await page.locator('.preset-row.done', { hasText: 'Мана с максимумом' }).waitFor();
    await page.keyboard.press('Escape');
  });
  await step('бестиарий: заготовка создаётся и сохраняется в системе', async () => {
    await page.getByRole('tab', { name: 'Бестиарий' }).click();
    await page.getByRole('button', { name: 'Добавить заготовку' }).click();
    await page.getByLabel('Название заготовки').fill('Волк');
    await page.waitForSelector('.rpi-card');
    await save();
    const sys = Object.values(await page.evaluate(() => window.__db.systems))[0];
    if (!sys.bestiary || sys.bestiary[0].name !== 'Волк' || sys.bestiary[0].typeId !== sys.entityTypes[1].id && sys.bestiary[0].typeId !== 'creature') throw new Error(JSON.stringify(sys.bestiary));
  });
  await step('кампания: герой добавляется «Из бестиария» копией заготовки', async () => {
    await btn('Новая кампания').click();
    await page.getByLabel('Из бестиария…').selectOption({ label: 'Волк' });
    await page.waitForSelector('.ws-entities button >> text=Волк');
    await save();
    const c = Object.values(await page.evaluate(() => window.__db.campaigns))[0];
    if (c.entities.length !== 1 || c.entities[0].name !== 'Волк') throw new Error(JSON.stringify(c.entities));
  });
  await step('шаблоны дают систему без проблем в правилах', async () => {
    // созданные из шаблонов и готовых параметров типы не вызывают ошибок в проверке правил
    const text = await page.locator('.ws-diagnostics').innerText();
    if (/Ошибок: [1-9]/.test(text)) throw new Error(text);
  });
} };
