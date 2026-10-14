const ALLOWED_TAGS = new Set(["B", "I", "U", "EM", "STRONG", "SPAN", "DIV", "P", "BR", "UL", "OL", "LI", "SMALL", "H1", "H2", "H3", "H4", "HR", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "CODE"]);
const DROP_WITH_CONTENT = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "SVG", "MATH", "TEMPLATE", "NOSCRIPT"]);
const ALLOWED_ATTRS = new Set(["class", "title"]);

/**
 * Очищает HTML от плагинов блоков карточек: остаются только безопасные теги и атрибуты class/title.
 * Скрипты, обработчики событий, ссылки, картинки и стили вырезаются. Разбор идёт в инертном
 * <template>: скрипты не выполняются и картинки не загружаются даже до очистки.
 */
export function sanitizeHtml(html: string): string {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const clean = (parent: ParentNode) => {
    for (const child of [...parent.children]) {
      const tag = child.tagName.toUpperCase();
      if (!ALLOWED_TAGS.has(tag)) {
        // опасные контейнеры убираем целиком, остальные — оставляем только текст
        if (DROP_WITH_CONTENT.has(tag)) child.remove();
        else child.replaceWith(document.createTextNode(child.textContent ?? ""));
        continue;
      }
      for (const attr of [...child.attributes]) if (!ALLOWED_ATTRS.has(attr.name.toLowerCase())) child.removeAttribute(attr.name);
      clean(child);
    }
  };
  clean(tpl.content);
  return tpl.innerHTML;
}
