/*
 * ChronoJeu — sons et vibrations
 * ---------------------------------------------------------------------------
 * Les sons sont synthétisés par le navigateur (Web Audio API). Aucun fichier
 * audio n'est nécessaire : l'application reste minuscule et fonctionne hors
 * ligne sans rien télécharger.
 *
 * Piège iOS : Safari refuse de produire du son tant que l'utilisateur n'a pas
 * interagi avec la page. On « débloque » donc le contexte audio au tout premier
 * toucher, sinon le chaud time reste muet sur iPhone.
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var ctx = null;
  var unlocked = false;
  var settings = { sound: true, vibration: true };
  var alarmTimer = null;

  function getCtx() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    return ctx;
  }

  /** À appeler depuis un vrai geste utilisateur (clic, toucher). */
  function unlock() {
    var c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    if (unlocked) return;
    // Un son inaudible d'une milliseconde suffit à débloquer Safari.
    try {
      var o = c.createOscillator();
      var g = c.createGain();
      g.gain.value = 0.0001;
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + 0.001);
      unlocked = true;
    } catch (e) { /* sans importance */ }
  }

  /**
   * Joue une note.
   * @param freq  fréquence en Hz
   * @param dur   durée en secondes
   * @param delay décalage avant le début, en secondes
   * @param vol   volume de 0 à 1
   * @param type  forme d'onde
   */
  function tone(freq, dur, delay, vol, type) {
    if (!settings.sound) return;
    var c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume();

    var t0 = c.currentTime + (delay || 0);
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);

    // Enveloppe douce : évite le « clic » désagréable en début et fin de note.
    var peak = vol === undefined ? 0.28 : vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    o.connect(g); g.connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function vibrate(pattern) {
    if (!settings.vibration) return;
    if (global.navigator && typeof global.navigator.vibrate === 'function') {
      try { global.navigator.vibrate(pattern); } catch (e) { /* ignoré */ }
    }
  }

  var Sound = {

    configure: function (opts) {
      if (opts.sound !== undefined) settings.sound = !!opts.sound;
      if (opts.vibration !== undefined) settings.vibration = !!opts.vibration;
    },

    unlock: unlock,

    /** Passage au joueur suivant : clic discret. */
    pass: function () {
      tone(880, 0.06, 0, 0.16, 'triangle');
      vibrate(18);
    },

    /** Entrée dans le chaud time : deux notes descendantes, bien audibles. */
    warning: function () {
      tone(760, 0.14, 0, 0.3, 'square');
      tone(600, 0.2, 0.17, 0.3, 'square');
      vibrate([60, 70, 60]);
    },

    /** Temps écoulé : triple note urgente. */
    timeUp: function () {
      tone(520, 0.13, 0, 0.36, 'square');
      tone(520, 0.13, 0.19, 0.36, 'square');
      tone(400, 0.32, 0.38, 0.36, 'square');
      vibrate([120, 80, 120, 80, 220]);
    },

    /** Fin de partie : petit accord ascendant. */
    gameOver: function () {
      tone(523, 0.18, 0, 0.26, 'sine');
      tone(659, 0.18, 0.16, 0.26, 'sine');
      tone(784, 0.4, 0.32, 0.26, 'sine');
      vibrate([200, 100, 200]);
    },

    /**
     * Alarme répétée : utilisée en mode « par tour » quand le temps est écoulé.
     * Elle continue jusqu'à ce que quelqu'un touche l'écran.
     */
    startRepeatingAlarm: function () {
      if (alarmTimer !== null) return;
      Sound.timeUp();
      alarmTimer = global.setInterval(Sound.timeUp, 1800);
    },

    stopRepeatingAlarm: function () {
      if (alarmTimer !== null) {
        global.clearInterval(alarmTimer);
        alarmTimer = null;
      }
      vibrate(0);
    },

    isAlarmRunning: function () { return alarmTimer !== null; }
  };

  global.ChronoSound = Sound;
})(typeof self !== 'undefined' ? self : this);
