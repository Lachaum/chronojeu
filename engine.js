/*
 * ChronoJeu — moteur de temps
 * ---------------------------------------------------------------------------
 * Ce fichier ne connaît rien de l'interface : il ne fait que gérer le temps.
 * Il est testable en dehors du navigateur (voir tests/engine.test.js).
 *
 * Principe fondamental : on ne compte JAMAIS le temps en additionnant des
 * intervalles. On mémorise un horodatage de départ et on calcule l'écart avec
 * l'instant présent. C'est la seule façon d'être exact, y compris quand le
 * téléphone met l'application en veille.
 * ---------------------------------------------------------------------------
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;          // Node (tests)
  } else {
    root.ChronoEngine = api;       // Navigateur
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Les quatre modes de gestion du temps. */
  var MODES = {
    PER_TURN: 'perTurn',           // X secondes par tour, remises à neuf
    PER_TURN_BANK: 'perTurnBank',  // X par tour + réserve personnelle
    TOTAL: 'total',                // budget unique pour toute la partie
    FISCHER: 'fischer'             // budget + incrément à chaque fin de tour
  };

  /** Modes dont le budget est consommé définitivement. */
  function isBudgetMode(mode) {
    return mode === MODES.TOTAL || mode === MODES.FISCHER;
  }

  var UNDO_DEPTH = 30;

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  /**
   * @param {object} config
   *   mode              une valeur de MODES
   *   turnSeconds       temps par tour (modes perTurn / perTurnBank)
   *   bankSeconds       réserve personnelle (mode perTurnBank)
   *   totalSeconds      budget de partie (modes total / fischer)
   *   incrementSeconds  incrément par tour (mode fischer)
   *   warnSeconds       durée du « chaud time »
   *   startIndex        index du joueur qui commence
   *   players           [{ name, color, extraSeconds }]
   *   now               (optionnel) fonction d'horloge, injectée par les tests
   */
  function Engine(config) {
    this.now = config.now || Date.now;

    this.mode = config.mode || MODES.PER_TURN;
    this.turnMs = sec(config.turnSeconds);
    this.bankMs = sec(config.bankSeconds);
    this.totalMs = sec(config.totalSeconds);
    this.incrementMs = sec(config.incrementSeconds);
    this.warnMs = sec(config.warnSeconds);

    var self = this;
    this.players = (config.players || []).map(function (p, i) {
      var extraMs = sec(p.extraSeconds);
      return {
        id: i,
        name: p.name || ('Joueur ' + (i + 1)),
        color: p.color || '#888888',
        inGame: true,          // encore dans la rotation
        totalMs: 0,            // temps de réflexion cumulé
        turns: 0,
        longestTurnMs: 0,
        overtimeMs: 0,         // temps consommé au-delà de l'allocation
        expirations: 0,        // nombre de tours terminés en dépassement
        expired: false,        // budget définitivement épuisé (total/fischer)
        extraMs: extraMs,      // handicap
        bankRemainingMs: self.bankMs,
        budgetRemainingMs: self.totalMs + extraMs
      };
    });

    this.state = 'idle';       // idle | running | paused | finished
    this.direction = 1;        // 1 = sens horaire, -1 = sens inverse
    this.currentIndex = clampIndex(config.startIndex || 0, this.players.length);
    this.roundStartIndex = this.currentIndex;
    this.round = 1;

    this.turnAccumMs = 0;      // temps du tour en cours, figé au dernier arrêt
    this.turnResumedAt = null; // horodatage de la dernière reprise

    this.wallStartAt = null;   // début de la partie (horloge murale)
    this.wallEndAt = null;
    this.pausedMs = 0;         // cumul des pauses
    this.pauseStartedAt = null;

    this.history = [];         // pile d'annulation
  }

  Engine.MODES = MODES;
  Engine.isBudgetMode = isBudgetMode;

  function sec(v) { return Math.max(0, Math.round((Number(v) || 0) * 1000)); }
  function clampIndex(i, n) { return n ? ((i % n) + n) % n : 0; }

  // ---------------------------------------------------------------------------
  // Lecture du temps
  // ---------------------------------------------------------------------------

  /** Temps écoulé dans le tour en cours, en millisecondes. */
  Engine.prototype.elapsedThisTurn = function () {
    var e = this.turnAccumMs;
    if (this.state === 'running' && this.turnResumedAt !== null) {
      e += Math.max(0, this.now() - this.turnResumedAt);
    }
    return e;
  };

  /**
   * Temps alloué au joueur pour le tour en cours.
   * C'est ici que se joue toute la différence entre les quatre modes.
   */
  Engine.prototype.allowanceFor = function (player) {
    switch (this.mode) {
      case MODES.PER_TURN:
        return this.turnMs + player.extraMs;
      case MODES.PER_TURN_BANK:
        return this.turnMs + player.extraMs + player.bankRemainingMs;
      case MODES.TOTAL:
      case MODES.FISCHER:
        return player.expired ? 0 : player.budgetRemainingMs;
      default:
        return this.turnMs;
    }
  };

  /** Instantané complet destiné à l'affichage. Ne modifie rien. */
  Engine.prototype.view = function () {
    var p = this.players[this.currentIndex];
    var elapsed = this.elapsedThisTurn();
    var allowance = p ? this.allowanceFor(p) : 0;
    var remaining = Math.max(0, allowance - elapsed);
    var overtime = Math.max(0, elapsed - allowance);
    var budget = isBudgetMode(this.mode);

    // En mode « par tour + banque », on distingue le temps du tour de la réserve.
    var usingBank = false;
    var bankLeft = p ? p.bankRemainingMs : 0;
    if (this.mode === MODES.PER_TURN_BANK && p) {
      var turnPart = this.turnMs + p.extraMs;
      if (elapsed > turnPart) {
        usingBank = true;
        bankLeft = Math.max(0, p.bankRemainingMs - (elapsed - turnPart));
      }
    }

    var self = this;
    return {
      state: this.state,
      mode: this.mode,
      round: this.round,
      direction: this.direction,
      currentIndex: this.currentIndex,
      currentPlayer: p,
      elapsedThisTurnMs: elapsed,
      remainingMs: remaining,
      overtimeMs: overtime,
      allowanceMs: allowance,
      isWarning: remaining > 0 && this.warnMs > 0 && remaining <= this.warnMs,
      isTimeOut: allowance >= 0 && remaining === 0 && this.state !== 'idle',
      // En modes par tour l'alarme se répète jusqu'au tap ; en modes budget
      // le temps est épuisé pour toute la partie, on n'alarme donc qu'une fois.
      alarmRepeats: !budget,
      usingBank: usingBank,
      bankRemainingMs: bankLeft,
      canUndo: this.history.length > 0,
      gameDurationMs: this.gameDurationMs(),
      players: this.players.map(function (pl, i) {
        var live = pl.totalMs;
        if (i === self.currentIndex && self.state !== 'finished') live += elapsed;
        return {
          id: pl.id,
          name: pl.name,
          color: pl.color,
          inGame: pl.inGame,
          isCurrent: i === self.currentIndex,
          totalMs: live,
          turns: pl.turns,
          longestTurnMs: Math.max(pl.longestTurnMs, i === self.currentIndex ? elapsed : 0),
          overtimeMs: pl.overtimeMs + (i === self.currentIndex ? overtime : 0),
          expirations: pl.expirations,
          expired: pl.expired,
          bankRemainingMs: i === self.currentIndex ? bankLeft : pl.bankRemainingMs,
          budgetRemainingMs: pl.budgetRemainingMs
        };
      })
    };
  };

  Engine.prototype.gameDurationMs = function () {
    if (this.wallStartAt === null) return 0;
    var end = this.wallEndAt !== null ? this.wallEndAt : this.now();
    return Math.max(0, end - this.wallStartAt);
  };

  // ---------------------------------------------------------------------------
  // Déroulement de la partie
  // ---------------------------------------------------------------------------

  Engine.prototype.start = function () {
    if (this.state !== 'idle') return;
    this.state = 'running';
    this.wallStartAt = this.now();
    this.turnAccumMs = 0;
    this.turnResumedAt = this.now();
  };

  Engine.prototype.pause = function () {
    if (this.state !== 'running') return;
    this.turnAccumMs = this.elapsedThisTurn();
    this.turnResumedAt = null;
    this.pauseStartedAt = this.now();
    this.state = 'paused';
  };

  Engine.prototype.resume = function () {
    if (this.state !== 'paused') return;
    if (this.pauseStartedAt !== null) {
      this.pausedMs += Math.max(0, this.now() - this.pauseStartedAt);
      this.pauseStartedAt = null;
    }
    this.turnResumedAt = this.now();
    this.state = 'running';
  };

  Engine.prototype.togglePause = function () {
    if (this.state === 'running') this.pause();
    else if (this.state === 'paused') this.resume();
  };

  /** Fin du tour du joueur actif : on solde son temps et on passe au suivant. */
  Engine.prototype.pass = function () {
    if (this.state !== 'running' && this.state !== 'paused') return false;

    this.pushHistory();

    var p = this.players[this.currentIndex];
    var elapsed = this.elapsedThisTurn();
    var allowance = this.allowanceFor(p);
    var over = Math.max(0, elapsed - allowance);

    p.totalMs += elapsed;
    p.turns += 1;
    if (elapsed > p.longestTurnMs) p.longestTurnMs = elapsed;
    p.overtimeMs += over;
    if (over > 0) p.expirations += 1;

    switch (this.mode) {
      case MODES.PER_TURN:
        // Rien à reporter : le temps repart à neuf au tour suivant.
        break;

      case MODES.PER_TURN_BANK: {
        var turnPart = this.turnMs + p.extraMs;
        var takenFromBank = Math.min(
          Math.max(0, elapsed - turnPart),
          p.bankRemainingMs
        );
        p.bankRemainingMs = Math.max(0, p.bankRemainingMs - takenFromBank);
        break;
      }

      case MODES.TOTAL:
        p.budgetRemainingMs = Math.max(0, p.budgetRemainingMs - elapsed);
        if (p.budgetRemainingMs === 0) p.expired = true;
        break;

      case MODES.FISCHER:
        p.budgetRemainingMs = Math.max(0, p.budgetRemainingMs - elapsed);
        if (p.budgetRemainingMs === 0) {
          p.expired = true;          // épuisé : plus d'incrément
        } else {
          p.budgetRemainingMs += this.incrementMs;
        }
        break;
    }

    var next = this.nextIndex();
    if (next === null) { this.finish(); return true; }

    if (next === this.roundStartIndex) this.round += 1;

    this.currentIndex = next;
    this.turnAccumMs = 0;
    this.turnResumedAt = this.now();
    if (this.state === 'paused') {
      // Passer au joueur suivant relance forcément l'horloge.
      if (this.pauseStartedAt !== null) {
        this.pausedMs += Math.max(0, this.now() - this.pauseStartedAt);
        this.pauseStartedAt = null;
      }
      this.state = 'running';
    }
    return true;
  };

  /** Index du prochain joueur encore en lice, ou null s'il n'y en a plus. */
  Engine.prototype.nextIndex = function () {
    var n = this.players.length;
    if (!n) return null;
    for (var k = 1; k <= n; k++) {
      var idx = clampIndex(this.currentIndex + this.direction * k, n);
      if (this.players[idx].inGame) return idx;
    }
    return null;
  };

  Engine.prototype.reverseDirection = function () {
    this.pushHistory();
    this.direction = this.direction === 1 ? -1 : 1;
  };

  /** Retire un joueur de la rotation (il a passé, ou il est éliminé). */
  Engine.prototype.setPlayerInGame = function (id, inGame) {
    var p = this.players[id];
    if (!p || p.inGame === inGame) return;
    this.pushHistory();
    p.inGame = inGame;

    // Le repère de comptage des manches doit rester sur un joueur actif.
    if (!this.players[this.roundStartIndex].inGame) {
      var n = this.players.length;
      for (var k = 1; k <= n; k++) {
        var idx = clampIndex(this.roundStartIndex + this.direction * k, n);
        if (this.players[idx].inGame) { this.roundStartIndex = idx; break; }
      }
    }

    // Si le joueur retiré était en train de jouer, on solde et on avance.
    if (!inGame && id === this.currentIndex) {
      var elapsed = this.elapsedThisTurn();
      p.totalMs += elapsed;
      var next = this.nextIndex();
      if (next === null || next === this.currentIndex) { this.finish(); return; }
      this.currentIndex = next;
      this.turnAccumMs = 0;
      this.turnResumedAt = this.now();
    }
  };

  Engine.prototype.finish = function () {
    if (this.state === 'finished') return;
    if (this.state === 'running') {
      this.turnAccumMs = this.elapsedThisTurn();
      var p = this.players[this.currentIndex];
      if (p) {
        p.totalMs += this.turnAccumMs;
        if (this.turnAccumMs > p.longestTurnMs) p.longestTurnMs = this.turnAccumMs;
        var over = Math.max(0, this.turnAccumMs - this.allowanceFor(p));
        p.overtimeMs += over;
      }
    }
    this.turnResumedAt = null;
    this.wallEndAt = this.now();
    this.state = 'finished';
  };

  // ---------------------------------------------------------------------------
  // Annulation
  // ---------------------------------------------------------------------------

  Engine.prototype.pushHistory = function () {
    this.history.push(this.serialize());
    if (this.history.length > UNDO_DEPTH) this.history.shift();
  };

  /**
   * Revient à l'état exact précédant la dernière action.
   * Le temps déjà consommé par le joueur précédent est restauré tel quel.
   */
  Engine.prototype.undo = function () {
    if (!this.history.length) return false;
    var snap = this.history.pop();
    var keep = this.history.slice();
    this.restore(snap);
    this.history = keep;
    // L'horloge redémarre à l'instant présent, sans perte ni gain de temps.
    if (this.state === 'running') this.turnResumedAt = this.now();
    return true;
  };

  // ---------------------------------------------------------------------------
  // Sauvegarde / reprise
  // ---------------------------------------------------------------------------

  var SAVED_FIELDS = [
    'mode', 'turnMs', 'bankMs', 'totalMs', 'incrementMs', 'warnMs',
    'state', 'direction', 'currentIndex', 'roundStartIndex', 'round',
    'turnAccumMs', 'wallStartAt', 'wallEndAt', 'pausedMs', 'pauseStartedAt'
  ];

  Engine.prototype.serialize = function () {
    var out = {};
    for (var i = 0; i < SAVED_FIELDS.length; i++) {
      out[SAVED_FIELDS[i]] = this[SAVED_FIELDS[i]];
    }
    // On fige le temps du tour en cours pour que la reprise soit exacte.
    out.turnAccumMs = this.elapsedThisTurn();
    out.players = this.players.map(function (p) {
      var c = {};
      for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) c[k] = p[k];
      return c;
    });
    return out;
  };

  Engine.prototype.restore = function (snap) {
    for (var i = 0; i < SAVED_FIELDS.length; i++) {
      var f = SAVED_FIELDS[i];
      if (snap[f] !== undefined) this[f] = snap[f];
    }
    this.players = snap.players.map(function (p) {
      var c = {};
      for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) c[k] = p[k];
      return c;
    });
    this.turnResumedAt = this.state === 'running' ? this.now() : null;
    return this;
  };

  Engine.fromSnapshot = function (snap, now) {
    var e = new Engine({ players: [], now: now });
    e.restore(snap);
    e.history = [];
    return e;
  };

  return Engine;
});
