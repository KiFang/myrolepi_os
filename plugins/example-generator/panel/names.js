// Панель «Генератор имён». Работает только через window.rolepi (см. docs/AI_PLUGIN_GUIDE.md, раздел «Панели»).
(function () {
  var TEXT = {
    ru: { title: 'Генератор имён', style: 'Стиль', gen: 'Придумать имена', d6: 'Бросить d6', target: 'Куда добавлять', none: 'Выберите кампанию в списке слева — сюда добавится герой или заметка.', type: 'Тип героя', hero: 'Героя', note: 'Заметку', styles: { elf: 'Эльфийские', dwarf: 'Дворфийские', human: 'Человеческие' }, done: 'Готово: ', noType: 'В системе кампании нет типов героев', stored: 'Последний стиль запомнен' },
    en: { title: 'Name generator', style: 'Style', gen: 'Invent names', d6: 'Roll d6', target: 'Add to', none: 'Select a campaign in the list on the left — a character or note will be added to it.', type: 'Character type', hero: 'Character', note: 'Note', styles: { elf: 'Elven', dwarf: 'Dwarven', human: 'Human' }, done: 'Done: ', noType: 'The campaign system has no character types', stored: 'Last style remembered' }
  };
  var PARTS = {
    elf: [['Ae', 'Ela', 'Fae', 'Ily', 'Lia', 'Syl', 'Thal', 'Vae'], ['ri', 'na', 'lo', 'vi', 'the', 'mi', 'la'], ['el', 'wen', 'ion', 'dil', 'ael', 'ris']],
    dwarf: [['Bor', 'Dur', 'Gim', 'Kaz', 'Thor', 'Bal', 'Dwal'], ['in', 'ur', 'gar', 'dun', 'ok'], ['din', 'rim', 'grim', 'dar', 'li']],
    human: [['Al', 'Be', 'Ca', 'Dor', 'Ed', 'Mar', 'Wil'], ['an', 'de', 'ri', 'to', 'la'], ['ric', 'son', 'ton', 'lyn', 'ford']]
  };
  var $ = function (id) { return document.getElementById(id); };
  var L = TEXT.ru, campaign = null, system = null;

  function pick(list, rnd) { return list[Math.floor(rnd() * list.length)]; }
  function makeName(style) {
    var p = PARTS[style], r = Math.random;
    return pick(p[0], r) + pick(p[1], r) + pick(p[2], r);
  }
  function say(text, bad) { var m = $('msg'); m.textContent = text; m.className = bad ? 'err' : 'muted'; }

  function render(names) {
    var ul = $('results'); ul.innerHTML = '';
    names.forEach(function (name) {
      var li = document.createElement('li');
      var b = document.createElement('b'); b.textContent = name;
      var row = document.createElement('span'); row.className = 'row';
      var hero = document.createElement('button'); hero.textContent = '+ ' + L.hero; hero.disabled = !campaign;
      var note = document.createElement('button'); note.textContent = '+ ' + L.note; note.disabled = !campaign;
      hero.onclick = function () { addHero(name); };
      note.onclick = function () { addNote(name); };
      row.appendChild(hero); row.appendChild(note); li.appendChild(b); li.appendChild(row); ul.appendChild(li);
    });
  }
  function addHero(name) {
    var typeId = $('type').value;
    if (!typeId) { say(L.noType, true); return; }
    window.rolepi.project.createEntity(campaign.id, { typeId: typeId, name: name, values: {} })
      .then(function () { say(L.done + name); }).catch(function (e) { say(e.message, true); });
  }
  function addNote(name) {
    window.rolepi.project.createNote(campaign.id, { title: name, body: '' })
      .then(function () { say(L.done + name); }).catch(function (e) { say(e.message, true); });
  }
  function loadTarget(sel) {
    campaign = null; system = null; $('typeBox').hidden = true;
    if (!sel || sel.kind !== 'campaign') { $('target').textContent = L.none; return Promise.resolve(); }
    return window.rolepi.project.getCampaign(sel.id).then(function (c) {
      campaign = c; $('target').textContent = c.name;
      return window.rolepi.project.getSystem(c.systemId);
    }).then(function (s) {
      system = s;
      var box = $('type'); box.innerHTML = '';
      s.entityTypes.forEach(function (t) {
        var o = document.createElement('option'); o.value = t.id;
        o.textContent = typeof t.label === 'string' ? t.label : (t.label[window.rolepi.lang()] || t.label.en || t.id);
        box.appendChild(o);
      });
      $('typeBox').hidden = false;
    }).catch(function () { $('target').textContent = L.none; });
  }

  window.rolepi.ready.then(function (info) {
    L = TEXT[info.lang] || TEXT.en;
    document.title = L.title;
    $('title').textContent = L.title; $('lblStyle').textContent = L.style; $('gen').textContent = L.gen; $('d6').textContent = L.d6; $('lblTarget').textContent = L.target; $('lblType').textContent = L.type;
    var st = $('style');
    Object.keys(L.styles).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = L.styles[k]; st.appendChild(o); });
    window.rolepi.storage.get('style').then(function (v) { if (v && PARTS[v]) st.value = v; });
    st.onchange = function () { window.rolepi.storage.set('style', st.value); };
    $('gen').onclick = function () { var out = []; for (var i = 0; i < 5; i++) out.push(makeName(st.value)); render(out); say(''); };
    $('d6').onclick = function () { window.rolepi.roll('1d6').then(function (r) { say(r.text); }); };
    window.rolepi.project.selection().then(loadTarget);
    window.rolepi.on('selection', loadTarget);
    window.rolepi.on('theme', function () { L = TEXT[window.rolepi.lang()] || TEXT.en; });
  });
})();
