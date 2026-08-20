/*
 * ChronoJeu — sons
 * ---------------------------------------------------------------------------
 * Tous les sons sont synthétisés par le navigateur (Web Audio API). Aucun
 * fichier audio à télécharger : l'application reste minuscule et fonctionne
 * hors ligne sans rien récupérer.
 *
 * Deux pièges propres à iPhone, traités ici :
 *
 *   1. Safari refuse de produire du son tant que l'utilisateur n'a pas touché
 *      l'écran. On « débloque » donc le contexte audio au premier toucher.
 *
 *   2. Bien plus vicieux : le petit interrupteur latéral de l'iPhone coupe le
 *      Web Audio, même quand le volume est à fond. Le contournement consiste à
 *      jouer en parallèle un son silencieux dans une balise <audio> : iOS
 *      bascule alors sa session audio en mode « lecture », qui ignore
 *      l'interrupteur.
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  // 0,35 seconde de silence, en MP3. Sert uniquement à faire basculer la
  // session audio d'iOS ; il n'est jamais entendu.
  var SILENT_MP3 = 'data:audio/mpeg;base64,' +
    'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAAEAAA' +
    'AlgAWFhYWFhYZGRkZGRkb29vb29venp6enp6hYWFhYWFhZCQkJCQkJubm5ubm6ampqamprGxsbGxsbG9vb29vb3IyMjIyMjT' +
    '09PT09Pe3t7e3t7e6enp6enp9PT09PT0////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQDmgAAAAAAAAJYZ5zNfAAA' +
    'AAAAAAAAAAAAAAD/8xDEAAAAA0gAAAAATEFNRTMuMTAwVVVVVf/zEsQNAAADSAAAAABVVVVVVVVVVVVVVVVVVf/zEMQbAAAD' +
    'SAAAAABVVVVVVVVVVVVVVVVV//MQxCgAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDENQAAA0gAAAAAVVVVVVVVVVVVVVVVVf/z' +
    'EMRCAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxE8AAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDEXAAAA0gAAAAAVVVVVVVVVVVV' +
    'VVVVVf/zEMRpAAADSAAAAABVVVVVVVVVVVVVVVVV//MSxHYAAANIAAAAAFVVVVVVVVVVVVVVVVVV//MQxIQAAANIAAAAAFVV' +
    'VVVVVVVVVVVVVVX/8xDEkQAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMSeAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxKsAAANI' +
    'AAAAAFVVVVVVVVVVVVVVVVX/8xDEuAAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMTFAAADSAAAAABVVVVVVVVVVVVVVVVV';

  var ctx = null;
  var unlocked = false;
  var silentEl = null;
  var lastPrimeAt = 0;
  var settings = { sound: true };
  var alarmTimer = null;
  var sirenUntil = 0;      // instant de fin de la sirène en cours

  function isIOS() {
    var nav = global.navigator;
    if (!nav) return false;
    return /iPad|iPhone|iPod/.test(nav.userAgent) ||
           (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  }

  function getCtx() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    return ctx;
  }

  /** Le contexte doit tourner pour que la moindre note soit entendue. */
  function wake(c) {
    if (c.state !== 'running' && typeof c.resume === 'function') {
      try { c.resume(); } catch (e) { /* ignoré */ }
    }
  }

  /**
   * Joue le son silencieux. À appeler depuis un vrai geste de l'utilisateur :
   * c'est lui qui neutralise l'interrupteur silencieux de l'iPhone.
   */
  function primeSilentAudio() {
    var now = Date.now();
    if (now - lastPrimeAt < 900) return;   // inutile de le rejouer à chaque doigt
    lastPrimeAt = now;

    if (!silentEl) {
      silentEl = document.createElement('audio');
      silentEl.setAttribute('playsinline', '');
      silentEl.setAttribute('webkit-playsinline', '');
      silentEl.setAttribute('preload', 'auto');
      silentEl.src = SILENT_MP3;
      silentEl.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none';
      (document.body || document.documentElement).appendChild(silentEl);
    }
    try {
      silentEl.currentTime = 0;
      var p = silentEl.play();
      if (p && typeof p.catch === 'function') p.catch(function () { /* refusé : tant pis */ });
    } catch (e) { /* sans importance */ }
  }

  /** À appeler depuis un vrai geste utilisateur (toucher, clic). */
  function unlock() {
    primeSilentAudio();

    var c = getCtx();
    if (!c) return;
    wake(c);
    if (unlocked) return;

    try {
      var o = c.createOscillator();
      var g = c.createGain();
      g.gain.value = 0.0001;
      o.connect(g); g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.02);
      unlocked = true;
    } catch (e) { /* sans importance */ }
  }

  /**
   * Joue une note simple.
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
    wake(c);

    // Petite avance : si le contexte vient tout juste d'être relancé, une note
    // programmée pour « maintenant » serait purement et simplement perdue.
    var t0 = c.currentTime + (delay || 0) + 0.03;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);

    // Enveloppe douce : évite le « clic » désagréable en début et fin de note.
    var peak = vol === undefined ? 0.32 : vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    o.connect(g); g.connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  /**
   * Sirène deux-tons, à la française : le « pin-pon » des véhicules de police.
   *
   * Un seul oscillateur dont on fait basculer la fréquence, sans jamais couper
   * le son : c'est ce qui distingue une vraie sirène d'une suite de bips. Une
   * dent de scie passée dans un filtre passe-bas donne le timbre cuivré
   * caractéristique.
   *
   * @param cycles  nombre d'allers-retours pin-pon
   * @param seg     durée de chaque note, en secondes
   * @param vol     volume de 0 à 1
   */
  function siren(cycles, seg, vol) {
    if (!settings.sound) return 0;
    var c = getCtx();
    if (!c) return 0;
    wake(c);

    var HIGH = 622;   // ré#5 — le « pin »
    var LOW  = 466;   // la#4 — le « pon »
    var t0 = c.currentTime + 0.03;
    var t = t0;

    var o = c.createOscillator();
    o.type = 'sawtooth';
    for (var i = 0; i < cycles; i++) {
      o.frequency.setValueAtTime(HIGH, t); t += seg;
      o.frequency.setValueAtTime(LOW, t);  t += seg;
    }
    var end = t;

    // Le filtre arrondit la dent de scie, sinon le son est agressif et grésille.
    var filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, t0);
    filter.Q.setValueAtTime(0.9, t0);

    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.05);
    g.gain.setValueAtTime(vol, end - 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, end);

    o.connect(filter); filter.connect(g); g.connect(c.destination);
    o.start(t0);
    o.stop(end + 0.05);

    var durationMs = (end - t0) * 1000;
    sirenUntil = Date.now() + durationMs;
    return durationMs;
  }

  var Sound = {

    configure: function (opts) {
      if (opts.sound !== undefined) settings.sound = !!opts.sound;
    },

    unlock: unlock,

    /** Passage au joueur suivant : clic discret. */
    pass: function () {
      tone(880, 0.06, 0, 0.2, 'triangle');
    },

    /** Entrée dans le chaud time : sirène de police, deux allers-retours. */
    warning: function () {
      return siren(2, 0.42, 0.2);
    },

    /** Sirène en cours ? Sert à ne pas lui superposer le décompte. */
    isSirenPlaying: function () { return Date.now() < sirenUntil; },

    /**
     * Décompte des cinq dernières secondes : un bip par seconde, de plus en
     * plus aigu. Le dernier est plus long, pour qu'on l'entende venir.
     */
    countdown: function (secondsLeft) {
      var FREQ = { 5: 698, 4: 740, 3: 831, 2: 932, 1: 1047 };
      var f = FREQ[secondsLeft];
      if (!f) return;
      tone(f, secondsLeft === 1 ? 0.24 : 0.09, 0, 0.42, 'square');
    },

    /** Temps écoulé : triple note urgente. */
    timeUp: function () {
      tone(520, 0.13, 0, 0.5, 'square');
      tone(520, 0.13, 0.19, 0.5, 'square');
      tone(400, 0.32, 0.38, 0.5, 'square');
    },

    /** Fin de partie : petit accord ascendant. */
    gameOver: function () {
      tone(523, 0.18, 0, 0.3, 'sine');
      tone(659, 0.18, 0.16, 0.3, 'sine');
      tone(784, 0.4, 0.32, 0.3, 'sine');
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
    },

    isAlarmRunning: function () { return alarmTimer !== null; },

    /**
     * Branche le déblocage sur tous les gestes de l'utilisateur. iOS suspend le
     * contexte audio dès que l'application passe en arrière-plan ; le moindre
     * toucher le relance.
     */
    watchGestures: function () {
      ['pointerdown', 'touchend', 'click'].forEach(function (ev) {
        document.addEventListener(ev, unlock, { passive: true, capture: true });
      });
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) unlock();
      });
    },

    /** État réel du son, pour le bouton de test. */
    diagnose: function () {
      return {
        audioSupported: !!(global.AudioContext || global.webkitAudioContext),
        contextState: ctx ? ctx.state : 'non créé',
        unlocked: unlocked,
        ios: isIOS()
      };
    }
  };

  global.ChronoSound = Sound;
})(typeof self !== 'undefined' ? self : this);
