import AsyncStorage from '@react-native-async-storage/async-storage';

export type HomeSectionId = 'hero' | 'silver' | 'quickActions' | 'overview' | 'topPieces' | 'recentActivity';

export const DEFAULT_HOME_SECTION_ORDER: HomeSectionId[] = [
  'hero',
  'silver',
  'quickActions',
  'overview',
  'topPieces',
  'recentActivity',
];

const STORAGE_KEY = 'elaris.homeSectionOrder';

function isValidOrder(value: unknown): value is HomeSectionId[] {
  if (!Array.isArray(value)) return false;
  if (value.length !== DEFAULT_HOME_SECTION_ORDER.length) return false;
  const asSet = new Set(value);
  return DEFAULT_HOME_SECTION_ORDER.every((id) => asSet.has(id));
}

/** Falls back to the default order if nothing is stored, or if the stored
 * value doesn't match the current set of sections (e.g. after an app update
 * added or removed one). */
export async function getHomeSectionOrder(): Promise<HomeSectionId[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_HOME_SECTION_ORDER;
  try {
    const parsed = JSON.parse(raw);
    return isValidOrder(parsed) ? parsed : DEFAULT_HOME_SECTION_ORDER;
  } catch {
    return DEFAULT_HOME_SECTION_ORDER;
  }
}

export async function setHomeSectionOrder(order: HomeSectionId[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(order));
}

export async function resetHomeSectionOrder(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
