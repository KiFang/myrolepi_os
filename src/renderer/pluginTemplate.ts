import guideRu from "../../docs/AI_PLUGIN_GUIDE.md?raw";
import guideEn from "../../docs/AI_PLUGIN_GUIDE.en.md?raw";

/** Шаблон нового плагина: рабочий пример с функцией формул, пресетом кубиков и командой. */
export function pluginTemplate(id: string, name: string, lang: string): Record<string, string> {
  const ru = lang === "ru";
  const manifest = {
    id,
    name: { ru: name, en: name },
    version: "0.1.0",
    apiVersion: 1,
    description: { ru: "Описание плагина", en: "Plugin description" },
    author: "",
    minAppVersion: "0.1.0",
    main: "index.js",
    permissions: ["formulas", "dice", "commands"],
  };
  const code = `// ${ru ? "Плагин" : "Plugin"} «${name}»
// ${ru ? "Подробности и все возможности: docs/AI_PLUGIN_GUIDE.md" : "Details and every capability: docs/AI_PLUGIN_GUIDE.en.md"}
module.exports = {
  activate(host) {
    // ${ru ? "1. Своя функция для формул: percent(40) вернёт true с шансом 40%" : "1. A formula function: percent(40) returns true with a 40% chance"}
    host.registerFormulaFunction('percent', (args, ctx) => ctx.rng() * 100 < Number(args[0]), {
      description: { ru: 'Истина с заданным шансом в процентах', en: 'True with the given chance in percent' },
      example: 'percent(40)',
    });

    // ${ru ? "2. Пресет на странице «Кубики»" : "2. A preset on the Dice page"}
    host.registerDicePreset({ label: { ru: 'Атака +5', en: 'Attack +5' }, formula: '1d20 + 5' });

    // ${ru ? "3. Команда в палитре (Ctrl+K)" : "3. A command in the palette (Ctrl+K)"}
    host.registerCommand({
      id: 'quick-roll',
      title: { ru: 'Быстрый бросок d20', en: 'Quick d20 roll' },
      keywords: ['d20', 'roll'],
      run(ctx) { ctx.notify(ctx.roll('1d20').text); },
    });
  },
};
`;
  return { "plugin.json": JSON.stringify(manifest, null, 2) + "\n", "index.js": code };
}

/** Запрос для нейросети: инструкция (на языке интерфейса) + пожелание пользователя. */
export function aiPrompt(idea: string, lang: string): string {
  const ru = lang === "ru";
  const guide = ru ? guideRu : guideEn;
  const task = idea.trim() || (ru ? "(опишите здесь, какой плагин нужен)" : "(describe the plugin you want here)");
  return ru
    ? `Ниже — инструкция по созданию плагинов для приложения Rolepi. Прочитай её полностью и выполни задачу в конце.\n\n=== ИНСТРУКЦИЯ ===\n${guide}\n=== КОНЕЦ ИНСТРУКЦИИ ===\n\nЗАДАЧА: ${task}\n\nОтветь двумя блоками кода: plugin.json и index.js. Перед ними — одно предложение о том, что делает плагин.`
    : `Below is the guide for writing plugins for the Rolepi app. Read it fully and then do the task at the end.\n\n=== GUIDE ===\n${guide}\n=== END OF GUIDE ===\n\nTASK: ${task}\n\nAnswer with two code blocks: plugin.json and index.js. Put one sentence before them saying what the plugin does.`;
}
