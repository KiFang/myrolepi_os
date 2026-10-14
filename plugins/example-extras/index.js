// Пример плагина: свой блок карточки («Бейдж») и своя тема оформления («Закат»).
module.exports = {
  activate(host) {
    host.registerBlock({
      kind: 'power-badge',
      label: { ru: 'Бейдж силы', en: 'Power badge' },
      // Возвращаем HTML — он будет очищен (скрипты, ссылки, картинки и стили вырезаются).
      render({ values, lang }) {
        const level = Number(values.level ?? values.threat ?? 1);
        const title = lang === 'ru' ? 'Уровень силы' : 'Power level';
        const stars = '★'.repeat(Math.max(1, Math.min(5, Math.ceil(level / 2))));
        return '<div class="power-badge"><small>' + title + '</small><br><b>' + stars + '</b></div>';
      },
    });
    host.registerDicePreset({ label: { ru: 'Атака +5', en: 'Attack +5' }, formula: '1d20 + 5' });
    host.registerCommand({
      id: 'quick-roll',
      title: { ru: 'Быстрый бросок d20', en: 'Quick d20 roll' },
      keywords: ['d20', 'roll', 'бросок'],
      run(ctx) { ctx.notify(ctx.roll('1d20').text); },
    });
    host.registerTheme({
      id: 'sunset',
      name: { ru: 'Закат', en: 'Sunset' },
      vars: {
        '--sunken': '#150d14', '--bg': '#1b1019', '--panel': '#26151f', '--surface': '#2d1a26', '--panel2': '#3a2230',
        '--border': '#4d2e3f', '--border-strong': '#63405a', '--hover': '#4d3046', '--fg': '#fbe9e0', '--muted': '#c19aa0',
        '--accent': '#ffb067', '--accent-strong': '#e8742a', '--accent-ink': '#2b1405', '--selected': '#4a2a2c',
      },
    });
  },
};
