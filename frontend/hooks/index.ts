/**
 * Hooks exports - Module centralisé pour les hooks du calculateur
 */

export { 
  useFinancingCalculation, 
  useCurrencyFormatter,
  calculateMonthlyPayment,
  calculateBiweeklyPayment,
  calculateWeeklyPayment,
  getRateForTerm,
} from './useFinancingCalculation';

export type { 
  FinancingRates, 
  CalculationParams, 
  CalculationResult 
} from './useFinancingCalculation';

export { 
  usePrograms 
} from './usePrograms';

export type { 
  VehicleProgram, 
  ProgramPeriod 
} from './usePrograms';

export { 
  useNetCost, 
  calculateMargin, 
  validateCostData 
} from './useNetCost';

export type { 
  VehicleCostData, 
  NetCostResult 
} from './useNetCost';
