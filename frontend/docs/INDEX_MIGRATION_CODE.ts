/**
 * index_refactored.tsx - Version migrée de index.tsx
 * 
 * INSTRUCTIONS:
 * 1. Tester ce fichier quand Expo sera stable
 * 2. Si OK, renommer en index.tsx
 * 3. Supprimer index_legacy.tsx
 * 
 * CHANGEMENTS:
 * - Import CalculatorInputs composant
 * - Bloc inputs (285 lignes) → composant (60 lignes)
 * - Réduction totale estimée: ~225 lignes
 */

// ============================================================
// AJOUT EN HAUT DU FICHIER (après les imports existants)
// ============================================================

// Ajouter après ligne 34 de index.tsx:
/*
import { CalculatorInputs } from '../../components/calculator/CalculatorInputs';
*/

// ============================================================
// REMPLACEMENT BLOC INPUTS (lignes 1130-1414)
// ============================================================

// SUPPRIMER tout le bloc de la ligne 1130:
// {/* Price Input and Calculation */}
// {selectedProgram && (
//   ...285 lignes...
// )}

// REMPLACER PAR:
const CALCULATOR_INPUTS_REPLACEMENT = `
{/* Price Input and Calculation - MIGRÉ vers CalculatorInputs */}
{selectedProgram && (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{t.vehicle.vehiclePrice}</Text>
    <CalculatorInputs
      vehiclePrice={vehiclePrice}
      customBonusCash={customBonusCash}
      comptantTxInclus={comptantTxInclus}
      fraisDossier={fraisDossier}
      taxePneus={taxePneus}
      fraisRDPRM={fraisRDPRM}
      prixEchange={prixEchange}
      montantDuEchange={montantDuEchange}
      selectedTerm={selectedTerm}
      paymentFrequency={paymentFrequency}
      selectedOption={selectedOption}
      onVehiclePriceChange={setVehiclePrice}
      onBonusCashChange={setCustomBonusCash}
      onComptantChange={setComptantTxInclus}
      onFraisDossierChange={setFraisDossier}
      onTaxePneusChange={setTaxePneus}
      onFraisRDPRMChange={setFraisRDPRM}
      onPrixEchangeChange={setPrixEchange}
      onMontantDuEchangeChange={setMontantDuEchange}
      onTermChange={setSelectedTerm}
      onFrequencyChange={setPaymentFrequency}
      onOptionChange={setSelectedOption}
      defaultBonusCash={selectedProgram.bonus_cash || 0}
      consumerCash={selectedProgram.consumer_cash || 0}
      option1Rates={selectedProgram.option1_rates}
      option2Rates={selectedProgram.option2_rates}
      currentOption1Rate={getRateForTerm(selectedProgram.option1_rates, selectedTerm)}
      currentOption2Rate={selectedProgram.option2_rates ? getRateForTerm(selectedProgram.option2_rates, selectedTerm) : null}
      selectedInventory={selectedInventory}
      onClearInventory={() => { setSelectedInventory(null); setVehiclePrice(''); }}
      labels={{
        vehiclePrice: t.vehicle.vehiclePrice,
        bonusCash: t.results.bonusCash,
        afterTax: t.results.afterTax,
        cashDown: 'Comptant (tx incluses)',
        feesTitle: t.fees.title,
        dossier: t.fees.dossier,
        tires: t.fees.tires,
        rdprm: t.fees.rdprm,
        exchangeTitle: t.exchange.title,
        exchangeValue: t.exchange.value,
        exchangeOwed: t.exchange.owed,
        reducesAmount: t.exchange.reducesAmount,
        addedToFinancing: t.exchange.addedToFinancing,
        selectTerm: t.term.selectTerm,
        months: t.term.months,
        frequencyTitle: t.frequency.title,
        monthly: t.frequency.monthly,
        biweekly: t.frequency.biweekly,
        weekly: t.frequency.weekly,
        chooseOption: t.options.chooseOption,
        option1: t.options.option1,
        option2: t.options.option2,
        notAvailable: t.options.notAvailable,
      }}
      formatCurrency={(v) => new Intl.NumberFormat('fr-CA', {
        style: 'currency', 
        currency: 'CAD', 
        minimumFractionDigits: 0
      }).format(v)}
    />
  </View>
)}
`;

// ============================================================
// CHECKLIST DE VALIDATION POST-MIGRATION
// ============================================================

const VALIDATION_CHECKLIST = [
  "□ App se lance sans erreur",
  "□ Prix véhicule modifiable",
  "□ Bonus cash fonctionne",
  "□ Comptant fonctionne",
  "□ Frais affichés correctement",
  "□ Échange valeur/dette fonctionne",
  "□ Sélection terme (36-96 mois) fonctionne",
  "□ Fréquence (mensuel/bi-hebdo/hebdo) fonctionne",
  "□ Option 1/2 sélectionnable",
  "□ Recalcul instantané quand valeur change",
  "□ Résultats identiques à l'ancien calculateur",
];

// ============================================================
// TESTS DE COMPARAISON
// ============================================================

const TEST_SCENARIOS = [
  { price: 50000, rate: 4.99, term: 60, expected: "~943$/mois" },
  { price: 65000, rate: 5.99, term: 72, expected: "~1,077$/mois" },
  { price: 55000, rate: 0, term: 48, bonus: 3000, expected: "~1,083$/mois" },
  { price: 55000, rate: 4.99, term: 72, tradeIn: 15000, expected: "réduction visible" },
];

export { CALCULATOR_INPUTS_REPLACEMENT, VALIDATION_CHECKLIST, TEST_SCENARIOS };
