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
- **Chaud time** : l'horloge devient rouge et une **sirène de police deux-tons**
  retentit quand le temps restant descend sous le seuil choisi
- **Décompte sonore des cinq dernières secondes** : un bip par seconde, de plus
  en plus aigu
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
- Alarme visuelle : l'écran bat en rouge quand le temps est écoulé
- Écran maintenu allumé pendant toute la partie

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
js/audio.js               sons synthétisés (sirène, décompte, alarmes)
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

## Les alertes sonores

Tous les sons sont fabriqués à la volée par le navigateur, sans le moindre
fichier audio.

- **Sirène de chaud time** : le « pin-pon » des véhicules de police français,
  deux allers-retours entre 622 et 466 Hz. Un seul oscillateur dont on fait
  basculer la fréquence sans jamais couper le son — c'est ce qui distingue une
  vraie sirène d'une suite de bips. Une dent de scie passée dans un filtre
  passe-bas lui donne son timbre cuivré.
- **Décompte des cinq dernières secondes** : un bip par seconde, de 698 Hz à
  1047 Hz, le dernier plus long. Il ne se superpose jamais à la sirène.
- **Temps écoulé** : triple note urgente, répétée jusqu'à ce que quelqu'un
  touche l'écran (une seule fois en modes *budget total* et *Fischer*, où le
  temps est épuisé pour toute la partie).

## Le son sur iPhone

Safari refuse tout son tant que l'utilisateur n'a pas touché l'écran :
ChronoJeu débloque donc l'audio au premier toucher. Plus gênant, **le petit
interrupteur latéral de l'iPhone coupe le son des pages web**, même avec le
volume à fond. ChronoJeu applique le contournement connu — jouer en parallèle
un son silencieux dans une balise `<audio>`, ce qui fait basculer la session
audio d'iOS en mode « lecture » — mais si vous n'entendez rien, **vérifiez cet
interrupteur en premier**.

Le bouton **« Tester les alertes sonores »**, dans les réglages, joue la sirène,
le décompte et l'alarme, puis affiche l'état réel de l'audio.

C'est aussi pourquoi **l'alarme est doublée visuellement** : l'écran entier bat
en rouge quand le temps est écoulé. C'est le seul signal sur lequel on puisse
compter partout, iPhone en mode silencieux compris.

> ChronoJeu ne fait pas vibrer le téléphone : Safari sur iPhone n'expose pas
> l'API Vibration aux applications web, et une fonction qui ne marche que sur
> la moitié des appareils vaut moins qu'une alarme visuelle qui marche sur
> tous.

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
