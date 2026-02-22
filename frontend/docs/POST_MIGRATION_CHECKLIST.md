# CalcAuto AiPro - Checklist Post-Migration

## 🔧 Étape 1: Résoudre ENOSPC (avant migration)

### Mac:
```bash
sudo sysctl -w kern.maxfiles=1048576
sudo sysctl -w kern.maxfilesperproc=1048576
ulimit -n 1048576
```

### Linux:
```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Windows:
Pas de limite inotify, mais vérifier antivirus/Windows Defender

---

## 🚀 Étape 2: Lancer Expo

```bash
cd frontend
npx expo start --localhost  # Mode local (simulateur)
# OU
npx expo start --lan        # Mode LAN (téléphone même réseau)
# ÉVITER --tunnel pour la migration
```

---

## 📋 Étape 3: Migration (un bloc à la fois)

### PASS 1: Inputs
1. [ ] Ouvrir `app/(tabs)/index.tsx`
2. [ ] Ajouter import ligne 34:
   ```tsx
   import { CalculatorInputs } from '../../components/calculator/CalculatorInputs';
   ```
3. [ ] Copier le code depuis `docs/INDEX_MIGRATION_CODE.ts`
4. [ ] Remplacer lignes 1130-1414
5. [ ] Sauvegarder → Tester → Commit

### PASS 2: Results (si PASS 1 OK)
1. [ ] Importer PaymentResult
2. [ ] Remplacer lignes 1416-1600
3. [ ] Tester → Commit

### PASS 3: CostBreakdown (si PASS 2 OK)
1. [ ] Importer CostBreakdown
2. [ ] Remplacer bloc ventilation
3. [ ] Tester → Commit

---

## ✅ Checklist Validation Post-Migration

### Fonctionnalités de base:
- [ ] App se lance sans erreur
- [ ] Prix véhicule modifiable
- [ ] Recalcul instantané

### Inputs:
- [ ] Bonus cash fonctionne
- [ ] Comptant fonctionne
- [ ] Frais (dossier/pneus/RDPRM) affichés

### Échange:
- [ ] Valeur échange fonctionne
- [ ] Dette échange fonctionne
- [ ] Negative equity calculé correctement

### Terme et fréquence:
- [ ] Sélection 36-96 mois fonctionne
- [ ] Mensuel/Bi-hebdo/Hebdo fonctionne

### Options:
- [ ] Option 1 sélectionnable
- [ ] Option 2 sélectionnable (si disponible)
- [ ] Best option badge affiché

---

## 🧪 Tests de comparaison (valeurs de référence)

| Scénario | Prix | Taux | Terme | Attendu |
|----------|------|------|-------|---------|
| Base | 50,000$ | 4.99% | 60 | ~943$/mois |
| Standard | 65,000$ | 5.99% | 72 | ~1,077$/mois |
| Avec bonus | 55,000$ | 4.99% | 72 | Réduction visible |
| Avec échange | 55,000$ | 4.99% | 72 | -15,000$ = réduction |
| Taux 0% | 40,000$ | 0% | 48 | 833.33$/mois exactement |

---

## 🔄 Rollback si problème

```bash
cp app/(tabs)/index_legacy.tsx app/(tabs)/index.tsx
```

---

## 📊 Objectifs finaux

| Métrique | Avant | Après |
|----------|-------|-------|
| index.tsx | 3091 lignes | ~900 lignes |
| Logique métier | Mélangée | Hooks isolés |
| Tests frontend | 0 | 44 |
| Composants | 0 | 4 |

---

## ✅ Critères de succès

La migration est réussie si:
1. Tous les calculs sont identiques
2. Toutes les interactions fonctionnent
3. Pas d'erreur console
4. Tests passent toujours (44/44)
