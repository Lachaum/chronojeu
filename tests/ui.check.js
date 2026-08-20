/*
 * Contrôle visuel et fonctionnel de l'interface, dans un vrai navigateur.
 * Lancer avec :  node tests/ui.check.js
 * (nécessite Playwright ; sert uniquement à la vérification, l'application
 *  elle-même n'a besoin d'aucune dépendance)
 */
'use strict';

const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require(process.env.PW || 'playwright');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'tests', 'shots');
const PORT = 8123;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('nope'); return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, () => resolve(server));
  });
}

let problems = 0;
function check(label, condition, detail) {
  if (condition) { console.log('  ✓ ' + label); }
  else { problems++; console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch();

  const errors = [];
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const url = `http://localhost:${PORT}/`;

  console.log('\nChronoJeu — contrôle de l\'interface\n');

  // ---------------------------------------------------------------- réglages
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  check('la page se charge', await page.isVisible('#screen-setup'));
  check('4 joueurs par défaut', (await page.$$('#player-list .player-row')).length === 4);
  check('les 4 modes de temps sont proposés', (await page.$$('.mode')).length === 4);
  check('les durées du mode « par tour » sont visibles',
    await page.isVisible('.field[data-for="perTurn perTurnBank"]'));
  check('les durées du mode Fischer sont masquées',
    !(await page.isVisible('.field[data-for="fischer"]')));
  await page.screenshot({ path: path.join(SHOTS, '1-reglages.png'), fullPage: true });

  // bascule de mode
  await page.click('.mode[data-mode="fischer"]');
  await page.waitForTimeout(150);
  check('changer de mode révèle l\'incrément', await page.isVisible('.field[data-for="fischer"]'));
  check('changer de mode masque le temps par tour',
    !(await page.isVisible('.field[data-for="perTurn perTurnBank"]')));
  await page.click('.mode[data-mode="perTurn"]');

  // durée courte pour tester le chaud time rapidement
  await page.fill('.dur[data-key="turn"] .dur-min', '0');
  await page.fill('.dur[data-key="turn"] .dur-sec', '8');
  await page.fill('.dur[data-key="warn"] .dur-min', '0');
  await page.fill('.dur[data-key="warn"] .dur-sec', '4');
  await page.fill('#player-list .player-row:nth-child(1) input.input', 'Aurélien');
  await page.fill('#player-list .player-row:nth-child(2) input.input', 'Camille');

  // ------------------------------------------------------------------ partie
  await page.click('#btn-start');
  await page.waitForTimeout(400);
  check('l\'écran de partie s\'affiche', await page.isVisible('#screen-game'));
  check('4 bandeaux joueurs sont créés', (await page.$$('.band')).length === 4);
  check('le nom saisi est repris', (await page.textContent('#center-name')) === 'Aurélien');
  check('le compteur de tours démarre à 1', (await page.textContent('#round-num')) === '1');

  const rails = await page.evaluate(() => ({
    bottom: document.querySelectorAll('#rail-bottom .band').length,
    right: document.querySelectorAll('#rail-right .band').length,
    top: document.querySelectorAll('#rail-top .band').length,
    left: document.querySelectorAll('#rail-left .band').length
  }));
  check('à 4 joueurs, un bandeau par côté',
    rails.bottom === 1 && rails.right === 1 && rails.top === 1 && rails.left === 1,
    JSON.stringify(rails));

  const railLen = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--rail-len').trim());
  check('les bandeaux latéraux sont dimensionnés', parseInt(railLen, 10) > 100, railLen);

  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SHOTS, '2-partie-4-joueurs.png') });

  // passage au joueur suivant
  await page.tap('#tap-zone');
  await page.waitForTimeout(200);
  check('le tap passe au joueur suivant', (await page.textContent('#center-name')) === 'Camille');
  const undoDisabled = await page.getAttribute('#btn-undo', 'disabled');
  check('l\'annulation devient disponible', undoDisabled === null);

  // annulation
  await page.click('#btn-undo');
  await page.waitForTimeout(150);
  check('l\'annulation ramène au joueur précédent',
    (await page.textContent('#center-name')) === 'Aurélien');

  // chaud time (8 s de tour, alerte à 4 s)
  await page.waitForTimeout(5200);
  check('l\'horloge passe au rouge en chaud time',
    await page.evaluate(() => document.getElementById('screen-game').classList.contains('is-warning')));
  await page.screenshot({ path: path.join(SHOTS, '3-chaud-time.png') });

  // temps écoulé
  await page.waitForTimeout(4200);
  check('le temps écoulé est signalé',
    await page.evaluate(() => document.getElementById('screen-game').classList.contains('is-timeout')));
  check('le chrono affiche bien zéro', (await page.textContent('#center-time')) === '0.0');
  await page.screenshot({ path: path.join(SHOTS, '4-temps-ecoule.png') });

  // pause
  await page.click('#btn-pause');
  await page.waitForTimeout(200);
  check('le voile de pause apparaît', await page.isVisible('#pause-overlay'));
  await page.screenshot({ path: path.join(SHOTS, '5-pause.png') });
  await page.click('#btn-resume-game');
  await page.waitForTimeout(150);
  check('la reprise referme le voile', !(await page.isVisible('#pause-overlay')));

  // menu et retrait d'un joueur
  await page.click('#btn-menu');
  await page.waitForTimeout(200);
  check('le menu liste tous les joueurs', (await page.$$('#menu-players .menu-player')).length === 4);
  await page.screenshot({ path: path.join(SHOTS, '6-menu.png') });
  await page.click('#menu-players .menu-player:nth-child(3) button');
  await page.waitForTimeout(200);
  check('un joueur retiré est barré',
    await page.evaluate(() =>
      document.querySelectorAll('#menu-players .menu-player')[2].classList.contains('is-out')));
  await page.click('#btn-menu-close');
  await page.waitForTimeout(150);
  // Régression : après avoir retiré un joueur, la partie doit être relancée.
  // Si elle restait en pause, le tap suivant ne ferait rien.
  await page.tap('#tap-zone'); await page.waitForTimeout(300);
  check('fermer le menu relance bien la partie (le tap répond)',
    (await page.textContent('#center-name')) === 'Camille',
    'obtenu « ' + (await page.textContent('#center-name')) + ' »');
  await page.tap('#tap-zone'); await page.waitForTimeout(300);
  check('le 3e joueur retiré est sauté', (await page.textContent('#center-name')) === 'Joueur 4');

  // ------------------------------------------------------------- fin de partie
  await page.tap('#tap-zone'); await page.waitForTimeout(300);
  await page.click('#btn-menu'); await page.waitForTimeout(200);
  await page.click('#btn-finish');
  await page.waitForTimeout(400);
  check('l\'écran de fin s\'affiche', await page.isVisible('#screen-end'));
  check('le tableau contient une ligne par joueur',
    (await page.$$('#stats-table tbody tr')).length === 4);
  check('les faits marquants sont calculés',
    (await page.$$('#end-highlights .highlight')).length >= 5,
    'seulement ' + (await page.$$('#end-highlights .highlight')).length);
  await page.screenshot({ path: path.join(SHOTS, '7-fin-de-partie.png'), fullPage: true });

  // ------------------------------------------- reprise d'une partie + 6 joueurs
  await page.click('#btn-new');
  await page.waitForTimeout(200);
  for (let i = 0; i < 2; i++) { await page.click('#count-plus'); await page.waitForTimeout(80); }
  check('on peut monter à 6 joueurs', (await page.$$('#player-list .player-row')).length === 6);
  await page.click('.mode[data-mode="perTurnBank"]');
  await page.waitForTimeout(120);
  await page.click('#btn-start');
  await page.waitForTimeout(700);
  const rails6 = await page.evaluate(() => ({
    bottom: document.querySelectorAll('#rail-bottom .band').length,
    right: document.querySelectorAll('#rail-right .band').length,
    top: document.querySelectorAll('#rail-top .band').length,
    left: document.querySelectorAll('#rail-left .band').length
  }));
  check('à 6 joueurs : 2 en bas, 2 en haut, 1 de chaque côté',
    rails6.bottom === 2 && rails6.top === 2 && rails6.left === 1 && rails6.right === 1,
    JSON.stringify(rails6));
  check('le mode banque est affiché dans la zone centrale',
    (await page.textContent('#center-sub')).indexOf('Banque') === 0);
  await page.screenshot({ path: path.join(SHOTS, '8-partie-6-joueurs.png') });

  // reprise après fermeture
  await page.tap('#tap-zone'); await page.waitForTimeout(200);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  check('une partie interrompue est proposée à la reprise',
    await page.isVisible('#resume-card'));
  await page.screenshot({ path: path.join(SHOTS, '9-reprise.png'), fullPage: true });
  await page.click('#btn-resume');
  await page.waitForTimeout(400);
  check('la reprise redémarre en pause', await page.isVisible('#pause-overlay'));
  check('la reprise conserve le bon joueur',
    (await page.textContent('#center-name')) === 'Camille',
    'obtenu « ' + (await page.textContent('#center-name')) + ' »');

  // ---------------------------------------------------------- 2 joueurs, tablette
  const ctx2 = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2 });
  const page2 = await ctx2.newPage();
  page2.on('pageerror', (e) => errors.push('pageerror(tablette): ' + e.message));
  await page2.goto(url, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(300);
  if (await page2.isVisible('#btn-discard')) await page2.click('#btn-discard');
  await page2.click('#count-minus'); await page2.click('#count-minus');
  await page2.click('#count-minus'); await page2.click('#count-minus');
  check('on peut descendre à 2 joueurs', (await page2.$$('#player-list .player-row')).length === 2);
  await page2.click('#btn-start');
  await page2.waitForTimeout(600);
  const rails2 = await page2.evaluate(() => ({
    bottom: document.querySelectorAll('#rail-bottom .band').length,
    top: document.querySelectorAll('#rail-top .band').length
  }));
  check('à 2 joueurs : face à face', rails2.bottom === 1 && rails2.top === 1, JSON.stringify(rails2));

  // Régression : sans rail latéral, la zone centrale doit occuper toute la largeur.
  const widths = await page2.evaluate(() => ({
    center: document.getElementById('tap-zone').getBoundingClientRect().width,
    table: document.getElementById('table').getBoundingClientRect().width
  }));
  check('la zone centrale occupe toute la largeur disponible',
    widths.center / widths.table > 0.9,
    Math.round(widths.center) + ' / ' + Math.round(widths.table) + ' px');
  await page2.screenshot({ path: path.join(SHOTS, '10-tablette-2-joueurs.png') });

  // Paysage : le cas typique du téléphone posé entre deux joueurs.
  await page2.setViewportSize({ width: 900, height: 500 });
  await page2.waitForTimeout(400);
  const land = await page2.evaluate(() => ({
    center: document.getElementById('tap-zone').getBoundingClientRect(),
    table: document.getElementById('table').getBoundingClientRect()
  }));
  check('en paysage, la zone centrale reste au centre',
    land.center.width / land.table.width > 0.9 && land.center.height > 200,
    Math.round(land.center.width) + '×' + Math.round(land.center.height));
  await page2.screenshot({ path: path.join(SHOTS, '11-paysage.png') });

  // ------------------------------------------------- simulation d'un iPhone
  // On rejoue le parcours avec l'identité d'un iPhone et sans API Vibration,
  // pour vérifier que ChronoJeu le dit franchement et compense visuellement.
  const ctxIOS = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 ' +
               '(KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
  });
  await ctxIOS.addInitScript(() => {
    // Safari sur iPhone n'expose pas l'API Vibration.
    try { delete Navigator.prototype.vibrate; } catch (e) { /* ignoré */ }
    Object.defineProperty(navigator, 'vibrate', { get: () => undefined, configurable: true });
  });
  const ios = await ctxIOS.newPage();
  ios.on('pageerror', (e) => errors.push('pageerror(iphone): ' + e.message));
  ios.on('console', (m) => { if (m.type() === 'error') errors.push('console(iphone): ' + m.text()); });
  await ios.goto(url, { waitUntil: 'networkidle' });
  await ios.waitForTimeout(400);

  check('iPhone : l\'API Vibration est bien absente',
    await ios.evaluate(() => typeof navigator.vibrate !== 'function'));
  check('iPhone : le bouton de test du son est présent', await ios.isVisible('#btn-test-sound'));
  check('iPhone : l\'absence de vibration est annoncée',
    (await ios.textContent('#vibration-note')).indexOf('iOS') !== -1,
    'note = « ' + (await ios.textContent('#vibration-note')) + ' »');
  check('iPhone : le diagnostic explique la situation',
    (await ios.textContent('#sound-status')).indexOf('iOS ne la propose pas') !== -1);

  await ios.click('#btn-test-sound');
  await ios.waitForTimeout(1700);
  const iosDiag = await ios.evaluate(() => window.ChronoSound.diagnose());
  check('iPhone : le test débloque le contexte audio',
    iosDiag.unlocked === true && iosDiag.contextState === 'running',
    JSON.stringify(iosDiag));
  check('iPhone : le son silencieux d\'amorçage est bien inséré',
    await ios.evaluate(() => !!document.querySelector('audio[playsinline]')));
  check('iPhone : le diagnostic confirme le son actif',
    (await ios.textContent('#sound-status')).indexOf('Son actif') !== -1);
  await ios.screenshot({ path: path.join(SHOTS, '12-iphone-diagnostic.png'), fullPage: true });

  // alarme visuelle, seul signal fiable sur iPhone
  await ios.fill('.dur[data-key="turn"] .dur-min', '0');
  await ios.fill('.dur[data-key="turn"] .dur-sec', '3');
  await ios.fill('.dur[data-key="warn"] .dur-min', '0');
  await ios.fill('.dur[data-key="warn"] .dur-sec', '2');
  await ios.click('#btn-start');
  await ios.waitForTimeout(4200);
  check('iPhone : le temps écoulé déclenche l\'alarme visuelle',
    await ios.evaluate(() => {
      const s = document.getElementById('screen-game');
      const f = document.getElementById('alarm-flash');
      return s.classList.contains('is-timeout') &&
             getComputedStyle(f).animationName === 'alarmflash';
    }));
  check('iPhone : le retour haptique de secours est tenté',
    await ios.evaluate(() => !!document.querySelector('input[switch][type="checkbox"]')));
  await ios.screenshot({ path: path.join(SHOTS, '13-iphone-alarme.png') });

  // ---------------------------------------------------------------- conclusion
  // Chromium journalise un avertissement quand navigator.vibrate est appelé
  // avant qu'il ait enregistré un vrai tap. C'est une information du navigateur,
  // pas un défaut : l'appel est protégé et, sur un téléphone, l'utilisateur a
  // forcément touché l'écran avant que le chrono ne sonne.
  const realErrors = errors.filter((e) => e.indexOf('Blocked call to navigator.vibrate') === -1);
  check('aucune erreur JavaScript', realErrors.length === 0, realErrors.join(' | '));

  await browser.close();
  server.close();

  console.log('\n' + (problems ? problems + ' problème(s) détecté(s).' : 'Tout est conforme.') + '\n');
  process.exit(problems ? 1 : 0);
})();
