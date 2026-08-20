/*
 * ChronoJeu — interface et orchestration
 * ---------------------------------------------------------------------------
 * Ce fichier relie le moteur de temps (engine.js) à l'écran. Il ne contient
 * aucune règle de calcul du temps : tout ce qui touche aux durées vit dans le
 * moteur, qui est testé séparément.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var Engine = window.ChronoEngine;
  var Sound = window.ChronoSound;
  var Store = window.ChronoStore;
  var MODES = Engine.MODES;

  // --- Palette des joueurs (couleurs classiques de jeux de société) --------
  var COLORS = [
    { name: 'Rouge',  hex: '#ef4444' },
    { name: 'Bleu',   hex: '#3b82f6' },
    { name: 'Vert',   hex: '#22c55e' },
    { name: 'Jaune',  hex: '#eab308' },
    { name: 'Violet', hex: '#a855f7' },
    { name: 'Orange', hex: '#f97316' },
    { name: 'Cyan',   hex: '#06d4c4' },
    { name: 'Rose',   hex: '#ec4899' },
    { name: 'Blanc',  hex: '#e2e8f0' },
    { name: 'Brun',   hex: '#b06c3f' }
  ];

  var MAX_PLAYERS = 8;
  var MIN_PLAYERS = 2;

  var DEFAULTS = {
    mode: MODES.PER_TURN,
    playerCount: 4,
    players: null,
    turnSeconds: 60,
    bankSeconds: 300,
    totalSeconds: 900,
    incrementSeconds: 10,
    warnSeconds: 10,
    startIndex: 0,
    sound: true,
    vibration: true,
    wakelock: true,
    handicap: false
  };

  // ==========================================================================
  // Utilitaires
  // ==========================================================================

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /** Durée cumulée : « 3:07 » ou « 1:12:40 ». */
  function fmtDuration(ms) {
    var t = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return h ? h + ':' + pad2(m) + ':' + pad2(s) : m + ':' + pad2(s);
  }

  /** Décompte : passe aux dixièmes sous 10 secondes, pour la tension. */
  function fmtCountdown(ms) {
    if (ms <= 0) return '0.0';
    if (ms < 10000) return (Math.ceil(ms / 100) / 10).toFixed(1);
    var t = Math.ceil(ms / 1000);
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return h ? h + ':' + pad2(m) + ':' + pad2(s) : m + ':' + pad2(s);
  }

  function fmtShort(seconds) {
    if (seconds < 60) return seconds + ' s';
    var m = Math.floor(seconds / 60), s = seconds % 60;
    return s ? m + ' min ' + s + ' s' : m + ' min';
  }

  function setText(el, value) { if (el && el.textContent !== value) el.textContent = value; }

  function showScreen(id) {
    $$('.screen').forEach(function (s) { s.classList.toggle('is-active', s.id === id); });
  }

  // ==========================================================================
  // État de l'application
  // ==========================================================================

  var settings = null;      // réglages d'avant-partie
  var engine = null;        // moteur de la partie en cours
  var bandEls = [];         // bandeaux joueurs, indexés par id
  var rafId = null;
  var lastTapAt = 0;
  var warnedThisTurn = false;
  var expiryAnnounced = {}; // modes budget : une seule alarme par joueur
  var wakeLock = null;

  function defaultPlayers(n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push({
        name: 'Joueur ' + (i + 1),
        color: COLORS[i % COLORS.length].hex,
        extraSeconds: 0
      });
    }
    return out;
  }

  function normalise(s) {
    var out = {};
    for (var k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) out[k] = DEFAULTS[k];
    if (s) for (var j in s) if (Object.prototype.hasOwnProperty.call(s, j)) out[j] = s[j];
    out.playerCount = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, out.playerCount | 0));
    if (!Array.isArray(out.players) || !out.players.length) out.players = defaultPlayers(out.playerCount);
    while (out.players.length < out.playerCount) {
      var i = out.players.length;
      out.players.push({ name: 'Joueur ' + (i + 1), color: COLORS[i % COLORS.length].hex, extraSeconds: 0 });
    }
    out.players.length = out.playerCount;
    if (out.startIndex >= out.playerCount) out.startIndex = 0;
    return out;
  }

  // ==========================================================================
  // ÉCRAN 1 — Réglages
  // ==========================================================================

  function buildDurationFields() {
    $$('.dur').forEach(function (box) {
      box.innerHTML =
        '<input type="number" inputmode="numeric" min="0" max="180" class="dur-min" aria-label="minutes"><span>min</span>' +
        '<input type="number" inputmode="numeric" min="0" max="59" class="dur-sec" aria-label="secondes"><span>s</span>';
      var key = box.getAttribute('data-key') + 'Seconds';
      box.addEventListener('input', function () {
        var m = parseInt($('.dur-min', box).value, 10) || 0;
        var s = parseInt($('.dur-sec', box).value, 10) || 0;
        settings[key] = Math.max(0, m * 60 + s);
        syncChips();
        persistSettings();
      });
    });

    $$('.chips').forEach(function (box) {
      var key = box.getAttribute('data-chips') + 'Seconds';
      box.getAttribute('data-values').split(',').forEach(function (v) {
        var sec = parseInt(v, 10);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.textContent = fmtShort(sec);
        b.setAttribute('data-sec', sec);
        b.addEventListener('click', function () {
          settings[key] = sec;
          renderDurations();
          persistSettings();
        });
        box.appendChild(b);
      });
    });
  }

  function renderDurations() {
    $$('.dur').forEach(function (box) {
      var total = settings[box.getAttribute('data-key') + 'Seconds'] || 0;
      $('.dur-min', box).value = Math.floor(total / 60);
      $('.dur-sec', box).value = total % 60;
    });
    syncChips();
  }

  function syncChips() {
    $$('.chips').forEach(function (box) {
      var val = settings[box.getAttribute('data-chips') + 'Seconds'];
      $$('.chip', box).forEach(function (c) {
        c.classList.toggle('is-on', parseInt(c.getAttribute('data-sec'), 10) === val);
      });
    });
  }

  /** N'affiche que les durées utiles au mode choisi. */
  function renderModeVisibility() {
    var visible = [];
    $$('.field[data-for]').forEach(function (f) {
      var show = f.getAttribute('data-for').split(' ').indexOf(settings.mode) !== -1;
      f.classList.toggle('hidden', !show);
    });
    $$('.field').forEach(function (f) {
      f.classList.remove('is-first');
      if (!f.classList.contains('hidden')) visible.push(f);
    });
    if (visible.length) visible[0].classList.add('is-first');
    $$('input[name="mode"]').forEach(function (r) { r.checked = r.value === settings.mode; });
  }

  function renderPlayers() {
    var list = $('#player-list');
    list.innerHTML = '';
    settings.players.forEach(function (p, i) {
      var li = document.createElement('li');
      li.className = 'player-row';

      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'color-dot';
      dot.style.background = p.color;
      dot.setAttribute('aria-label', 'Couleur du joueur ' + (i + 1));
      dot.addEventListener('click', function () {
        var idx = COLORS.findIndex(function (c) { return c.hex === p.color; });
        // On saute les couleurs déjà prises par un autre joueur.
        for (var k = 1; k <= COLORS.length; k++) {
          var cand = COLORS[(idx + k + COLORS.length) % COLORS.length];
          var taken = settings.players.some(function (o, oi) { return oi !== i && o.color === cand.hex; });
          if (!taken) { p.color = cand.hex; break; }
        }
        dot.style.background = p.color;
        persistSettings();
      });

      var name = document.createElement('input');
      name.type = 'text';
      name.className = 'input grow';
      name.value = p.name;
      name.maxLength = 18;
      name.placeholder = 'Joueur ' + (i + 1);
      name.addEventListener('input', function () {
        p.name = name.value.trim() || ('Joueur ' + (i + 1));
        renderStartPlayer();
        persistSettings();
      });

      li.appendChild(dot);
      li.appendChild(name);

      if (settings.handicap) {
        var hcp = document.createElement('input');
        hcp.type = 'number';
        hcp.className = 'input handicap-input';
        hcp.min = 0; hcp.max = 3600; hcp.step = 10;
        hcp.value = p.extraSeconds || 0;
        hcp.setAttribute('aria-label', 'Temps supplémentaire pour ' + p.name);
        hcp.addEventListener('input', function () {
          p.extraSeconds = Math.max(0, parseInt(hcp.value, 10) || 0);
          persistSettings();
        });
        var unit = document.createElement('span');
        unit.className = 'handicap-unit';
        unit.textContent = '+ s';
        li.appendChild(hcp);
        li.appendChild(unit);
      }

      list.appendChild(li);
    });
    setText($('#player-count'), String(settings.playerCount));
    renderStartPlayer();
  }

  function renderStartPlayer() {
    var sel = $('#start-player');
    var cur = settings.startIndex;
    sel.innerHTML = '';
    settings.players.forEach(function (p, i) {
      var o = document.createElement('option');
      o.value = i;
      o.textContent = p.name;
      sel.appendChild(o);
    });
    sel.value = String(Math.min(cur, settings.players.length - 1));
  }

  function changePlayerCount(delta) {
    var n = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, settings.playerCount + delta));
    if (n === settings.playerCount) return;
    if (n > settings.playerCount) {
      for (var i = settings.players.length; i < n; i++) {
        var used = settings.players.map(function (p) { return p.color; });
        var free = COLORS.filter(function (c) { return used.indexOf(c.hex) === -1; });
        settings.players.push({
          name: 'Joueur ' + (i + 1),
          color: (free[0] || COLORS[i % COLORS.length]).hex,
          extraSeconds: 0
        });
      }
    } else {
      settings.players.length = n;
    }
    settings.playerCount = n;
    if (settings.startIndex >= n) settings.startIndex = 0;
    renderPlayers();
    persistSettings();
  }

  function renderPresets() {
    var sel = $('#preset-select');
    var list = Store.loadPresets();
    sel.innerHTML = '<option value="">— choisir une configuration —</option>';
    list.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.name;
      o.textContent = p.name;
      sel.appendChild(o);
    });
  }

  function persistSettings() { Store.saveSettings(settings); }

  function renderSetup() {
    renderPlayers();
    renderDurations();
    renderModeVisibility();
    $('#opt-sound').checked = settings.sound;
    $('#opt-vibration').checked = settings.vibration;
    $('#opt-wakelock').checked = settings.wakelock;
    $('#opt-handicap').checked = settings.handicap;
  }

  function bindSetup() {
    $('#count-minus').addEventListener('click', function () { changePlayerCount(-1); });
    $('#count-plus').addEventListener('click', function () { changePlayerCount(1); });

    $$('input[name="mode"]').forEach(function (r) {
      r.addEventListener('change', function () {
        settings.mode = r.value;
        renderModeVisibility();
        persistSettings();
      });
    });

    [['#opt-sound', 'sound'], ['#opt-vibration', 'vibration'], ['#opt-wakelock', 'wakelock']]
      .forEach(function (pair) {
        $(pair[0]).addEventListener('change', function () {
          settings[pair[1]] = this.checked;
          Sound.configure({ sound: settings.sound, vibration: settings.vibration });
          persistSettings();
        });
      });

    $('#opt-handicap').addEventListener('change', function () {
      settings.handicap = this.checked;
      if (!settings.handicap) settings.players.forEach(function (p) { p.extraSeconds = 0; });
      renderPlayers();
      persistSettings();
    });

    $('#start-player').addEventListener('change', function () {
      settings.startIndex = parseInt(this.value, 10) || 0;
      persistSettings();
    });

    $('#btn-preset-save').addEventListener('click', function () {
      var name = $('#preset-name').value.trim();
      if (!name) { $('#preset-name').focus(); return; }
      Store.savePreset(name, JSON.parse(JSON.stringify(settings)));
      $('#preset-name').value = '';
      renderPresets();
      $('#preset-select').value = name;
    });

    $('#btn-preset-load').addEventListener('click', function () {
      var name = $('#preset-select').value;
      if (!name) return;
      var found = Store.loadPresets().filter(function (p) { return p.name === name; })[0];
      if (!found) return;
      settings = normalise(found.settings);
      Sound.configure({ sound: settings.sound, vibration: settings.vibration });
      renderSetup();
      persistSettings();
    });

    $('#btn-preset-delete').addEventListener('click', function () {
      var name = $('#preset-select').value;
      if (!name) return;
      Store.deletePreset(name);
      renderPresets();
    });

    $('#btn-start').addEventListener('click', function () {
      Sound.unlock();
      Store.clearGame();
      startGame(null);
    });
  }

  // ==========================================================================
  // ÉCRAN 2 — Partie
  // ==========================================================================

  /**
   * Répartit les joueurs autour de l'écran, dans l'ordre du tour de table.
   * On remplit le bas, puis la droite, puis le haut, puis la gauche : les
   * joueurs se retrouvent placés comme autour d'une vraie table.
   */
  function seatSides(n) {
    var base = Math.floor(n / 4), rem = n % 4;
    var counts = { bottom: base, right: base, top: base, left: base };
    if (rem >= 1) counts.bottom++;
    if (rem >= 2) counts.top++;
    if (rem >= 3) counts.right++;

    var sides = [];
    ['bottom', 'right', 'top', 'left'].forEach(function (side) {
      for (var i = 0; i < counts[side]; i++) sides.push(side);
    });
    return sides;
  }

  var SIDE_ROTATION = { bottom: 0, right: -90, top: 180, left: 90 };

  function buildBoard() {
    // On se fie aux joueurs du moteur : en cas de reprise, ce sont eux qui
    // font foi, pas le formulaire de réglages.
    var roster = engine.players;
    var sides = seatSides(roster.length);
    var rails = {
      bottom: $('#rail-bottom'), top: $('#rail-top'),
      left: $('#rail-left'), right: $('#rail-right')
    };
    Object.keys(rails).forEach(function (k) {
      $('.rail-inner', rails[k]).innerHTML = '';
      rails[k].classList.add('is-empty');
    });

    bandEls = [];
    roster.forEach(function (p, i) {
      var side = sides[i];
      var band = document.createElement('div');
      band.className = 'band';
      band.style.setProperty('--band-color', p.color);
      band.innerHTML =
        '<div class="band-name"></div>' +
        '<div class="band-time">0:00</div>' +
        '<div class="band-meta"></div>';
      $('.band-name', band).textContent = p.name;
      band.setAttribute('data-side', side);

      // Appui long sur un bandeau : retirer / réintégrer le joueur.
      var pressTimer = null;
      band.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        pressTimer = setTimeout(function () { openMenu(false); }, 550);
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
        band.addEventListener(ev, function () { clearTimeout(pressTimer); });
      });

      $('.rail-inner', rails[side]).appendChild(band);
      rails[side].classList.remove('is-empty');
      bandEls.push({ el: band, side: side, name: $('.band-name', band),
                     time: $('.band-time', band), meta: $('.band-meta', band) });
    });

    sizeRails();
  }

  /**
   * Les bandeaux latéraux sont des boîtes horizontales que l'on fait pivoter.
   * Il faut donc leur donner une longueur égale à la hauteur de la zone
   * centrale : c'est le seul calcul que le CSS ne peut pas faire seul.
   */
  function sizeRails() {
    var mid = $('#mid');
    if (!mid) return;
    var h = mid.clientHeight;
    if (h <= 0) return;
    var root = document.documentElement;
    root.style.setProperty('--rail-len', h + 'px');
    ['left', 'right'].forEach(function (side) {
      var rail = $('#rail-' + side);
      var n = rail ? $$('.band', rail).length : 0;
      // Un bandeau plus long que ~230 px n'apporte rien et mange le centre.
      var len = n ? Math.min(h, n * 230 + (n - 1) * 6) : 0;
      root.style.setProperty('--rail-len-' + side, len + 'px');
    });
  }

  function startGame(snapshot) {
    if (snapshot) {
      engine = Engine.fromSnapshot(snapshot);
    } else {
      engine = new Engine({
        mode: settings.mode,
        turnSeconds: settings.turnSeconds,
        bankSeconds: settings.bankSeconds,
        totalSeconds: settings.totalSeconds,
        incrementSeconds: settings.incrementSeconds,
        warnSeconds: settings.warnSeconds,
        startIndex: settings.startIndex,
        players: settings.players
      });
      engine.start();
    }

    Sound.configure({ sound: settings.sound, vibration: settings.vibration });
    warnedThisTurn = false;
    expiryAnnounced = {};

    showScreen('screen-game');
    buildBoard();
    $('#pause-overlay').classList.toggle('hidden', engine.state !== 'paused');
    $('#menu-overlay').classList.add('hidden');
    requestWakeLock();
    saveGame();
    startLoop();
  }

  // Références mises en cache : la boucle d'affichage tourne pendant des heures,
  // inutile de rechercher les mêmes éléments soixante fois par seconde.
  var ui = null;
  function cacheUI() {
    ui = {
      screen: $('#screen-game'),
      name: $('#center-name'),
      time: $('#center-time'),
      sub: $('#center-sub'),
      hint: $('#center-hint'),
      rot: $('#center-rot'),
      round: $('#round-num'),
      undo: $('#btn-undo'),
      direction: $('#btn-direction')
    };
  }

  var lastRenderAt = 0;

  function startLoop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    var tick = function () {
      render();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function render(force) {
    if (!engine) return;
    if (!ui) cacheUI();
    var v = engine.view();

    // Sous dix secondes on affiche les dixièmes : il faut alors rafraîchir à
    // chaque image. Au-dessus, dix fois par seconde suffisent largement et
    // ménagent la batterie sur une partie de deux heures.
    var now = Date.now();
    var fine = v.remainingMs < 10000;
    if (!force && !fine && now - lastRenderAt < 95) return;
    lastRenderAt = now;

    var screen = ui.screen;
    var cur = v.currentPlayer;

    // --- zone centrale ---
    setText(ui.name, cur ? cur.name : '');
    setText(ui.time, fmtCountdown(v.remainingMs));
    setText(ui.round, String(v.round));

    var sub = '';
    if (v.isTimeOut && v.overtimeMs > 0) {
      sub = 'Dépassement +' + fmtDuration(v.overtimeMs);
    } else if (v.mode === MODES.PER_TURN_BANK) {
      sub = v.usingBank
        ? 'Banque en cours — ' + fmtDuration(v.bankRemainingMs) + ' restants'
        : 'Banque : ' + fmtDuration(v.bankRemainingMs);
    } else if (v.mode === MODES.FISCHER) {
      sub = '+' + Math.round(engine.incrementMs / 1000) + ' s par tour';
    } else if (v.mode === MODES.TOTAL) {
      sub = 'Budget de partie';
    } else {
      sub = 'Tour de ' + fmtDuration(v.allowanceMs);
    }
    setText(ui.sub, sub);

    // Le mode d'emploi ne sert qu'au premier tour ; ensuite il encombre.
    var started = v.players.some(function (p) { return p.turns > 0; });
    ui.hint.classList.toggle('hidden', started);

    var rot = 0;
    if (cur && bandEls[v.currentIndex]) rot = SIDE_ROTATION[bandEls[v.currentIndex].side] || 0;
    ui.rot.style.setProperty('--rot', rot + 'deg');
    screen.style.setProperty('--accent', cur ? cur.color : '#4c8dff');

    screen.classList.toggle('is-warning', v.isWarning && v.state === 'running');
    screen.classList.toggle('is-timeout', v.isTimeOut && v.state !== 'finished');

    // --- bandeaux ---
    v.players.forEach(function (p, i) {
      var b = bandEls[i];
      if (!b) return;
      setText(b.time, fmtDuration(p.totalMs));
      var meta = p.turns + (p.turns > 1 ? ' tours' : ' tour');
      if (v.mode === MODES.PER_TURN_BANK) meta += ' · banque ' + fmtDuration(p.bankRemainingMs);
      else if (Engine.isBudgetMode(v.mode)) meta += ' · reste ' + fmtDuration(p.budgetRemainingMs);
      if (p.expirations > 0) meta += ' · ' + p.expirations + ' dép.';
      setText(b.meta, meta);
      b.el.classList.toggle('is-current', p.isCurrent);
      b.el.classList.toggle('is-out', !p.inGame);
    });

    // --- outils ---
    ui.undo.disabled = !v.canUndo;
    ui.direction.classList.toggle('is-on', v.direction === -1);

    // --- signaux sonores ---
    if (v.state === 'running') {
      if (v.isWarning && !warnedThisTurn) { warnedThisTurn = true; Sound.warning(); }
      if (v.isTimeOut) {
        if (v.alarmRepeats) {
          if (!Sound.isAlarmRunning()) Sound.startRepeatingAlarm();
        } else if (!expiryAnnounced[v.currentIndex]) {
          expiryAnnounced[v.currentIndex] = true;
          Sound.timeUp();
        }
      } else {
        Sound.stopRepeatingAlarm();
      }
    } else {
      Sound.stopRepeatingAlarm();
    }
  }

  function onTap() {
    if (!engine || engine.state === 'finished') return;
    if (engine.state === 'paused') return;          // le voile de pause bloque
    var now = Date.now();
    if (now - lastTapAt < 220) return;              // anti double-déclenchement
    lastTapAt = now;

    Sound.unlock();
    Sound.stopRepeatingAlarm();
    engine.pass();
    warnedThisTurn = false;
    Sound.pass();
    render(true);
    saveGame();
    if (engine.state === 'finished') showEnd();
  }

  function bindGame() {
    var tap = $('#tap-zone');
    tap.addEventListener('pointerdown', function (e) { e.preventDefault(); onTap(); });
    tap.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    $('#btn-undo').addEventListener('click', function (e) {
      e.stopPropagation();
      Sound.stopRepeatingAlarm();
      if (engine.undo()) { warnedThisTurn = false; render(true); saveGame(); }
    });

    $('#btn-direction').addEventListener('click', function (e) {
      e.stopPropagation();
      engine.reverseDirection();
      Sound.pass();
      render(true);
      saveGame();
    });

    $('#btn-pause').addEventListener('click', function (e) {
      e.stopPropagation();
      Sound.stopRepeatingAlarm();
      engine.pause();
      $('#pause-overlay').classList.remove('hidden');
      render(true);
      saveGame();
    });

    $('#btn-resume-game').addEventListener('click', function () {
      engine.resume();
      $('#pause-overlay').classList.add('hidden');
      requestWakeLock();
      render(true);
      saveGame();
    });

    $('#btn-menu').addEventListener('click', function (e) { e.stopPropagation(); openMenu(false); });
    $('#btn-menu-close').addEventListener('click', function () { closeMenu(); });

    $('#btn-finish').addEventListener('click', function () {
      menuWasRunning = false;      // inutile de relancer l'horloge pour l'arrêter
      closeMenu();
      engine.finish();
      showEnd();
    });

    $('#btn-replay').addEventListener('click', function () {
      Sound.unlock();
      Store.clearGame();
      startGame(null);
    });

    $('#btn-new').addEventListener('click', function () {
      Store.clearGame();
      showScreen('screen-setup');
      renderSetup();
    });

    window.addEventListener('resize', sizeRails);
    window.addEventListener('orientationchange', function () { setTimeout(sizeRails, 200); });
  }

  var menuWasRunning = false;

  /**
   * @param refresh  true quand on ne fait que redessiner la liste après une
   *                 modification : il ne faut alors surtout pas oublier que la
   *                 partie tournait avant l'ouverture du menu.
   */
  function openMenu(refresh) {
    if (!engine) return;
    if (!refresh) {
      menuWasRunning = engine.state === 'running';
      if (menuWasRunning) engine.pause();
      Sound.stopRepeatingAlarm();
    }

    var list = $('#menu-players');
    list.innerHTML = '';
    engine.players.forEach(function (p, i) {
      var li = document.createElement('li');
      li.className = 'menu-player' + (p.inGame ? '' : ' is-out');
      var sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = p.color;
      var nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = p.name;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost btn-sm';
      btn.textContent = p.inGame ? 'Retirer' : 'Réintégrer';
      btn.addEventListener('click', function () {
        engine.setPlayerInGame(i, !p.inGame);
        if (engine.state === 'finished') { menuWasRunning = false; closeMenu(); showEnd(); return; }
        openMenu(true);
      });
      li.appendChild(sw); li.appendChild(nm); li.appendChild(btn);
      list.appendChild(li);
    });

    $('#menu-overlay').classList.remove('hidden');
  }

  function closeMenu() {
    $('#menu-overlay').classList.add('hidden');
    if (menuWasRunning && engine && engine.state === 'paused') engine.resume();
    menuWasRunning = false;
    saveGame();
  }

  // ==========================================================================
  // ÉCRAN 3 — Fin de partie
  // ==========================================================================

  function showEnd() {
    stopLoop();
    Sound.stopRepeatingAlarm();
    Sound.gameOver();
    releaseWakeLock();
    Store.clearGame();

    var v = engine.view();
    var players = v.players.slice();

    var totalTurns = players.reduce(function (a, p) { return a + p.turns; }, 0);
    var fullRounds = v.round - 1;
    setText($('#end-summary'),
      totalTurns + (totalTurns > 1 ? ' tours joués' : ' tour joué') + ' · ' +
      (fullRounds > 0
        ? fullRounds + (fullRounds > 1 ? ' tours de table complets · ' : ' tour de table complet · ')
        : '') +
      'durée : ' + fmtDuration(v.gameDurationMs));

    var slowest = players.slice().sort(function (a, b) {
      return (b.turns ? b.totalMs / b.turns : 0) - (a.turns ? a.totalMs / a.turns : 0);
    })[0];

    var tbody = $('#stats-table tbody');
    tbody.innerHTML = '';
    players.slice().sort(function (a, b) { return b.totalMs - a.totalMs; }).forEach(function (p) {
      var tr = document.createElement('tr');
      if (slowest && p.id === slowest.id && p.turns > 0) tr.className = 'is-slowest';
      var avg = p.turns ? p.totalMs / p.turns : 0;
      tr.innerHTML =
        '<td><span class="who"><span class="swatch"></span><span class="nm"></span></span></td>' +
        '<td>' + fmtDuration(p.totalMs) + '</td>' +
        '<td>' + fmtDuration(avg) + '</td>' +
        '<td>' + fmtDuration(p.longestTurnMs) + '</td>' +
        '<td>' + p.turns + '</td>' +
        '<td' + (p.expirations ? ' class="over"' : '') + '>' + p.expirations + '</td>';
      $('.swatch', tr).style.background = p.color;
      $('.nm', tr).textContent = p.name;
      tbody.appendChild(tr);
    });

    // Faits marquants
    var played = players.filter(function (p) { return p.turns > 0; });
    var fastest = played.slice().sort(function (a, b) { return a.totalMs / a.turns - b.totalMs / b.turns; })[0];
    var longest = played.slice().sort(function (a, b) { return b.longestTurnMs - a.longestTurnMs; })[0];
    var totalThinking = players.reduce(function (a, p) { return a + p.totalMs; }, 0);

    var hl = $('#end-highlights');
    hl.innerHTML = '<h2>Faits marquants</h2>';
    function addHighlight(icon, label, value) {
      var d = document.createElement('div');
      d.className = 'highlight';
      d.innerHTML = '<span class="hl-icon">' + icon + '</span><span><span class="hl-label"></span><br><span class="hl-value"></span></span>';
      $('.hl-label', d).textContent = label;
      $('.hl-value', d).textContent = value;
      hl.appendChild(d);
    }
    addHighlight('⏱', 'Durée de la partie', fmtDuration(v.gameDurationMs));
    addHighlight('🧠', 'Temps de réflexion cumulé', fmtDuration(totalThinking));
    // Départager les joueurs n'a de sens qu'à partir de deux participants.
    if (played.length > 1) {
      if (fastest) addHighlight('⚡', 'Le plus rapide', fastest.name + ' — ' + fmtDuration(fastest.totalMs / fastest.turns) + ' par tour');
      if (slowest && slowest.turns) addHighlight('🐢', 'Le plus lent', slowest.name + ' — ' + fmtDuration(slowest.totalMs / slowest.turns) + ' par tour');
    }
    if (longest && longest.longestTurnMs > 0) addHighlight('🗿', 'Le tour le plus long', longest.name + ' — ' + fmtDuration(longest.longestTurnMs));

    showScreen('screen-end');
  }

  // ==========================================================================
  // Écran allumé, sauvegarde, cycle de vie
  // ==========================================================================

  function requestWakeLock() {
    if (!settings || !settings.wakelock) return;
    if (!('wakeLock' in navigator)) return;
    if (wakeLock) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () { /* refusé : sans importance */ });
  }

  function releaseWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) { /* ignoré */ } wakeLock = null; }
  }

  function saveGame() {
    if (!engine || engine.state === 'finished') { Store.clearGame(); return; }
    Store.saveGame(engine.serialize(), settings);
  }

  function bindLifecycle() {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        Sound.stopRepeatingAlarm();
        saveGame();
      } else {
        requestWakeLock();
        sizeRails();
      }
    });
    window.addEventListener('pagehide', saveGame);

    // Le double-tap sur iOS déclenche un zoom : on le neutralise.
    var lastTouch = 0;
    document.addEventListener('touchend', function (e) {
      var now = Date.now();
      if (now - lastTouch <= 320) e.preventDefault();
      lastTouch = now;
    }, { passive: false });
  }

  function checkResume() {
    var saved = Store.loadGame();
    var card = $('#resume-card');
    if (!saved || !saved.snapshot || saved.snapshot.state === 'finished') {
      card.classList.add('hidden');
      return;
    }
    var snap = saved.snapshot;
    var names = (snap.players || []).map(function (p) { return p.name; }).join(', ');
    setText($('#resume-detail'), 'Tour ' + snap.round + ' · ' + names);
    card.classList.remove('hidden');

    $('#btn-resume').onclick = function () {
      Sound.unlock();
      settings = normalise(saved.settings);
      Sound.configure({ sound: settings.sound, vibration: settings.vibration });
      // La partie reprend en pause : personne ne perd de temps pendant qu'on
      // se réinstalle autour de la table.
      snap.state = 'paused';
      startGame(snap);
      $('#pause-overlay').classList.remove('hidden');
    };
    $('#btn-discard').onclick = function () {
      Store.clearGame();
      card.classList.add('hidden');
    };
  }

  // ==========================================================================
  // Démarrage
  // ==========================================================================

  function init() {
    settings = normalise(Store.loadSettings(null));
    Sound.configure({ sound: settings.sound, vibration: settings.vibration });

    buildDurationFields();
    bindSetup();
    bindGame();
    bindLifecycle();
    renderSetup();
    renderPresets();
    checkResume();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () { /* hors ligne indisponible */ });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
