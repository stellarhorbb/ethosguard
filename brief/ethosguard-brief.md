# EthosGuard — Brief de développement

## Vue d'ensemble

**EthosGuard** est un outil public d'intelligence réputation on-chain pour Ethos Network.
Tagline : *"On-chain reputation intelligence"*
URL cible : `ethosguard.io`
Stack : Next.js + Tailwind CSS, déployé sur Vercel
Auteur : @stellarhobbes (Ethos Validator #171)

---

## Design System

### Couleurs
```
Noir fond principal : #0a0a0a
Noir cards : #161616
Vert acide (alerte / accent) : #b5f500
Violet (loading / état neutre/clean) : #5B21B6 (approximatif — vérifier sur les visuels)
Blanc texte : #ffffff
Gris texte secondaire : #555555
```

### Typographie
- Tout en **monospace** (Courier, Space Mono, ou équivalent)
- Titres en bold
- Labels en uppercase, letter-spacing élevé

### Principes visuels
- Dark theme total
- Vert acide = warning / signal actif
- Violet = état "clean" / loading
- Cards : background #161616, pas de border par défaut
- Hover sur cards cliquables : border 1–2px vert acide
- Spacing dense, peu de padding
- Cursor pointer sur tout élément cliquable

---

## Structure des pages

### Page 1 — Home (`/`)

Layout centré, minimaliste.

**Header**
- Logo (barres animées) + "ONCHAIN REPUTATION / HUMAN_INTELLIGENCE" en monospace
- Coin haut droit : `@STELLARHOBBES` + `LEAVE_REVIEW →` (lien vers profil Ethos de stellarhobbes)

**Corps**
- Titre : `EthosGuard` en grand
- Sous-titre : `On-chain reputation intelligence`
- Search bar : placeholder `Ethos profile name` + bouton `SEARCH` en vert acide

**Footer**
- Bande vert acide pleine largeur en bas
- `@STELLARHOBBES` | `LEAVE_REVIEW →` (lien : `https://app.ethos.network/profile/x/stellarhobbes`)

---

### Page 2 — Résultat profil (`/profile/[username]`)

#### Header global (sticky)
- Coin haut gauche : Logo + tagline
- Coin haut droit : `@STELLARHOBBES` + `LEAVE_REVIEW →`

#### Barre de progression (sous header)
- Bande violette pleine largeur
- Affiche `↻ 74%` pendant le chargement
- Affiche `↻ Synced` quand tout est chargé
- Disparaît ou reste en "Synced" une fois terminé

#### Section profil

```
[NOM EN GRAND]                               ETHOS PROFIL →

[≡ SCORE] [⊘ Validator] [✓ Human Verified] [📅 MOIS ANNÉE]    [≫ N | X% Positive] [♥ ETH]
```

- `ETHOS PROFIL →` : lien vers `https://app.ethos.network/profile/x/{username}`
- Score dans un badge gris foncé
- Badges conditionnels (Validator / Human Verified affichés seulement si applicable)
- Date = mois + année de création du profil Ethos
- Coin droit : nombre de reviews | % positif | ETH vouché

---

#### Section 4 cards highlight

Grid 4 colonnes, hauteur fixe.

Chaque card contient :
- Titre en bold (ligne 1)
- Description courte en petit (lignes 2–3)
- Valeur numérique grande en bas à droite

**Les 4 cards :**

| Card | Description | Valeur |
|---|---|---|
| **Vouch Cluster** | Closed mutual vouching loop | Nombre de profils dans le cluster |
| **Review Burst** | Abnormal spike of incoming reviews | Nombre + date du pic |
| **Cleanup Activity** | Erased vouches and archived reviews | ≫N (reviews archivées) ♥N (unvouches) |
| **Ghost Reviewers** | Inactive reviewers | Nombre |

**États des cards :**
- **Alerte** : background vert acide, texte noir, icône ⚠ en haut à droite → quand la valeur est non nulle et suspecte
- **Neutre** : background #161616, texte blanc, pas d'icône ⚠ → quand la valeur est 0 ou clean

---

#### Section 3 colonnes de données

Grid 3 colonnes égales, séparateur 2px entre elles.

Chaque colonne a :
- **Header** : label en uppercase à gauche + badge résultat à droite
  - Badge alerte : `⚠ N FOUND` en vert acide
  - Badge clean : `✓ CLEAN` en vert acide
- **Body** : liste de cards ou état vide

**Colonne 1 — MUTUAL REVIEWS <24H**

Cards :
```
@username                    19.4h ⊙
0.010 ETH given / 0.010 ETH received
```
- Username en vert acide
- Timestamp à droite en gris
- Cliquable → `https://app.ethos.network/profile/x/{username}` (nouvelle tab)

**Colonne 2 — MUTUAL VOUCHES <24H**

Cards :
```
@username                    1.0h ⊙
gave positive / received positive
```
- Username en vert acide
- Cliquable → `https://app.ethos.network/profile/x/{username}` (nouvelle tab)

**État vide (CLEAN) pour une colonne :**
- Trait plein vert acide en haut du body (2px, pleine largeur)
- Rectangle violet centré avec texte `NO ISSUE FOUND` en vert acide monospace bold

**Colonne 3 — AI SLOPS**

Header : `AI SLOPS ⓘ` — le `ⓘ` déclenche une modal au hover (voir section Modal)

Cards :
```
@username                    32/100
Preview du texte de la review tronqué à 2 lignes [...]
```
- Username en vert acide
- Score en blanc à droite
- Preview en gris, tronqué avec `[...]`
- Cliquable → `https://app.ethos.network/profile/x/{username}` (nouvelle tab)

**Bouton MORE**
Si une colonne a plus de 5 entrées : afficher `MORE →` en vert acide centré en bas, qui expand la liste.

---

#### Modal AI Slop Detector (hover sur ⓘ)

Apparaît au hover de l'icône `ⓘ` dans le header de la colonne AI SLOPS.
Positionnée au-dessus ou à côté de l'icône, ne dépasse pas le viewport.

**Structure de la modal :**

Partie haute (fond violet) :
```
AI Slop detector                    [?]

Detects AI-generated reviews by analyzing
vocabulary, sentence structure, and writing patterns.

0–29 Clean → 30–49 Suspicious → 50+ Likely AI
```

Partie basse (fond vert acide, texte noir) :
```
+35 → Em/En dashes
+25 → Generic filler phrases
+20 → Templated title pattern
+15 → Corporate vocabulary & formulas
+12 → Transitions & superlatives
+8  → No contractions, slang or emotion
−10 → Web3 slang or personal narrative

Experimental, not an exact science.
```
- La dernière ligne `Experimental, not an exact science.` en italique, légèrement plus discret

---

## Interactions & états

### Hover sur cards cliquables
- Border 1–2px vert acide autour de la card
- Cursor pointer
- Transition douce (100–150ms)

### Cards non cliquables
- Pas de hover state
- Cursor default

### Loading state
- Barre violette avec `↻ 74%` animée
- Les sections se remplissent progressivement au fur et à mesure que les calls API répondent
- Une fois tout chargé : barre passe à `↻ Synced`

---

## Logique des checks (à connecter à l'API Ethos)

### API Ethos
Base URL : `https://api.ethos.network/api/v2/`

Endpoints utilisés :
- `GET /user/by/x/{username}` → lookup profil
- `POST /profiles` avec `{ ids: [profileId] }` → données profil
- `POST /vouches` avec `authorProfileIds` ou `subjectProfileIds` → vouches
- `POST /activities/profile/given` → reviews données (userkey: `"profileId:X"`)
- `POST /activities/profile/received` → reviews reçues

### Check : Mutual Reviews <24H
- Récupérer reviews données ET reçues pour le profil
- Si profil A a reviewé B ET B a reviewé A dans les 24h → flag
- Afficher chaque paire avec timestamp

### Check : Mutual Vouches <24H
- Récupérer vouches données ET reçues
- Même logique que reviews : paire dans les 24h → flag
- Afficher : `gave positive / received positive` + timestamp

### Check : AI Slop Score
Analyser `title + body` de chaque review reçue.

**Scoring (ajouter les points si pattern trouvé) :**
- +35 : présence de em dash (—) ou en dash (–) U+2013/U+2014
- +25 : phrases génériques courtes ("trusted member", "great person"...)
- +20 : titre commence par "A [Adjectif] [Nom]"
- +15 : vocabulaire corporate ("demonstrates", "invaluable", "meticulous", "exemplary", "exceptional", "outstanding", "remarkable", "commendable", "showcases")
- +12 : formules d'ouverture ("had the pleasure", "had the privilege", "I am pleased to")
- +12 : transitions ("furthermore", "moreover", "in conclusion", "it is worth noting")
- +12 : superlatifs ("above and beyond", "proven track record", "wholeheartedly", "seamlessly")
- +12 : aucune contraction (si texte > 120 chars)
- +8 : aucun marqueur d'émotion (!?…) si texte > 80 chars
- +8 : aucun slang Web3 si texte > 80 chars
- −10 : présence de slang Web3 authentique (lmao, bruh, ngl, deadass, no cap, ser, wen, ngmi, wagmi...)
- −10 : narration personnelle ("I've known", "back in the", "I was a holder", "great dude", "met him in")

**Seuils :**
- 0–29 : Clean
- 30–49 : Suspicious (flag individuel)
- 50+ : Likely AI

**Flag colonne :**
- Si score moyen ≥ 28 OU au moins 3 reviews suspicious → `⚠ N FOUND`
- Sinon → `✓ CLEAN`

Reviews négatives : ignorées (skip)
Textes < 10 chars : ignorés

### Check : Vouch Cluster
- Analyser le réseau de vouches : si un groupe de profils se vouchent mutuellement en circuit fermé → flag
- Valeur = nombre de profils dans le cluster

### Check : Review Burst
- Analyser les reviews reçues par jour
- Si spike > 5 reviews en 24h → flag
- Afficher : date du pic + nombre

### Check : Cleanup Activity
- Compter les unvouches (vouches avec statut "withdrawn" ou similaire)
- Compter les reviews archivées (`data.archived === true`)
- Afficher : `≫N` (reviews) `♥N` (vouches)

### Check : Ghost Reviewers
- Pour chaque revieweur, récupérer son nombre total de reviews données
- Si ≤ 3 reviews au total → ghost reviewer
- Valeur = nombre de ghost reviewers détectés

---

## Notes importantes

- **Philosophie** : "Signals, not verdicts" — l'outil affiche des données, ne prononce pas de verdict
- Pas de label "scammer" ou "fraudeur" nulle part
- Toutes les cards de données sont cliquables vers le profil Ethos concerné
- Le lien `LEAVE_REVIEW →` dans le header et le footer pointe toujours vers : `https://app.ethos.network/profile/x/stellarhobbes`
- Le footer `@STELLARHOBBES` est présent sur toutes les pages

---

## Visuels de référence fournis

- `ethos-guard.jpg` — home page
- `ethos-guard-result.jpg` — page résultat état alerte (profil suspect)
- `ethos-guard-result-cleaner.jpg` — page résultat état clean
- `ethos-guard-result-cleaner-hover-link.jpg` — hover state sur card cliquable + modal AI Slop
