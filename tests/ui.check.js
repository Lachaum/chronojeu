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

  // ================= Placement des joueurs autour de l'écran =================
  // Test géométrique : on relève la position réelle de chaque bandeau à l'écran
  // et on vérifie que les joueurs se suivent bien en tournant autour du centre,
  // sans jamais se croiser. C'est ce qui attrape une tranche remplie à l'envers.
  const ringPage = await ctx.newPage();
  ringPage.on('pageerror', (e) => errors.push('pageerror(cercle): ' + e.message));
  await ringPage.goto(url, { waitUntil: 'networkidle' });
  await ringPage.waitForTimeout(300);
  if (await ringPage.isVisible('#btn-discard')) await ringPage.click('#btn-discard');

  function ringIsOrdered(angles) {
    const n = angles.length;
    const deltas = [];
    for (let i = 0; i < n; i++) {
      let d = angles[(i + 1) % n] - angles[i];
      while (d <= -Math.PI) d += 2 * Math.PI;
      while (d > Math.PI) d -= 2 * Math.PI;
      deltas.push(d);
    }
    const oneWay = deltas.every((d) => d > 0.05) || deltas.every((d) => d < -0.05);
    const turn = Math.abs(deltas.reduce((a, b) => a + b, 0));
    return oneWay && Math.abs(turn - 2 * Math.PI) < 0.35;
  }

  for (const n of [4, 5, 6, 7, 8]) {
    // ramener le compteur à n
    const current = (await ringPage.$$('#player-list .player-row')).length;
    for (let i = current; i < n; i++) { await ringPage.click('#count-plus'); }
    for (let i = current; i > n; i--) { await ringPage.click('#count-minus'); }
    await ringPage.waitForTimeout(120);
    await ringPage.click('#btn-start');
    await ringPage.waitForTimeout(450);

    const seats = await ringPage.evaluate(() => {
      const t = document.getElementById('table').getBoundingClientRect();
      const cx = t.left + t.width / 2, cy = t.top + t.height / 2;
      return Array.from(document.querySelectorAll('.band'))
        .sort((a, b) => (+a.dataset.seat) - (+b.dataset.seat))
        .map((b) => {
          const r = b.getBoundingClientRect();
          return {
            seat: +b.dataset.seat,
            side: b.dataset.side,
            angle: Math.atan2((r.top + r.height / 2) - cy, (r.left + r.width / 2) - cx)
          };
        });
    });

    check(`${n} joueurs : le tour de table suit bien le tour de l'écran`,
      seats.length === n && ringIsOrdered(seats.map((s) => s.angle)),
      seats.map((s) => s.seat + ':' + s.side + '@' + Math.round(s.angle * 57.3) + '°').join(' '));

    if (n === 6) await ringPage.screenshot({ path: path.join(SHOTS, '14-cercle-6-joueurs.png') });
    if (n === 8) await ringPage.screenshot({ path: path.join(SHOTS, '15-cercle-8-joueurs.png') });

    await ringPage.click('#btn-menu'); await ringPage.waitForTimeout(150);
    await ringPage.click('#btn-finish'); await ringPage.waitForTimeout(300);
    await ringPage.click('#btn-new'); await ringPage.waitForTimeout(200);
  }
  await ringPage.close();

  // ======================= Sirène et décompte sonore =========================
  const soundPage = await ctx.newPage();
  soundPage.on('pageerror', (e) => errors.push('pageerror(son): ' + e.message));
  await soundPage.goto(url, { waitUntil: 'networkidle' });
  await soundPage.waitForTimeout(300);
  if (await soundPage.isVisible('#btn-discard')) await soundPage.click('#btn-discard');

  // On observe les appels réels du moteur sonore.
  await soundPage.evaluate(() => {
    window.__ticks = [];
    window.__sirens = 0;
    const S = window.ChronoSound;
    const oc = S.countdown, ow = S.warning;
    S.countdown = function (n) { window.__ticks.push(n); return oc.call(S, n); };
    S.warning = function () { window.__sirens++; return ow.call(S); };
  });

  check('l\'alerte de chaud time est une sirène, pas un bip',
    await soundPage.evaluate(() => {
      window.ChronoSound.unlock();
      const ms = window.ChronoSound.warning();
      // Une sirène deux-tons dure plus d'une seconde et se signale comme active.
      return ms > 1000 && window.ChronoSound.isSirenPlaying();
    }));

  await soundPage.evaluate(() => { window.__ticks = []; window.__sirens = 0; });
  // Le mode est mémorisé d'une session à l'autre : on le fixe explicitement,
  // sinon un tour « avec banque » durerait plusieurs minutes et le test
  // mesurerait le vide.
  await soundPage.click('.mode[data-mode="perTurn"]');
  await soundPage.waitForTimeout(150);
  await soundPage.fill('.dur[data-key="turn"] .dur-min', '0');
  await soundPage.fill('.dur[data-key="turn"] .dur-sec', '8');
  await soundPage.fill('.dur[data-key="warn"] .dur-min', '0');
  await soundPage.fill('.dur[data-key="warn"] .dur-sec', '7');
  await soundPage.click('#btn-start');
  await soundPage.waitForTimeout(9200);

  const ticks = await soundPage.evaluate(() => window.__ticks);
  const sirens = await soundPage.evaluate(() => window.__sirens);
  check('la sirène retentit une seule fois à l\'entrée du chaud time',
    sirens === 1, 'sirènes = ' + sirens);
  check('les cinq dernières secondes sont égrenées : 5, 4, 3, 2, 1',
    JSON.stringify(ticks) === '[5,4,3,2,1]', 'obtenu ' + JSON.stringify(ticks));

  // Chaque seconde ne doit sonner qu'une fois, malgré les 60 images par seconde.
  await soundPage.evaluate(() => { window.__ticks = []; });
  await soundPage.tap('#tap-zone');
  await soundPage.waitForTimeout(9200);
  const ticks2 = await soundPage.evaluate(() => window.__ticks);
  check('le décompte repart proprement au tour suivant',
    JSON.stringify(ticks2) === '[5,4,3,2,1]', 'obtenu ' + JSON.stringify(ticks2));
  await soundPage.close();

  // ------------------------------------------------- simulation d'un iPhone
  const ctxIOS = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 ' +
               '(KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
  });
  const ios = await ctxIOS.newPage();
  ios.on('pageerror', (e) => errors.push('pageerror(iphone): ' + e.message));
  ios.on('console', (m) => { if (m.type() === 'error') errors.push('console(iphone): ' + m.text()); });
  await ios.goto(url, { waitUntil: 'networkidle' });
  await ios.waitForTimeout(400);

  check('iPhone : le bouton de test du son est présent', await ios.isVisible('#btn-test-sound'));
  check('iPhone : plus aucun réglage de vibration',
    (await ios.$$('#opt-vibration')).length === 0);
  check('iPhone : l\'interrupteur silencieux est signalé',
    (await ios.textContent('#sound-status')).indexOf('interrupteur') !== -1 ||
    (await ios.textContent('#sound-status')).indexOf('Touchez le bouton') !== -1);

  await ios.click('#btn-test-sound');
  await ios.waitForTimeout(600);
  const iosDiag = await ios.evaluate(() => window.ChronoSound.diagnose());
  check('iPhone : le test débloque le contexte audio',
    iosDiag.unlocked === true && iosDiag.contextState === 'running',
    JSON.stringify(iosDiag));
  check('iPhone : le son silencieux d\'amorçage est bien inséré',
    await ios.evaluate(() => !!document.querySelector('audio[playsinline]')));
  await ios.waitForTimeout(6200);
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
  await ios.screenshot({ path: path.join(SHOTS, '13-iphone-alarme.png') });

  // ---------------------------------------------------------------- conclusion
  const realErrors = errors.slice();
  check('aucune erreur JavaScript', realErrors.length === 0, realErrors.join(' | '));

  await browser.close();
  server.close();

  console.log('\n' + (problems ? problems + ' problème(s) détecté(s).' : 'Tout est conforme.') + '\n');
  process.exit(problems ? 1 : 0);
})();
