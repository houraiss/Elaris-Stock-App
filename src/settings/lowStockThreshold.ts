import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'elaris.lowStockThreshold';
export const DEFAULT_LOW_STOCK_THRESHOLD = 2;

export async function getLowStockThreshold(): Promise<number> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_LOW_STOCK_THRESHOLD;
}

export async function setLowStockThreshold(threshold: number): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.round(threshold))));
}
