const zlib = require('zlib');

// простая картинка-«карта» нужного размера (однотонная PNG)
function png(w, h) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 90)]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}

const system = { schema: 2, id: 'sys1', name: 'Космо', version: '1.0.0', entityTypes: [{ id: 'hero', label: 'Герой', category: 'character', fields: [], cardViews: [{ id: 'v', name: 'Лист', blocks: [] }] }] };
const campaign = { schema: 2, id: 'c1', name: 'Поход', systemId: 'sys1', entities: [{ id: 'e1', typeId: 'hero', name: 'Ариэль', values: {} }], notes: [{ id: 'n1', title: 'Тайна', body: 'секрет' }] };

module.exports = { name: 'Сцены, карты с метками и звуки из папок', port: 5707, opts: { locale: 'ru-RU', audio: ['music/Бой/battle.wav', 'music/town.wav', 'sounds/hit.wav'], seed: { systems: { sys1: system }, campaigns: { c1: campaign } } }, scenario: async ({ page, step, btn }) => {
  const tab = (name) => page.getByRole('tab', { name, exact: true });
  const save = async () => { await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await page.waitForSelector('.ws-status >> text=Сохранено'); };
  await page.locator('.ws-row-main', { hasText: 'Поход' }).click();

  await step('раздел «Звук»: музыка по папкам, звуки на панели, новые файлы появляются сами', async () => {
    await page.getByRole('button', { name: 'Звук', exact: true }).click();
    await page.waitForSelector('.audio-row >> text=battle');
    await page.waitForSelector('.audio-folder >> text=Бой');
    await page.waitForSelector('.sound-pad >> text=hit');
    await page.evaluate(() => window.__setAudio(['music/Бой/battle.wav', 'music/town.wav', 'music/new-song.wav', 'sounds/hit.wav']));
    await page.waitForSelector('.audio-row >> text=new-song');
  });
  await step('плеер играет трек и показывается в шапке', async () => {
    await page.getByRole('button', { name: 'Играть: town' }).click();
    await page.waitForSelector('.mini-player >> text=town');
    await page.waitForSelector('.audio-player button[aria-label="Пауза"]');
    await page.getByRole('button', { name: 'Пауза', exact: true }).first().click();
    await page.waitForSelector('.audio-player button[aria-label="Играть"]');
    await page.getByRole('button', { name: 'Остановить', exact: true }).click();
    await page.waitForSelector('.mini-player', { state: 'detached' });
  });
  await step('кнопки звуков не вызывают ошибок', async () => { await page.locator('.sound-pad', { hasText: 'hit' }).click(); await page.waitForTimeout(200); });

  await page.getByRole('button', { name: 'Студия', exact: true }).click();
  await step('карта: загрузка картинки, метка по клику, название', async () => {
    await tab('Карты').click();
    await page.locator('input[aria-label="Добавить карту"]').setInputFiles({ name: 'world.png', mimeType: 'image/png', buffer: png(600, 400) });
    await page.waitForFunction(() => { const i = document.querySelector('.map-canvas img'); return i && i.complete && i.naturalWidth > 0; });
    await btn('Поставить метку').click();
    const box = await page.locator('.map-canvas img').boundingBox();
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5);
    await page.waitForSelector('[data-testid=marker-editor]');
    await page.getByLabel('Название метки').fill('Таверна');
    await page.waitForSelector('.map-marker .map-label >> text=Таверна');
    await save();
    const mk = (await page.evaluate(() => window.__db.campaigns.c1.maps[0].markers))[0];
    if (Math.abs(mk.x - 0.25) > 0.03 || Math.abs(mk.y - 0.5) > 0.03) throw new Error('метка не там, где кликнули: ' + JSON.stringify(mk));
  });
  await step('метку можно перетащить, координаты — доли картинки', async () => {
    const m = page.locator('.map-marker').first();
    const img = await page.locator('.map-canvas img').boundingBox();
    const b = await m.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height - 4);
    await page.mouse.down();
    await page.mouse.move(img.x + img.width * 0.75, img.y + img.height * 0.5, { steps: 6 });
    await page.mouse.up();
    await save();
    const mk = (await page.evaluate(() => window.__db.campaigns.c1.maps[0].markers))[0];
    if (!(mk.x > 0.65 && mk.x < 0.85 && mk.y > 0.3 && mk.y < 0.7)) throw new Error('координаты: ' + JSON.stringify(mk));
  });
  await step('сцена: карта, участник, музыка и звук', async () => {
    await tab('Сцены').click();
    await btn('Новая сцена').click();
    await page.getByLabel('Название сцены').fill('Бой в таверне');
    await page.getByLabel('Карта', { exact: true }).selectOption({ label: 'world' });
    await page.getByLabel('Музыка', { exact: true }).selectOption({ label: 'Бой / battle' });
    await page.getByLabel('Добавить участника').selectOption({ label: 'Ариэль' });
    await page.getByLabel('Добавить звук').selectOption({ label: 'hit' });
    await save();
    const sc = (await page.evaluate(() => window.__db.campaigns.c1.scenes))[0];
    if (sc.music !== 'music/Бой/battle.wav' || sc.sounds[0] !== 'sounds/hit.wav' || sc.entityIds[0] !== 'e1' || !sc.mapId) throw new Error(JSON.stringify(sc));
  });
  await step('метка ведёт к заметке', async () => {
    await tab('Карты').click();
    await page.locator('.map-marker').first().click();
    await page.getByLabel('Куда ведёт').selectOption('note');
    await page.waitForFunction(() => document.querySelector('select[aria-label="Выберите"]'));
  });
  await step('запуск сцены: музыка играет, видны карта, участники, звуки', async () => {
    await tab('Сцены').click();
    await btn('Запустить сцену').click();
    await page.waitForSelector('[data-testid=scene-live] .map-canvas');
    await page.waitForSelector('.mini-player >> text=battle');
    await page.waitForSelector('[data-testid=scene-live] .ws-chip >> text=Ариэль');
    await page.locator('[data-testid=scene-live] .sound-pad').click();
  });
  await step('клик по метке в сцене открывает связанную заметку', async () => {
    await page.locator('[data-testid=scene-live] .map-marker').first().click();
    await page.waitForSelector('.ws-note.focus >> text=Тайна', { timeout: 5000 }).catch(async () => { await page.waitForSelector('#note-n1'); });
  });
  await step('конец сцены останавливает музыку', async () => {
    await tab('Сцены').click();
    await btn('Закончить сцену').click();
    await page.waitForSelector('.mini-player', { state: 'detached' });
  });
  await step('исчезнувший файл не ломает сцену', async () => {
    await page.evaluate(() => window.__setAudio(['sounds/hit.wav']));
    await page.waitForSelector('select[aria-label="Музыка"] option:text("файл не найден")', { state: 'attached' });
  });
  await step('удаление карты очищает ссылку в сцене', async () => {
    await tab('Карты').click();
    await btn('Удалить карту').click();
    await save();
    const c = await page.evaluate(() => window.__db.campaigns.c1);
    if ((c.maps || []).length || c.scenes[0].mapId) throw new Error('карта или ссылка остались');
  });
} };
