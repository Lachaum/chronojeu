/*
 * Tests du moteur de temps de ChronoJeu.
 * Lancer avec :  node tests/engine.test.js
 *
 * Le moteur reçoit une horloge factice, ce qui permet de simuler des parties
 * entières en quelques millisecondes et de vérifier que les temps sont exacts.
 */
'use strict';

var Engine = require('../js/engine.js');
var M = Engine.MODES;

// --- petit harnais de test -------------------------------------------------

var passed = 0, failed = 0, currentTest = '';

function test(name, fn) {
  currentTest = name;
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.log('  ✗ ' + name);
    console.log('      ' + e.message);
  }
}

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error((label || 'valeur') + ' : attendu ' + expected + ', obtenu ' + actual);
  }
}

function near(actual, expected, tol, label) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error((label || 'valeur') + ' : attendu ~' + expected + ' (±' + tol + '), obtenu ' + actual);
  }
}

function ok(cond, label) {
  if (!cond) throw new Error((label || 'condition') + ' : faux');
}

// --- horloge factice -------------------------------------------------------

function makeClock() {
  var t = 1000000;
  return {
    now: function () { return t; },
    advance: function (seconds) { t += Math.round(seconds * 1000); }
  };
}

function build(overrides) {
  var clock = makeClock();
  var cfg = Object.assign({
    mode: M.PER_TURN,
    turnSeconds: 60,
    warnSeconds: 10,
    players: [
      { name: 'Alice', color: '#f00' },
      { name: 'Bob', color: '#0f0' },
      { name: 'Chloé', color: '#00f' }
    ],
    now: clock.now
  }, overrides || {});
  var e = new Engine(cfg);
  e.start();
  return { e: e, clock: clock };
}

// ---------------------------------------------------------------------------
console.log('\nChronoJeu — tests du moteur\n');
console.log('Mode « temps par tour »');
// ---------------------------------------------------------------------------

test('le temps décompte et se remet à neuf au tour suivant', function () {
  var s = build();
  s.clock.advance(20);
  eq(s.e.view().remainingMs, 40000, 'restant après 20 s');
  s.e.pass();
  eq(s.e.view().remainingMs, 60000, 'restant du joueur suivant');
  eq(s.e.players[0].totalMs, 20000, 'total Alice');
  eq(s.e.view().currentIndex, 1, 'joueur actif');
});

test('le temps total cumule sur plusieurs tours', function () {
  var s = build();
  s.clock.advance(10); s.e.pass();   // Alice 10 s
  s.clock.advance(15); s.e.pass();   // Bob 15 s
  s.clock.advance(5);  s.e.pass();   // Chloé 5 s
  s.clock.advance(7);  s.e.pass();   // Alice +7 s
  eq(s.e.players[0].totalMs, 17000, 'total Alice');
  eq(s.e.players[1].totalMs, 15000, 'total Bob');
  eq(s.e.players[2].totalMs, 5000, 'total Chloé');
  eq(s.e.players[0].turns, 2, 'tours joués par Alice');
});

test('le chrono s\'arrête à zéro et compte le dépassement', function () {
  var s = build();
  s.clock.advance(75);
  var v = s.e.view();
  eq(v.remainingMs, 0, 'restant');
  eq(v.overtimeMs, 15000, 'dépassement');
  ok(v.isTimeOut, 'isTimeOut');
  ok(v.alarmRepeats, 'l\'alarme doit se répéter en mode par tour');
  s.e.pass();
  eq(s.e.players[0].expirations, 1, 'nombre de dépassements');
  eq(s.e.players[0].overtimeMs, 15000, 'dépassement cumulé');
  ok(!s.e.players[0].expired, 'pas d\'expiration définitive en mode par tour');
  eq(s.e.view().remainingMs, 60000, 'le joueur suivant repart à neuf');
});

test('le chaud time se déclenche au bon seuil', function () {
  var s = build();                       // 60 s par tour, chaud time 10 s
  s.clock.advance(49);
  ok(!s.e.view().isWarning, 'pas encore en chaud time à 11 s restantes');
  s.clock.advance(1);
  ok(s.e.view().isWarning, 'chaud time à 10 s restantes');
  s.clock.advance(9);
  ok(s.e.view().isWarning, 'toujours en chaud time à 1 s');
  s.clock.advance(1);
  ok(!s.e.view().isWarning, 'à zéro on n\'est plus en chaud time mais en temps écoulé');
  ok(s.e.view().isTimeOut, 'temps écoulé');
});

// ---------------------------------------------------------------------------
console.log('\nMode « par tour + banque »');
// ---------------------------------------------------------------------------

test('la banque n\'est entamée qu\'après le temps du tour', function () {
  var s = build({ mode: M.PER_TURN_BANK, turnSeconds: 60, bankSeconds: 120 });
  s.clock.advance(45);
  eq(s.e.view().usingBank, false, 'banque non entamée');
  eq(s.e.view().bankRemainingMs, 120000, 'banque intacte');
  s.e.pass();
  eq(s.e.players[0].bankRemainingMs, 120000, 'banque intacte après le tour');
});

test('le dépassement du tour puise dans la banque', function () {
  var s = build({ mode: M.PER_TURN_BANK, turnSeconds: 60, bankSeconds: 120 });
  s.clock.advance(90);
  var v = s.e.view();
  ok(v.usingBank, 'banque en cours d\'utilisation');
  eq(v.bankRemainingMs, 90000, 'banque restante en direct');
  eq(v.remainingMs, 90000, 'restant total = banque restante');
  s.e.pass();
  eq(s.e.players[0].bankRemainingMs, 90000, 'banque après le tour');
  // Au tour suivant d'Alice, l'allocation est de 60 s + les 90 s de banque.
  s.e.pass(); s.e.pass();
  eq(s.e.view().currentIndex, 0, 'retour sur Alice');
  eq(s.e.view().allowanceMs, 150000, 'allocation = tour + banque');
});

test('banque vide : le temps est écoulé et l\'alarme se répète', function () {
  var s = build({ mode: M.PER_TURN_BANK, turnSeconds: 30, bankSeconds: 20 });
  s.clock.advance(60);
  var v = s.e.view();
  eq(v.remainingMs, 0, 'restant');
  eq(v.overtimeMs, 10000, 'dépassement');
  eq(v.bankRemainingMs, 0, 'banque vidée');
  ok(v.alarmRepeats, 'alarme répétée');
  s.e.pass();
  eq(s.e.players[0].bankRemainingMs, 0, 'banque à zéro');
});

// ---------------------------------------------------------------------------
console.log('\nMode « budget total »');
// ---------------------------------------------------------------------------

test('le budget se consomme d\'un tour à l\'autre', function () {
  var s = build({ mode: M.TOTAL, totalSeconds: 300, turnSeconds: 0 });
  s.clock.advance(100);
  eq(s.e.view().remainingMs, 200000, 'restant en direct');
  s.e.pass();
  eq(s.e.players[0].budgetRemainingMs, 200000, 'budget après le tour');
  s.e.pass(); s.e.pass();
  eq(s.e.view().currentIndex, 0, 'retour sur Alice');
  eq(s.e.view().allowanceMs, 200000, 'allocation = budget restant');
});

test('budget épuisé : expiration définitive, alarme une seule fois', function () {
  var s = build({ mode: M.TOTAL, totalSeconds: 60 });
  s.clock.advance(80);
  var v = s.e.view();
  eq(v.overtimeMs, 20000, 'dépassement');
  ok(!v.alarmRepeats, 'l\'alarme ne doit PAS se répéter en mode budget');
  s.e.pass();
  ok(s.e.players[0].expired, 'joueur expiré');
  eq(s.e.players[0].budgetRemainingMs, 0, 'budget à zéro');
  s.e.pass(); s.e.pass();
  eq(s.e.view().currentIndex, 0, 'retour sur Alice');
  eq(s.e.view().allowanceMs, 0, 'plus aucune allocation');
  s.clock.advance(30);
  eq(s.e.view().overtimeMs, 30000, 'le dépassement continue de monter');
});

// ---------------------------------------------------------------------------
console.log('\nMode « incrément Fischer »');
// ---------------------------------------------------------------------------

test('l\'incrément est crédité en fin de tour', function () {
  var s = build({ mode: M.FISCHER, totalSeconds: 300, incrementSeconds: 10 });
  s.clock.advance(20);
  s.e.pass();
  eq(s.e.players[0].budgetRemainingMs, 290000, '300 - 20 + 10');
});

test('un tour plus court que l\'incrément fait gagner du temps', function () {
  var s = build({ mode: M.FISCHER, totalSeconds: 300, incrementSeconds: 10 });
  s.clock.advance(4);
  s.e.pass();
  eq(s.e.players[0].budgetRemainingMs, 306000, '300 - 4 + 10');
});

test('budget Fischer épuisé : plus d\'incrément', function () {
  var s = build({ mode: M.FISCHER, totalSeconds: 30, incrementSeconds: 10 });
  s.clock.advance(50);
  s.e.pass();
  ok(s.e.players[0].expired, 'joueur expiré');
  eq(s.e.players[0].budgetRemainingMs, 0, 'aucun incrément crédité');
  eq(s.e.players[0].overtimeMs, 20000, 'dépassement');
});

// ---------------------------------------------------------------------------
console.log('\nPause, annulation, rotation');
// ---------------------------------------------------------------------------

test('la pause ne consomme aucun temps', function () {
  var s = build();
  s.clock.advance(10);
  s.e.pause();
  s.clock.advance(600);              // 10 minutes de pause pizza
  eq(s.e.view().remainingMs, 50000, 'restant inchangé pendant la pause');
  s.e.resume();
  s.clock.advance(5);
  eq(s.e.view().remainingMs, 45000, 'restant après reprise');
  s.e.pass();
  eq(s.e.players[0].totalMs, 15000, 'total = 10 + 5, la pause exclue');
});

test('passer au joueur suivant pendant une pause relance l\'horloge', function () {
  var s = build();
  s.clock.advance(10);
  s.e.pause();
  s.clock.advance(100);
  s.e.pass();
  eq(s.e.view().state, 'running', 'partie relancée');
  eq(s.e.players[0].totalMs, 10000, 'total figé à 10 s');
});

test('l\'annulation restaure exactement l\'état précédent', function () {
  var s = build();
  s.clock.advance(23);
  var before = s.e.view();
  s.e.pass();                        // tap accidentel
  s.clock.advance(4);
  ok(s.e.view().canUndo, 'annulation possible');
  s.e.undo();
  var after = s.e.view();
  eq(after.currentIndex, before.currentIndex, 'retour sur le bon joueur');
  eq(after.remainingMs, before.remainingMs, 'temps restant restauré');
  eq(after.players[0].turns, before.players[0].turns, 'compteur de tours restauré');
  eq(s.e.players[1].totalMs, 0, 'le joueur suivant n\'a rien consommé');
  s.clock.advance(2);
  eq(s.e.view().remainingMs, 35000, 'le décompte repart correctement');
});

test('plusieurs annulations successives', function () {
  var s = build();
  s.clock.advance(10); s.e.pass();
  s.clock.advance(10); s.e.pass();
  s.clock.advance(10); s.e.pass();
  eq(s.e.view().currentIndex, 0, 'retour sur Alice');
  s.e.undo(); eq(s.e.view().currentIndex, 2, 'annulation 1');
  s.e.undo(); eq(s.e.view().currentIndex, 1, 'annulation 2');
  s.e.undo(); eq(s.e.view().currentIndex, 0, 'annulation 3');
  eq(s.e.players[0].totalMs, 0, 'Alice n\'a plus rien consommé');
  eq(s.e.view().canUndo, false, 'pile vide');
});

test('le compteur de tours de table avance correctement', function () {
  var s = build();
  eq(s.e.view().round, 1, 'tour 1');
  s.clock.advance(1); s.e.pass();
  s.clock.advance(1); s.e.pass();
  eq(s.e.view().round, 1, 'toujours tour 1');
  s.clock.advance(1); s.e.pass();
  eq(s.e.view().round, 2, 'tour 2 après un tour de table complet');
});

test('un joueur retiré est sauté', function () {
  var s = build({
    players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]
  });
  s.e.setPlayerInGame(2, false);       // C se retire
  s.clock.advance(5); s.e.pass();      // A -> B
  eq(s.e.view().currentIndex, 1, 'B joue');
  s.clock.advance(5); s.e.pass();      // B -> D (C sauté)
  eq(s.e.view().currentIndex, 3, 'C est sauté');
});

test('retirer le joueur actif solde son temps et passe au suivant', function () {
  var s = build();
  s.clock.advance(12);
  s.e.setPlayerInGame(0, false);
  eq(s.e.players[0].totalMs, 12000, 'temps soldé');
  eq(s.e.view().currentIndex, 1, 'passage au suivant');
});

test('l\'inversion du sens fonctionne', function () {
  var s = build();
  s.clock.advance(1); s.e.pass();      // A -> B
  eq(s.e.view().currentIndex, 1, 'B joue');
  s.e.reverseDirection();
  s.clock.advance(1); s.e.pass();      // B -> A
  eq(s.e.view().currentIndex, 0, 'retour vers A');
});

test('le handicap ajoute du temps au bon endroit', function () {
  var s = build({
    turnSeconds: 60,
    players: [{ name: 'Adulte' }, { name: 'Enfant', extraSeconds: 30 }]
  });
  eq(s.e.view().allowanceMs, 60000, 'adulte : 60 s');
  s.clock.advance(1); s.e.pass();
  eq(s.e.view().allowanceMs, 90000, 'enfant : 60 + 30 s');

  var b = build({
    mode: M.TOTAL, totalSeconds: 300,
    players: [{ name: 'Adulte' }, { name: 'Enfant', extraSeconds: 120 }]
  });
  eq(b.e.players[1].budgetRemainingMs, 420000, 'budget enfant = 300 + 120 s');
});

// ---------------------------------------------------------------------------
console.log('\nExactitude et robustesse');
// ---------------------------------------------------------------------------

test('partie longue : aucune dérive sur 500 tours', function () {
  var s = build({ turnSeconds: 60, players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] });
  var expected = [0, 0, 0, 0];
  var seed = 42;
  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }

  for (var i = 0; i < 500; i++) {
    var idx = s.e.view().currentIndex;
    var dur = Math.round(rnd() * 90 * 1000) / 1000;   // 0 à 90 s
    s.clock.advance(dur);
    expected[idx] += Math.round(dur * 1000);
    s.e.pass();
  }
  for (var k = 0; k < 4; k++) {
    eq(s.e.players[k].totalMs, expected[k], 'total du joueur ' + k);
  }
  var sum = s.e.players.reduce(function (a, p) { return a + p.totalMs; }, 0);
  var expSum = expected.reduce(function (a, b) { return a + b; }, 0);
  eq(sum, expSum, 'somme des temps');
  eq(s.e.view().round, 126, 'nombre de tours de table');
});

test('sauvegarde et reprise restituent l\'état exact', function () {
  var s = build({ mode: M.PER_TURN_BANK, turnSeconds: 60, bankSeconds: 120 });
  s.clock.advance(30); s.e.pass();
  s.clock.advance(80); s.e.pass();
  s.clock.advance(12);

  var snap = JSON.parse(JSON.stringify(s.e.serialize()));
  var restored = Engine.fromSnapshot(snap, s.clock.now);

  eq(restored.view().currentIndex, s.e.view().currentIndex, 'joueur actif');
  eq(restored.view().round, s.e.view().round, 'tour de table');
  eq(restored.view().remainingMs, s.e.view().remainingMs, 'temps restant');
  eq(restored.players[1].bankRemainingMs, s.e.players[1].bankRemainingMs, 'banque de Bob');
  eq(restored.players[0].totalMs, s.e.players[0].totalMs, 'total Alice');
});

test('la mise en veille prolongée du téléphone est correctement rattrapée', function () {
  // Le téléphone dort 3 minutes : le moteur doit s'en apercevoir au réveil.
  var s = build({ mode: M.TOTAL, totalSeconds: 600 });
  s.clock.advance(180);
  eq(s.e.view().remainingMs, 420000, 'temps rattrapé sans aucun tic d\'horloge');
});

test('une partie à 2 joueurs alterne correctement', function () {
  var s = build({ players: [{ name: 'A' }, { name: 'B' }] });
  s.clock.advance(5); s.e.pass();
  eq(s.e.view().currentIndex, 1);
  s.clock.advance(5); s.e.pass();
  eq(s.e.view().currentIndex, 0);
  eq(s.e.view().round, 2);
});

test('la fin de partie solde le tour en cours', function () {
  var s = build();
  s.clock.advance(10); s.e.pass();
  s.clock.advance(25);
  s.e.finish();
  eq(s.e.players[1].totalMs, 25000, 'tour en cours soldé');
  eq(s.e.view().state, 'finished', 'état terminé');
  var before = s.e.players[1].totalMs;
  s.clock.advance(100);
  eq(s.e.players[1].totalMs, before, 'plus rien ne bouge après la fin');
});

// ---------------------------------------------------------------------------

console.log('\n' + passed + ' test(s) réussi(s), ' + failed + ' échec(s).\n');
process.exit(failed ? 1 : 0);
