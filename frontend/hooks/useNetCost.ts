/**
 * useNetCost - Hook pour le calcul du coût net véhicule
 * 
 * Gère:
 * - EP (Employee Price)
 * - PDCO (Prix Dealer Cost Option)
 * - Holdback
 * - Marge concessionnaire
 */

import { useMemo } from 'react';

export interface VehicleCostData {
  ep_cost: number;       // Employee Price
  pdco: number;          // Prix PDCO
  pref?: number;         // Prix préférentiel
  holdback?: number;     // Retenue
  invoice_total?: number;
}

export interface NetCostResult {
  epCost: number;
  pdco: number;
  pref: number;
  holdback: number;
  invoiceTotal: number;
  
  // Calculs dérivés
  marge: number;           // PDCO - EP
  margePercent: number;    // Marge en %
  netCostDealer: number;   // Coût net pour le concessionnaire
  profitPotentiel: number; // Profit potentiel si vente au PDCO
}

/**
 * Hook pour calculer le coût net d'un véhicule
 */
export function useNetCost(data: VehicleCostData | null): NetCostResult | null {
  return useMemo(() => {
    if (!data) return null;
    
    const {
      ep_cost = 0,
      pdco = 0,
      pref = 0,
      holdback = 0,
      invoice_total = 0,
    } = data;
    
    // Marge = PDCO - EP
    const marge = pdco - ep_cost;
    
    // Marge en pourcentage
    const margePercent = pdco > 0 ? (marge / pdco) * 100 : 0;
    
    // Coût net = EP - Holdback (ce que le dealer paie vraiment)
    const netCostDealer = ep_cost - holdback;
    
    // Profit potentiel si vente au PDCO
    const profitPotentiel = pdco - netCostDealer;
    
    return {
      epCost: ep_cost,
      pdco,
      pref,
      holdback,
      invoiceTotal: invoice_total,
      marge,
      margePercent,
      netCostDealer,
      profitPotentiel,
    };
  }, [data]);
}

/**
 * Calcule la marge entre deux prix
 */
export function calculateMargin(sellPrice: number, costPrice: number): { amount: number; percent: number } {
  const amount = sellPrice - costPrice;
  const percent = sellPrice > 0 ? (amount / sellPrice) * 100 : 0;
  return { amount, percent };
}

/**
 * Valide les données de coût (EP < PDCO, valeurs positives)
 */
export function validateCostData(data: VehicleCostData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (data.ep_cost <= 0) {
    errors.push('EP doit être positif');
  }
  
  if (data.pdco <= 0) {
    errors.push('PDCO doit être positif');
  }
  
  if (data.ep_cost > 0 && data.pdco > 0 && data.ep_cost >= data.pdco) {
    errors.push('EP doit être inférieur au PDCO');
  }
  
  if (data.pdco < 30000 || data.pdco > 150000) {
    errors.push('PDCO hors limites (30K - 150K)');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

export default useNetCost;
