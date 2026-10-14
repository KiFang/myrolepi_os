module.exports = { name: 'Простой режим и советы', port: 5709, opts: { locale: 'ru-RU' }, scenario: async ({ page, step, btn }) => {
  const nav = (name) => page.locator('.ws-menu').getByRole('button', { name, exact: true });
  const hidden = async (name) => (await nav(name).count()) === 0;
  await step('приветствие предлагает простой режим; включение убирает технические разделы', async () => {
    await page.waitForSelector('[data-testid=simple-hint]');
    for (const n of ['Формулы', 'Плагины', 'Данные']) if (await hidden(n)) throw new Error('раздел скрыт заранее: ' + n);
    await btn('Включить простой режим').click();
    await page.waitForSelector('[data-testid=simple-hint]', { state: 'detached' });
    for (const n of ['Формулы', 'Плагины', 'Данные']) if (!(await hidden(n))) throw new Error('раздел остался: ' + n);
    await nav('Студия').waitFor(); await nav('Звук').waitFor();
  });
  await step('режим запоминается между запусками', async () => {
    await page.reload(); await page.waitForSelector('.ws-header');
    if (!(await hidden('Плагины'))) throw new Error('режим не сохранился');
    if ((await page.locator('[data-testid=simple-hint]').count()) !== 0) throw new Error('подсказка вернулась');
  });
  await step('в редакторе системы нет формул, имён в формулах и действий', async () => {
    await btn('Новая система').click();
    await page.getByRole('button', { name: 'Из шаблона' }).click();
    await page.locator('.template-row', { hasText: 'Персонаж' }).click();
    await page.waitForSelector('.ws-table');
    if ((await page.locator('.ws-table th', { hasText: 'Формула' }).count()) !== 0) throw new Error('столбец формулы виден');
    if ((await page.getByRole('tab', { name: 'Действия' }).count()) !== 0) throw new Error('вкладка действий видна');
    await page.locator('.ws-table td button', { hasText: 'Уровень' }).click();
    if ((await page.getByLabel('Имя в формулах').count()) !== 0) throw new Error('имя в формулах видно');
    if ((await page.getByLabel('Значение по умолчанию').count()) !== 1) throw new Error('нет простого поля значения');
  });
  await step('инициатива выбирается из списка и записывается формулой', async () => {
    await page.getByLabel('Инициатива', { exact: true }).selectOption({ label: 'd20 + Ловкость' });
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await page.waitForSelector('.ws-status >> text=Сохранено');
    const sys = Object.values(await page.evaluate(() => window.__db.systems))[0];
    if (sys.entityTypes[sys.entityTypes.length - 1].initiative !== '1d20 + dex') throw new Error(JSON.stringify(sys.entityTypes.map((t) => t.initiative)));
  });
  await step('совет показывается по месту, закрывается и сменяется следующим', async () => {
    const first = await page.locator('.tip-bar').getAttribute('data-tip');
    await page.locator('.tip-bar').getByRole('button', { name: 'Понятно' }).click();
    const next = await page.locator('.tip-bar').getAttribute('data-tip').catch(() => null);
    if (next === first) throw new Error('совет не сменился');
  });
  await step('«Больше не показывать советы» убирает их везде', async () => {
    await page.getByRole('tab', { name: 'Карточки' }).click();
    await page.waitForSelector('.tip-bar');
    await page.getByRole('button', { name: 'Больше не показывать советы' }).click();
    if ((await page.locator('.tip-bar').count()) !== 0) throw new Error('совет остался');
  });
  await step('справка возвращает советы', async () => {
    await page.getByRole('button', { name: 'Справка', exact: true }).click();
    await page.getByRole('button', { name: 'Показать советы снова' }).click();
    await page.getByRole('button', { name: 'Студия', exact: true }).click();
    await page.waitForSelector('.tip-bar');
  });
  await step('выключение простого режима возвращает всё', async () => {
    await page.locator('.ws-simple-toggle').click();
    for (const n of ['Формулы', 'Плагины', 'Данные']) await nav(n).waitFor();
    await page.getByRole('tab', { name: 'Действия' }).waitFor();
    await page.getByRole('tab', { name: 'Параметры' }).click();
    await page.locator('.ws-table th', { hasText: 'Формула' }).waitFor();
  });
} };
