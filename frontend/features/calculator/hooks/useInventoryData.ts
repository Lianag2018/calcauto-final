import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../../../utils/api';

export type InventoryVehicle = {
  id: string;
  stock_no?: string;
  vin?: string;
  year?: number | string;
  brand?: string;
  model?: string;
  trim?: string;
  msrp?: number;
  asking_price?: number;
  net_cost?: number;
  status?: string;
  body_style?: string;
  model_code?: string;
  ep_cost?: number;
  pdco?: number;
  pref?: number;
  holdback?: number;
  subtotal?: number;
  total?: number;
  options?: any[];
};

type AutoFinancing = {
  consumer_cash: number;
  bonus_cash: number;
  option1_rates: Record<string, number | null>;
  option2_rates: Record<string, number | null>;
  programme_source: string;
};

export function useInventoryData({
  getToken,
  setVehiclePrice,
}: {
  getToken: () => Promise<string | null>;
  setVehiclePrice: (value: string) => void;
}) {
  const [inventoryList, setInventoryList] = useState<InventoryVehicle[]>([]);
  const [selectedInventory, setSelectedInventory] = useState<InventoryVehicle | null>(null);
  const [showInventoryPicker, setShowInventoryPicker] = useState(false);
  const [manualVin, setManualVin] = useState('');
  const [autoFinancing, setAutoFinancing] = useState<AutoFinancing | null>(null);

  const loadInventory = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await axios.get(`${API_URL}/api/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const disponible = (Array.isArray(res.data) ? res.data : []).filter(
        (v: InventoryVehicle) => v.status === 'disponible'
      );
      setInventoryList(disponible);
    } catch (error) {
      console.log('Could not load inventory:', error);
    }
  }, [getToken]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    const loadAutoFinancing = async () => {
      if (!selectedInventory?.model_code) {
        setAutoFinancing(null);
        return;
      }

      try {
        const res = await axios.get(
          `${API_URL}/api/product-codes/${selectedInventory.model_code}/financing`
        );

        if (res.data?.success && res.data.financing) {
          setAutoFinancing(res.data.financing);
        } else {
          setAutoFinancing(null);
        }
      } catch (error) {
        console.log('Could not load auto-financing:', error);
        setAutoFinancing(null);
      }
    };

    loadAutoFinancing();
  }, [selectedInventory?.model_code]);

  const selectInventoryVehicle = useCallback(
    (vehicle: InventoryVehicle) => {
      setSelectedInventory(vehicle);
      setManualVin('');
      setVehiclePrice(String(vehicle.asking_price || vehicle.msrp || ''));
    },
    [setVehiclePrice]
  );

  const clearInventorySelection = useCallback(() => {
    setSelectedInventory(null);
    setManualVin('');
    setAutoFinancing(null);
    setVehiclePrice('');
  }, [setVehiclePrice]);

  return {
    inventoryList,
    setInventoryList,
    selectedInventory,
    setSelectedInventory,
    showInventoryPicker,
    setShowInventoryPicker,
    manualVin,
    setManualVin,
    autoFinancing,
    setAutoFinancing,
    loadInventory,
    selectInventoryVehicle,
    clearInventorySelection,
  };
}
