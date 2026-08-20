# ChronoJeu

**L'horloge des jeux de société.** Une horloge d'échecs pensée pour les parties
à 2 à 8 joueurs : on pose le téléphone à plat au centre de la table, chacun voit
son bandeau orienté vers lui, et on touche l'écran pour passer au joueur suivant.

Application web installable (PWA) : aucun compte, aucun serveur, aucune donnée
qui sort de l'appareil, et elle fonctionne sans connexion.

👉 **Pour la mettre en ligne, suivez [GUIDE-GITHUB.md](GUIDE-GITHUB.md).**

---

## Fonctionnalités

**Les quatre modes de temps**, au choix avant chaque partie :

| Mode | Principe | Pour quels jeux |
|---|---|---|
| **Temps par tour** | X secondes par tour, remises à neuf à chaque passage | Jeux à tours réguliers : Catan, Carcassonne, 7 Wonders |
| **Temps par tour + banque** | X par tour, plus une réserve personnelle où puiser librement | Jeux à tours inégaux : Terraforming Mars, Twilight Imperium |
| **Budget total** | Un capital unique pour toute la partie, comme aux échecs | Jeux à deux, duels tendus |
| **Incrément Fischer** | Un budget total, augmenté de quelques secondes à chaque fin de tour | Longues parties qu'on ne veut pas voir s'étrangler |

**Pendant la partie**

- Décompte en direct, avec les dixièmes de seconde sous les dix dernières secondes
- **Chaud time** : l'horloge devient rouge et un signal sonore retentit quand le
  temps restant descend sous le seuil choisi
- Temps écoulé : le chrono s'arrête à zéro et l'alarme se répète jusqu'à ce que
  quelqu'un touche l'écran (en modes *budget total* et *Fischer*, où le temps est
  épuisé pour toute la partie, l'alarme ne sonne qu'une fois et le dépassement
  continue d'être compté)
- Temps total de chaque joueur affiché en direct sur son bandeau
- Compteur de tours de table, et compteur de tours par joueur
- **Annulation** : un tap accidentel se corrige en un geste, les temps sont
  restaurés à la milliseconde près
- Pause avec écran verrouillé
- Inversion du sens du jeu
- Retrait d'un joueur en cours de partie (il a passé, ou il est éliminé)
- Vibration en complément du son, écran maintenu allumé

**Avant et après**

- Noms et couleurs de joueurs
- Handicaps : du temps en plus pour un enfant ou un débutant
- Configurations enregistrées par jeu (« Catan », « Terraforming »…)
- Reprise automatique d'une partie interrompue
- Écran de fin : temps total, moyenne par tour, tour le plus long, dépassements,
  durée de la partie, le plus rapide et le plus lent de la tablée

---

## Comment ça marche

Posez le téléphone **à plat au centre de la table**. Les joueurs sont répartis
automatiquement autour de l'écran, dans l'ordre du tour de table, et chaque
bandeau est pivoté vers son propriétaire. La grande zone centrale affiche le
joueur actif dans son orientation à lui.

Pour passer au joueur suivant : **touchez la zone centrale**. N'importe qui peut
le faire — et si c'est une erreur, le bouton d'annulation la répare.

Un appui long sur un bandeau ouvre le menu des joueurs.

---

## Structure du projet

```
index.html                page unique contenant les trois écrans
manifest.webmanifest      identité de l'application installable
sw.js                     fonctionnement hors connexion
css/style.css             toute la mise en forme
js/engine.js              le moteur de temps — aucune dépendance à l'écran
js/audio.js               sons synthétisés et vibrations
js/storage.js             mémoire locale (réglages, configurations, reprise)
js/app.js                 interface et orchestration
icons/                    icônes de l'application
tests/engine.test.js      tests du moteur de temps (Node)
tests/ui.check.js         contrôle de l'interface dans un vrai navigateur
```

Aucune dépendance, aucune étape de compilation, aucun `npm install` : ce sont
des fichiers que le navigateur lit tels quels. Pour essayer l'application,
double-cliquez sur `index.html`.

---

## Choix techniques

**Le temps n'est jamais compté en additionnant des intervalles.** Le moteur
mémorise un horodatage et calcule l'écart avec l'instant présent. C'est ce qui
garantit l'exactitude au bout de deux heures de partie, et ce qui permet de
rattraper correctement une mise en veille du téléphone : au réveil, le temps
écoulé est simplement recalculé.

**Le moteur ne connaît rien de l'écran.** `engine.js` est un module autonome,
testable en dehors du navigateur, ce qui permet de simuler des parties de
plusieurs heures en quelques millisecondes et de vérifier que les totaux tombent
juste à la milliseconde.

**Les sons sont synthétisés**, pas téléchargés : aucun fichier audio, donc une
application minuscule qui fonctionne hors ligne sans rien récupérer.

---

## Son et vibration sur iPhone

Deux limites d'iOS méritent d'être connues, parce qu'elles ne viennent pas de
ChronoJeu.

**Le son.** Safari refuse tout son tant que l'utilisateur n'a pas touché
l'écran : ChronoJeu débloque donc l'audio au premier toucher. Plus gênant,
**le petit interrupteur latéral de l'iPhone coupe le son des pages web**, même
avec le volume à fond. ChronoJeu applique le contournement connu — jouer en
parallèle un son silencieux dans une balise `<audio>`, ce qui fait basculer la
session audio d'iOS en mode « lecture » — mais si vous n'entendez rien,
**vérifiez cet interrupteur en premier**.

Le bouton **« Tester le son et la vibration »**, dans les réglages, joue les
deux alertes et affiche l'état réel de l'audio.

**La vibration.** Safari sur iPhone n'expose pas l'API Vibration aux
applications web : il n'existe aucun moyen propre de faire vibrer le téléphone
depuis une page. ChronoJeu tente un contournement haptique connu (basculer un
`<input type="checkbox" switch>`), qu'Apple a restreint à partir d'iOS 26.5 —
autant dire qu'il ne faut pas compter dessus.

C'est pourquoi **l'alarme est aussi visuelle** : l'écran entier bat en rouge
quand le temps est écoulé. C'est le seul signal sur lequel on puisse compter
partout, iPhone en mode silencieux compris.

Sur Android, son et vibration fonctionnent normalement.

---

## Lancer les tests

```bash
node tests/engine.test.js      # 26 tests du moteur de temps
node tests/ui.check.js         # contrôle du rendu (nécessite Playwright)
```

Le premier ne demande rien d'autre que Node. Le second ouvre un vrai navigateur,
joue une partie complète et dépose des captures d'écran dans `tests/shots/`.

---

## Licence

Faites-en ce que vous voulez.
