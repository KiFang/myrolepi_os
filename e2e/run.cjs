// Запуск: npm run build && npm run e2e   (нужен Chromium; путь — переменной CHROME_PATH)
const { run } = require('./harness.cjs');
(async () => {
  const only = process.argv[2];
  let failed = 0;
  for (const f of ['studio', 'plugins', 'shell']) {
    if (only && only !== f) continue;
    const s = require(`./${f}.e2e.cjs`);
    failed += await run(s.name, s.port, s.opts, s.scenario);
  }
  console.log(failed ? `\nПровалено проверок: ${failed}` : '\nВсе e2e-проверки пройдены');
  process.exit(failed ? 1 : 0);
})();
