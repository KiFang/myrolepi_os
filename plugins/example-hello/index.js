// Пример плагина: добавляет функцию формул percent(chance) -> true/false и строку перевода.
module.exports = {
  activate(host) {
    host.registerFormulaFunction('percent', (args, ctx) => ctx.rng() * 100 < Number(args[0]));
    host.registerLocale('en', { 'example.hello': 'Hello from plugin' });
    host.log('loaded');
  },
};
