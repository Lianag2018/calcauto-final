import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../../../utils/api';
import { LEASE_TERMS } from './useCalculatorPage';
import {
  computeLeaseForGrid,
  computeLeasePayment,
  findRateEntry,
  findResidualVehicle,
  getKmAdjustment,
  LeaseInputs,
} from '../../../utils/leaseCalculator';
import { VehicleProgram } from '../../../types/calculator';

type Accessory = { description: string; price: string };

type InventoryLike = {
  body_style?: string;
};

export function useLeaseModule({
  selectedProgram,
  selectedInventory,
  vehiclePrice,
  customBonusCash,
  comptantTxInclus,
  fraisDossier,
  prixEchange,
  montantDuEchange,
  accessories,
  leaseRabaisConcess,
  leasePdsf,
  leaseSoldeReporte,
}: {
  selectedProgram: VehicleProgram | null;
  selectedInventory: InventoryLike | null;
  vehiclePrice: string;
  customBonusCash: string;
  comptantTxInclus: string;
  fraisDossier: string;
  prixEchange: string;
  montantDuEchange: string;
  accessories: Accessory[];
  leaseRabaisConcess: string;
  leasePdsf: string;
  leaseSoldeReporte: string;
}) {
  const [showLease, setShowLease] = useState(false);
  const [leaseKmPerYear, setLeaseKmPerYear] = useState(24000);
  const [leaseTerm, setLeaseTerm] = useState(48);
  const [leaseResiduals, setLeaseResiduals] = useState<any>(null);
  const [leaseRates, setLeaseRates] = useState<any>(null);
  const [leaseResult, setLeaseResult] = useState<any>(null);
  const [leaseLoading, setLeaseLoading] = useState(false);
  const [leasePdsfState, setLeasePdsf] = useState(leasePdsf || '');
  const [leaseSoldeReporteState, setLeaseSoldeReporte] = useState(leaseSoldeReporte || '');
  const [bestLeaseOption, setBestLeaseOption] = useState<any>(null);
  const [leaseAnalysisGrid, setLeaseAnalysisGrid] = useState<any[]>([]);

  useEffect(() => {
    const loadLeaseData = async () => {
      try {
        setLeaseLoading(true);
        const [residualsRes, ratesRes] = await Promise.all([
          axios.get(`${API_URL}/api/sci/residuals`),
          axios.get(`${API_URL}/api/sci/lease-rates`),
        ]);
        setLeaseResiduals(residualsRes.data);
        setLeaseRates(ratesRes.data);
      } catch (error) {
        console.log('Could not load SCI lease data:', error);
      } finally {
        setLeaseLoading(false);
      }
    };

    loadLeaseData();
  }, []);

  useEffect(() => {
    if (!showLease || !selectedProgram || !vehiclePrice || !leaseResiduals || !leaseRates) {
      setLeaseResult(null);
      setBestLeaseOption(null);
      setLeaseAnalysisGrid([]);
      return;
    }

    const price = parseFloat(vehiclePrice);
    if (Number.isNaN(price) || price <= 0) {
      setLeaseResult(null);
      return;
    }

    const residualVehicle = findResidualVehicle(
      leaseResiduals.vehicles || [],
      selectedProgram.brand,
      selectedProgram.model,
      selectedProgram.trim || '',
      selectedInventory?.body_style
    );

    if (!residualVehicle) {
      setLeaseResult(null);
      return;
    }

    const residualPct = residualVehicle.residual_percentages?.[String(leaseTerm)] || 0;
    if (!residualPct) {
      setLeaseResult(null);
      return;
    }

    const vehicleList =
      selectedProgram.year === 2025 ? leaseRates.vehicles_2025 : leaseRates.vehicles_2026;

    const rateEntry = findRateEntry(
      vehicleList || [],
      selectedProgram.brand,
      selectedProgram.model,
      selectedProgram.trim || ''
    );

    const standardRate = rateEntry?.standard_rates?.[String(leaseTerm)] ?? null;
    const alternativeRate = rateEntry?.alternative_rates?.[String(leaseTerm)] ?? null;
    const leaseCashVal = rateEntry?.lease_cash || 0;

    const kmAdjustments = leaseResiduals.km_adjustments?.adjustments;
    const kmAdjustment = getKmAdjustment(kmAdjustments, leaseKmPerYear, leaseTerm);
    const adjustedResidualPct = residualPct + kmAdjustment;

    const pdsf = parseFloat(leasePdsfState) || price;
    const bonusCash = parseFloat(customBonusCash) || selectedProgram.bonus_cash || 0;
    const comptant = parseFloat(comptantTxInclus) || 0;
    const tradeValue = parseFloat(prixEchange) || 0;
    const tradeOwed = parseFloat(montantDuEchange) || 0;
    const soldeReporte = parseFloat(leaseSoldeReporteState) || 0;
    const totalAccessoires = accessories.reduce((sum, acc) => sum + (parseFloat(acc.price) || 0), 0);

    const baseInputs: Omit<LeaseInputs, 'rate' | 'leaseCash'> = {
      price,
      pdsf,
      term: leaseTerm,
      residualPct: adjustedResidualPct,
      fraisDossier: parseFloat(fraisDossier) || 0,
      totalAccessoires,
      rabaisConcess: parseFloat(leaseRabaisConcess) || 0,
      soldeReporte,
      tradeValue,
      tradeOwed,
      comptant,
      bonusCash,
    };

    const result: any = {
      vehicleName: `${residualVehicle.brand} ${residualVehicle.model_name} ${residualVehicle.trim}`,
      residualPct: adjustedResidualPct,
      residualValue: pdsf * (adjustedResidualPct / 100),
      kmAdjustment,
      term: leaseTerm,
      kmPerYear: leaseKmPerYear,
    };

    if (standardRate !== null) {
      result.standard = computeLeasePayment({
        ...baseInputs,
        rate: standardRate,
        leaseCash: leaseCashVal,
      });
    }

    if (alternativeRate !== null) {
      result.alternative = computeLeasePayment({
        ...baseInputs,
        rate: alternativeRate,
        leaseCash: 0,
      });
    }

    if (result.standard && result.alternative) {
      result.bestLease = result.standard.total < result.alternative.total ? 'standard' : 'alternative';
      result.leaseSavings = Math.abs(result.standard.total - result.alternative.total);
    } else if (result.standard) {
      result.bestLease = 'standard';
    } else if (result.alternative) {
      result.bestLease = 'alternative';
    }

    setLeaseResult(result);

    let bestOption: any = null;
    const grid: any[] = [];

    for (const km of [12000, 18000, 24000]) {
      for (const term of LEASE_TERMS) {
        const resPct = residualVehicle.residual_percentages?.[String(term)] || 0;
        if (!resPct) continue;

        const kmAdj = getKmAdjustment(kmAdjustments, km, term);
        const adjResPct = resPct + kmAdj;

        const stdRate = rateEntry?.standard_rates?.[String(term)] ?? null;
        const altRate = rateEntry?.alternative_rates?.[String(term)] ?? null;

        const gridInputs: Omit<LeaseInputs, 'rate' | 'leaseCash' | 'term' | 'residualPct'> = {
          price,
          pdsf,
          fraisDossier: parseFloat(fraisDossier) || 0,
          totalAccessoires,
          rabaisConcess: parseFloat(leaseRabaisConcess) || 0,
          soldeReporte,
          tradeValue,
          tradeOwed,
          comptant,
          bonusCash,
        };

        if (altRate !== null) {
          const r = computeLeaseForGrid({
            ...gridInputs,
            rate: altRate,
            leaseCash: 0,
            term,
            residualPct: adjResPct,
          });
          const entry = { ...r, kmPerYear: km, option: 'alt', optionLabel: 'Alt' };
          grid.push(entry);
          if (!bestOption || r.monthly < bestOption.monthly) {
            bestOption = { ...entry, option: 'alternative', optionLabel: 'Taux Alternatif' };
          }
        }

        if (stdRate !== null) {
          const r = computeLeaseForGrid({
            ...gridInputs,
            rate: stdRate,
            leaseCash: leaseCashVal,
            term,
            residualPct: adjResPct,
          });
          const entry = { ...r, kmPerYear: km, option: 'std', optionLabel: 'Std' };
          grid.push(entry);
          if (!bestOption || r.monthly < bestOption.monthly) {
            bestOption = { ...entry, option: 'standard', optionLabel: 'Std + Lease Cash' };
          }
        }
      }
    }

    setBestLeaseOption(bestOption);
    setLeaseAnalysisGrid(grid);
  }, [
    showLease,
    selectedProgram,
    selectedInventory?.body_style,
    vehiclePrice,
    customBonusCash,
    comptantTxInclus,
    fraisDossier,
    prixEchange,
    montantDuEchange,
    accessories,
    leaseRabaisConcess,
    leasePdsfState,
    leaseSoldeReporteState,
    leaseResiduals,
    leaseRates,
    leaseKmPerYear,
    leaseTerm,
  ]);

  return {
    showLease,
    setShowLease,
    leaseKmPerYear,
    setLeaseKmPerYear,
    leaseTerm,
    setLeaseTerm,
    leaseResiduals,
    leaseRates,
    leaseResult,
    leaseLoading,
    leasePdsf: leasePdsfState,
    setLeasePdsf,
    leaseSoldeReporte: leaseSoldeReporteState,
    setLeaseSoldeReporte,
    bestLeaseOption,
    leaseAnalysisGrid,
  };
}
