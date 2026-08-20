# Mettre ChronoJeu en ligne sur GitHub

Objectif : obtenir une adresse du type `https://VOTRE-PSEUDO.github.io/chronojeu/`
que vous pourrez ouvrir sur n'importe quel téléphone et installer comme une
véritable application.

Comptez **dix minutes**. Aucune ligne de commande n'est nécessaire : tout se
fait depuis le site de GitHub. La méthode en ligne de commande est donnée à la
fin pour ceux qui préfèrent.

---

## Avant de commencer

Décompressez `ChronoJeu.zip`. Vous obtenez un dossier `chronojeu` contenant :

```
index.html
manifest.webmanifest
sw.js
css/
icons/
js/
tests/
README.md
GUIDE-GITHUB.md
```

> **Point important**, celui sur lequel tout le monde trébuche : c'est le
> **contenu** de ce dossier qui doit se retrouver à la racine du dépôt, pas le
> dossier lui-même. Autrement dit, `index.html` doit être visible dès la page
> d'accueil du dépôt. Si vous voyez un dossier `chronojeu` à l'intérieur de
> votre dépôt `chronojeu`, l'adresse du site ne fonctionnera pas.

---

## Étape 1 — Créer le dépôt

1. Connectez-vous sur [github.com](https://github.com).
2. En haut à droite, cliquez sur le **+** puis sur **New repository**.
3. Remplissez :
   - **Repository name** : `chronojeu`
   - **Description** (facultatif) : `Horloge de jeux de société, 2 à 8 joueurs`
   - **Public** ← *obligatoire*. Sur un compte gratuit, GitHub Pages ne
     publie que les dépôts publics ; un dépôt privé demande un abonnement Pro.
   - Ne cochez **rien** dans « Initialize this repository » (pas de README,
     pas de .gitignore, pas de licence). Le dépôt doit rester vide.
4. Cliquez sur **Create repository**.

---

## Étape 2 — Envoyer les fichiers

Sur la page qui s'affiche, cliquez sur le lien **uploading an existing file**
(ou allez dans l'onglet **Add file › Upload files**).

1. Ouvrez le dossier `chronojeu` sur votre ordinateur.
2. Sélectionnez **tout ce qu'il contient** : `index.html`, `manifest.webmanifest`,
   `sw.js`, `README.md`, `GUIDE-GITHUB.md`, et les dossiers `css`, `icons`,
   `js`, `tests`.
   *(Sur Windows : Ctrl + A dans le dossier. Sur Mac : Cmd + A.)*
3. Faites-les glisser dans la zone de dépôt de la page GitHub.
4. Patientez jusqu'à ce que tous les fichiers apparaissent dans la liste.
5. Plus bas, dans **Commit changes**, écrivez par exemple
   `Première version de ChronoJeu`.
6. Cliquez sur **Commit changes**.

Vérifiez : la page d'accueil du dépôt doit maintenant afficher `index.html`
directement, à côté des dossiers `css`, `icons` et `js`.

---

## Étape 3 — Activer GitHub Pages

1. Dans le dépôt, cliquez sur l'onglet **Settings** (la roue dentée, en haut).
2. Dans le menu de gauche, cliquez sur **Pages**.
3. Section **Build and deployment** :
   - **Source** : `Deploy from a branch`
   - **Branch** : `main`, et le dossier `/ (root)`
4. Cliquez sur **Save**.

GitHub met une à deux minutes à publier le site. Rechargez la page : un bandeau
vert affiche alors l'adresse.

**Votre adresse** : `https://VOTRE-PSEUDO.github.io/chronojeu/`

> Si vous obtenez une erreur 404, attendez encore une minute et rechargez. Si
> l'erreur persiste, c'est presque toujours que `index.html` n'est pas à la
> racine du dépôt (voir le point important plus haut).

---

## Étape 4 — Installer l'application sur le téléphone

Ouvrez l'adresse dans le navigateur du téléphone, puis :

**Sur iPhone / iPad (Safari uniquement)**
Bouton **Partager** (le carré avec la flèche) › **Sur l'écran d'accueil** › **Ajouter**.

**Sur Android (Chrome)**
Menu **⋮** › **Installer l'application** (ou **Ajouter à l'écran d'accueil**).

L'icône ChronoJeu apparaît sur l'écran d'accueil. L'application s'ouvre alors en
plein écran, sans barre de navigateur, et **fonctionne sans connexion** une fois
la première visite effectuée.

---

## Modifier l'application plus tard

1. Sur GitHub, ouvrez le fichier à modifier et cliquez sur le crayon **✏️**.
2. Faites vos changements, puis **Commit changes**.
3. **Important** : ouvrez `sw.js` et incrémentez le numéro de version, par
   exemple `'chronojeu-v1'` → `'chronojeu-v2'`.

Cette dernière étape est ce qui force les téléphones à télécharger la nouvelle
version. Sans elle, ils continuent d'afficher l'ancienne, gardée en mémoire pour
le fonctionnement hors connexion.

---

## Variante : en ligne de commande

Si Git est installé sur votre ordinateur, depuis le dossier `chronojeu` :

```bash
git init
git add .
git commit -m "Première version de ChronoJeu"
git branch -M main
git remote add origin https://github.com/VOTRE-PSEUDO/chronojeu.git
git push -u origin main
```

Puis suivez l'**étape 3** ci-dessus pour activer Pages.

Pour les mises à jour suivantes :

```bash
git add .
git commit -m "Description de la modification"
git push
```

---

## Essayer l'application sans rien publier

Double-cliquez simplement sur `index.html` : l'application s'ouvre dans votre
navigateur et fonctionne entièrement. Seules deux choses manquent dans ce mode :
le fonctionnement hors connexion et l'installation sur l'écran d'accueil, qui
exigent tous deux une véritable adresse web.

---

## En cas de problème

| Symptôme | Cause la plus probable |
|---|---|
| Erreur 404 sur l'adresse | `index.html` n'est pas à la racine du dépôt |
| Page blanche | Les dossiers `css` et `js` n'ont pas été envoyés |
| Pas de son sur iPhone | Normal au tout premier lancement : le son se débloque au premier toucher de l'écran |
| Les modifications n'apparaissent pas | Le numéro de version de `sw.js` n'a pas été incrémenté |
| L'onglet Pages est introuvable | Le dépôt est privé : passez-le en public dans Settings › General › Danger Zone |
