/* Rolepi panel SDK — подключается в странице панели: <script src="@sdk.js"></script>
 * Даёт объект window.rolepi. Все вызовы асинхронные (возвращают Promise) и работают только в пределах прав,
 * которые вы разрешили плагину. Прямого доступа к сети, файлам и данным приложения у панели нет. */
(function () {
  'use strict';
  var port = null, seq = 0, pending = {}, queue = [], listeners = {}, info = { lang: 'en', appVersion: '' };
  var readyResolve, ready = new Promise(function (r) { readyResolve = r; });

  function applyTheme(vars, lang) {
    var root = document.documentElement;
    if (vars) for (var k in vars) if (Object.prototype.hasOwnProperty.call(vars, k) && /^--[a-z0-9-]+$/.test(k)) root.style.setProperty(k, String(vars[k]));
    if (lang) { info.lang = lang; root.lang = lang; }
  }
  function emit(name, data) { (listeners[name] || []).slice().forEach(function (cb) { try { cb(data); } catch (e) { console.error(e); } }); }
  function call(method, params) {
    return new Promise(function (resolve, reject) {
      var id = ++seq, msg = { id: id, method: method, params: params === undefined ? null : params };
      pending[id] = { resolve: resolve, reject: reject };
      if (port) port.postMessage(msg); else queue.push(msg);
    });
  }
  function onPortMessage(e) {
    var m = e.data || {};
    if (typeof m.id === 'number' && pending[m.id]) {
      var p = pending[m.id]; delete pending[m.id];
      if (m.ok) p.resolve(m.result); else p.reject(new Error(m.error || 'error'));
    } else if (m.event === 'theme') { applyTheme(m.vars, m.lang); emit('theme', m); }
    else if (m.event) emit(m.event, m.data);
  }
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (port || e.source !== window.parent || !d || d.rolepi !== 'init' || !e.ports || !e.ports[0]) return;
    port = e.ports[0];
    port.onmessage = onPortMessage;
    info = { lang: d.lang || 'en', appVersion: d.appVersion || '' };
    applyTheme(d.vars, d.lang);
    port.postMessage({ ready: true });
    queue.splice(0).forEach(function (m) { port.postMessage(m); });
    readyResolve(info);
  });

  window.rolepi = {
    /** Promise: панель подключена к приложению; значение — { lang, appVersion } */
    ready: ready,
    lang: function () { return info.lang; },
    /** подписка на события: 'selection' (выбран документ), 'theme' (сменилась тема или язык) */
    on: function (name, cb) { (listeners[name] = listeners[name] || []).push(cb); return function () { listeners[name] = (listeners[name] || []).filter(function (x) { return x !== cb; }); }; },
    notify: function (message) { return call('ui.notify', { message: message }); },
    openPage: function (page) { return call('ui.openPage', { page: page }); },
    roll: function (formula) { return call('dice.roll', { formula: formula }); },
    storage: {
      get: function (key) { return call('storage.get', { key: key }); },
      set: function (key, value) { return call('storage.set', { key: key, value: value }); }
    },
    project: {
      selection: function () { return call('project.selection'); },
      listSystems: function () { return call('project.listSystems'); },
      getSystem: function (id) { return call('project.getSystem', { id: id }); },
      listCampaigns: function () { return call('project.listCampaigns'); },
      getCampaign: function (id) { return call('project.getCampaign', { id: id }); },
      createNote: function (campaignId, note) { return call('project.createNote', { campaignId: campaignId, title: note.title, body: note.body }); },
      createEntity: function (campaignId, entity) { return call('project.createEntity', { campaignId: campaignId, typeId: entity.typeId, name: entity.name, values: entity.values }); },
      updateEntityValues: function (campaignId, entityId, values) { return call('project.updateEntityValues', { campaignId: campaignId, entityId: entityId, values: values }); },
      createSystem: function (system) { return call('project.createSystem', { system: system }); }
    }
  };
})();
