# Notes client — Colonnes du devis builder (à discuter)

Date: 2026-04-03

---

## Résumé général

Audit complet des colonnes affichant "ND" ou "Sur demande" dans le devis builder. Pour chaque colonne, on a vérifié l'Airtable source et la base de données.

---

## Section Web

### Format (colonne "Format")
- **Statut : ✅ Migré aujourd'hui**
- 99/100 supports web ont un format dans Airtable (`Format Web`), ex : `970 x 250 / 300 x 600 / 300 x 250 (mobile)`
- Maintenant affiché dans le devis builder pour les supports qui ont la donnée

### Durée (colonne "Durée")
- **Statut : ⚠️ Données insuffisantes — à discuter**
- 63/100 supports ont une durée dans Airtable (`Durée (Display)`)
- Valeurs quasi-uniquement : **"1 mois"** (61 fois), "2 semaines" (2 fois)
- Les 8 supports visibles dans le screenshot (L'Opinion, L'Express, La Tribune, Challenges, Le Blog du Dirigeant, Be A Boss, Score 3, Dynamique Mag) **n'ont pas de durée dans Airtable non plus**
- **Question client** : Est-ce utile d'afficher "1 mois" quand c'est le cas, ou peut-on supprimer cette colonne du tableau Web ?

### Tarif Brut / CPM / Tarif net → "Sur demande"
- **Statut : ✅ Comportement correct**
- Ces supports n'ont littéralement pas de tarif dans Airtable (`tarif_brut = "pas de tarif"`)
- "Sur demande" est le bon affichage — les tarifs web de ces supports sont négociés au cas par cas
- Pas de donnée à migrer

---

## Section Newsletter (NL)

### Périodicité, Abonnés, Taux d'ouverture, Format NL
- **Statut : ✅ Migré aujourd'hui**
- 92/95 ont Périodicité, 92/95 ont Abonnés, 71/95 ont Taux d'ouverture, 88/95 ont Format
- Maintenant affiché dans le devis builder

---

## Section Print

### Bouclage / Parution
- **Statut : ✅ Déjà fonctionnel**
- Données issues de la table `NEW_02_Planning_Kits_Media`

### OJD (colonne "OJD")
- **Statut : ❌ Donnée inexistante dans Airtable**
- Airtable ne contient pas de champ OJD distinct de la Diffusion
- La seule donnée de tirage est `Diffusion` (déjà affichée dans la colonne "Diffusion")
- **Question client** : Faut-il supprimer la colonne OJD ? Ou PLS veut-il saisir les chiffres OJD certifiés séparément ? Si oui, il faudra les entrer manuellement dans la base.

### Emplacement (colonne "Emplacement")
- **Statut : ⚠️ Donnée per-devis, pas per-support**
- N'existe pas dans Airtable comme donnée fixe par support
- C'est une information saisie au moment du devis ("1ère de couverture", "page de droite", "4ème de couverture", "encart"…)
- **Question client** : Voulez-vous un champ texte libre éditable dans le devis builder pour saisir l'emplacement ligne par ligne ? On peut l'ajouter facilement.

### Format fichier (colonne "Format fichier")
- **Statut : ✅ Déjà fonctionnel**
- Données issues de la table `NEW_03_Visuels` (champ `type_de_format`)

### Dimension (colonne "Dimension")
- **Statut : ✅ Déjà fonctionnel**
- Affiché via `format_print` (ex : "210 x 297 mm")

---

## Actions décidées

| Colonne | Canal | Action |
|---------|-------|--------|
| Format | Web | ✅ Migré |
| Périodicité / Abonnés / Taux ouv. / Format NL | NL | ✅ Migré |
| Durée | Web | À décider (supprimer ou garder ND ?) |
| OJD | Print | À décider (supprimer ou saisie manuelle ?) |
| Emplacement | Print | À décider (champ éditable per-ligne ?) |
