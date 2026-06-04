# Scripts de Génération d'Embeddings pour RAG

Ce dossier contient les scripts pour générer les embeddings vectoriels des 5 tables PLS en utilisant OpenAI text-embedding-3-small.

## 📋 Structure des fichiers

- `openai-client.ts` - Client OpenAI réutilisable avec gestion des batchs
- `generate-embeddings-supports-master.ts` - Génère embeddings pour table principale (PRIORITAIRE)
- `generate-embeddings-supports-variants.ts` - Génère embeddings pour les variantes
- `generate-embeddings-planning-kits.ts` - Génère embeddings pour planning & kits
- `generate-embeddings-visuels.ts` - Génère embeddings pour les visuels
- `generate-embeddings-contacts.ts` - Génère embeddings pour les contacts
- `generate-all-embeddings.ts` - Script principal pour vectoriser toutes les tables

## 🚀 Utilisation rapide

### Générer tous les embeddings (RECOMMANDÉ)

```bash
npm run embeddings:generate-all
```

### Générer par table individuelle

```bash
# Table principale (supports master) - À faire en premier
npm run embeddings:supports-master

# Autres tables
npm run embeddings:supports-variants
npm run embeddings:planning-kits
npm run embeddings:visuels
npm run embeddings:contacts
```

## ⚙️ Options disponibles

### Regénérer tous les embeddings (force)

```bash
npm run embeddings:generate-all -- --force
```

### Limiter le nombre de records (pour tests)

```bash
npm run embeddings:supports-master -- --limit=10
```

### Filtrer par tables spécifiques

```bash
npm run embeddings:generate-all -- --tables=new_00_supports_master,new_01_supports_variants
```

### Modifier la taille des batchs

```bash
npm run embeddings:generate-all -- --batch-size=50
```

## 💰 Estimation des coûts

Le modèle `text-embedding-3-small` coûte **$0.02 par million de tokens**.

Pour vos 5 tables PLS (~11 000 lignes) :
- **Tokens estimés** : ~20 000 - 25 000 tokens
- **Coût total estimé** : ~$0.40 - $0.50
- **Temps d'exécution** : 3-5 minutes

Les scripts affichent le coût en temps réel pendant la génération.

## 📊 Tables vectorisées

### 1. new_00_supports_master (PRIORITAIRE)
**Données sémantiques clés** : catégorie, lectorat, canal, nom du support

Texte vectorisé :
```
Support: [nom] | Catégorie: [catégorie] | Lectorat: [lectorat] | Canal: [canal]
```

### 2. new_01_supports_variants
Variantes avec tarifs et métriques d'audience

Texte vectorisé :
```
Support: [nom] | Canal: [canal] | Périodicité: [...] | Format: [...] | Tarifs: [...]
```

### 3. new_02_planning_kits_media
Plannings et kits média avec dates

Texte vectorisé :
```
Support: [nom] | Canal: [canal] | Type: [type] | Date: [...] | Specs: [...]
```

### 4. new_03_visuels
Visuels et formats publicitaires

Texte vectorisé :
```
Support: [nom] | Canal: [canal] | Type de format: [...] | Notes: [...]
```

### 5. new_04_contacts
Contacts des supports presse

Texte vectorisé :
```
Support: [nom] | Nom: [...] | Prénom: [...] | Rôle: [...] | Notes: [...]
```

## 🔄 Workflow recommandé

1. **Première vectorisation** : Lancer le script complet
   ```bash
   npm run embeddings:generate-all
   ```

2. **Vérifier les résultats** : Tester la recherche sémantique
   ```bash
   npm run embeddings:test
   ```

3. **Re-vectoriser si besoin** : Ajouter `--force` pour regénérer

## 🛠️ Maintenance

### Ajouter de nouveaux records

Les nouveaux records insérés dans les tables auront automatiquement leur `texte_vectorise` généré via les triggers SQL. Pour générer leurs embeddings :

```bash
# Sans --force, seuls les records sans embedding sont traités
npm run embeddings:generate-all
```

### Mettre à jour des embeddings existants

```bash
npm run embeddings:generate-all -- --force
```

## ⚠️ Prérequis

- Variable d'environnement `OPENAI_API_KEY` configurée dans `.env`
- Tables PLS créées et remplies dans Supabase
- Extension pgvector activée
- Colonnes `texte_vectorise` et `embedding` créées

## 🔍 Dépannage

### Erreur "Missing OpenAI API key"
Vérifiez que `OPENAI_API_KEY` est défini dans `.env`

### Erreur "column embedding does not exist"
Lancez la migration `add_pgvector_and_embedding_columns` d'abord

### Tous les embeddings déjà générés
Ajoutez `--force` pour regénérer ou c'est que tout est déjà à jour !

## 📚 Prochaines étapes

Après génération des embeddings :
1. Tester la recherche sémantique : `npm run embeddings:test`
2. Intégrer dans l'application via `lib/rag/vectorSearch.ts`
3. Configurer le prompt RAG pour l'orchestration
