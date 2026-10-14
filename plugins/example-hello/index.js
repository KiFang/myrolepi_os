// Пример плагина: функция формул percent(шанс) с настройкой и счётчиком использований.
module.exports = {
  activate(host) {
    host.registerFormulaFunction('percent', (args, ctx) => {
      const chance = Number(args[0]) + Number(host.settings.get('bonus') || 0);
      host.storage.set('uses', Number(host.storage.get('uses') || 0) + 1); // личное хранилище плагина
      return ctx.rng() * 100 < chance;
    }, {
      description: { ru: 'Истина с заданным шансом в процентах (плюс настройка «Бонус к шансу»)', en: 'True with the given chance in percent (plus the "Chance bonus" setting)' },
      example: 'percent(40)',
    });
    host.registerLocale('en', { 'example.hello': 'Hello from plugin' });
    host.log('loaded');
  },
};
