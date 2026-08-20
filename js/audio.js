/*
 * ChronoJeu — sons, vibrations et retour haptique
 * ---------------------------------------------------------------------------
 * Les sons sont synthétisés par le navigateur (Web Audio API). Aucun fichier
 * audio à télécharger : l'application reste minuscule et fonctionne hors ligne.
 *
 * Deux pièges propres à iPhone, traités ici :
 *
 *   1. Safari refuse de produire du son tant que l'utilisateur n'a pas touché
 *      l'écran. On « débloque » donc le contexte audio au premier toucher.
 *
 *   2. Bien plus vicieux : le petit interrupteur latéral de l'iPhone coupe le
 *      Web Audio, même quand le volume est à fond. Le contournement connu
 *      consiste à jouer en parallèle un son silencieux dans une balise <audio> :
 *      iOS bascule alors sa session audio en mode « lecture », qui ignore
 *      l'interrupteur. C'est la technique de la bibliothèque unmute-ios-audio.
 *
 * La vibration, elle, n'a pas de solution propre : iOS n'expose pas l'API
 * Vibration aux applications web. On tente un contournement haptique, sans
 * garantie (voir plus bas).
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
  var haptic = null;
  var settings = { sound: true, vibration: true };
  var alarmTimer = null;

  function isIOS() {
    var nav = global.navigator;
    if (!nav) return false;
    return /iPad|iPhone|iPod/.test(nav.userAgent) ||
           (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  }

  function hasVibrationApi() {
    return !!(global.navigator && typeof global.navigator.vibrate === 'function');
  }

  function getCtx() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    return ctx;
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
    if (c.state !== 'running' && typeof c.resume === 'function') {
      try { c.resume(); } catch (e) { /* ignoré */ }
    }
    if (unlocked) return;

    // Un son inaudible suffit à débloquer Safari.
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
    if (c.state !== 'running' && typeof c.resume === 'function') {
      try { c.resume(); } catch (e) { /* ignoré */ }
    }

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
   * Retour haptique de secours pour iOS.
   *
   * Safari ne fournit pas l'API Vibration. Il existe un contournement connu :
   * basculer un <input type="checkbox" switch> déclenche un retour haptique.
   * Apple a restreint cette astuce à partir d'iOS 26.5, où elle n'agit plus que
   * sur une manipulation directe de l'utilisateur. On l'essaie donc sans
   * jamais compter dessus.
   */
  function iosHaptic() {
    if (!isIOS()) return;
    try {
      if (!haptic) {
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('switch', '');
        input.id = 'cj-haptic-switch';
        input.setAttribute('aria-hidden', 'true');
        input.tabIndex = -1;
        var label = document.createElement('label');
        label.htmlFor = 'cj-haptic-switch';
        label.setAttribute('aria-hidden', 'true');
        // Hors de l'écran plutôt que masqué : un élément en display:none ou
        // opacity:0 ne déclenche aucun retour haptique.
        var box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:-9999px;top:0;width:60px;height:40px;';
        box.appendChild(input); box.appendChild(label);
        (document.body || document.documentElement).appendChild(box);
        haptic = { input: input, label: label };
      }
      haptic.label.click();
    } catch (e) { /* sans importance */ }
  }

  function vibrate(pattern) {
    if (!settings.vibration) return;
    if (hasVibrationApi()) {
      try { global.navigator.vibrate(pattern); } catch (e) { /* ignoré */ }
      return;
    }
    if (pattern) iosHaptic();      // pattern nul = demande d'arrêt, rien à faire
  }

  var Sound = {

    configure: function (opts) {
      if (opts.sound !== undefined) settings.sound = !!opts.sound;
      if (opts.vibration !== undefined) settings.vibration = !!opts.vibration;
    },

    unlock: unlock,

    /** Passage au joueur suivant : clic discret. */
    pass: function () {
      tone(880, 0.06, 0, 0.2, 'triangle');
      vibrate(18);
    },

    /** Entrée dans le chaud time : deux notes descendantes, bien audibles. */
    warning: function () {
      tone(760, 0.14, 0, 0.42, 'square');
      tone(600, 0.2, 0.17, 0.42, 'square');
      vibrate([60, 70, 60]);
    },

    /** Temps écoulé : triple note urgente. */
    timeUp: function () {
      tone(520, 0.13, 0, 0.5, 'square');
      tone(520, 0.13, 0.19, 0.5, 'square');
      tone(400, 0.32, 0.38, 0.5, 'square');
      vibrate([120, 80, 120, 80, 220]);
    },

    /** Fin de partie : petit accord ascendant. */
    gameOver: function () {
      tone(523, 0.18, 0, 0.3, 'sine');
      tone(659, 0.18, 0.16, 0.3, 'sine');
      tone(784, 0.4, 0.32, 0.3, 'sine');
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
      if (hasVibrationApi()) {
        try { global.navigator.vibrate(0); } catch (e) { /* ignoré */ }
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

    /** État réel du son et de la vibration, pour le bouton de test. */
    diagnose: function () {
      return {
        audioSupported: !!(global.AudioContext || global.webkitAudioContext),
        contextState: ctx ? ctx.state : 'non créé',
        unlocked: unlocked,
        vibrationApi: hasVibrationApi(),
        ios: isIOS()
      };
    }
  };

  global.ChronoSound = Sound;
})(typeof self !== 'undefined' ? self : this);
