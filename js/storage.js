/*
 * ChronoJeu — mémoire locale
 * ---------------------------------------------------------------------------
 * Tout est stocké dans le navigateur : aucun serveur, aucun compte, aucune
 * donnée qui sort du téléphone.
 *   - les derniers réglages utilisés (rechargés au lancement)
 *   - les configurations enregistrées par jeu (« Catan », « Terraforming »…)
 *   - la partie en cours, pour pouvoir reprendre après une fermeture
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var K_SETTINGS = 'chronojeu.settings.v1';
  var K_PRESETS = 'chronojeu.presets.v1';
  var K_GAME = 'chronojeu.game.v1';

  function available() {
    try {
      var t = '__cj__';
      global.localStorage.setItem(t, '1');
      global.localStorage.removeItem(t);
      return true;
    } catch (e) { return false; }
  }

  var ok = available();

  function read(key, fallback) {
    if (!ok) return fallback;
    try {
      var raw = global.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    if (!ok) return false;
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) { return false; }
  }

  function remove(key) {
    if (!ok) return;
    try { global.localStorage.removeItem(key); } catch (e) { /* ignoré */ }
  }

  global.ChronoStore = {
    available: ok,

    loadSettings: function (fallback) { return read(K_SETTINGS, fallback); },
    saveSettings: function (s) { return write(K_SETTINGS, s); },

    loadPresets: function () {
      var list = read(K_PRESETS, []);
      return Array.isArray(list) ? list : [];
    },
    savePreset: function (name, settings) {
      var list = this.loadPresets().filter(function (p) { return p.name !== name; });
      list.push({ name: name, settings: settings, savedAt: Date.now() });
      list.sort(function (a, b) { return a.name.localeCompare(b.name, 'fr'); });
      write(K_PRESETS, list);
      return list;
    },
    deletePreset: function (name) {
      var list = this.loadPresets().filter(function (p) { return p.name !== name; });
      write(K_PRESETS, list);
      return list;
    },

    loadGame: function () { return read(K_GAME, null); },
    saveGame: function (snapshot, settings) {
      return write(K_GAME, { snapshot: snapshot, settings: settings, savedAt: Date.now() });
    },
    clearGame: function () { remove(K_GAME); }
  };
})(typeof self !== 'undefined' ? self : this);
