import type { WeightLevel, UserWeights } from "../types";
import { SENSITIVE_PENALTIES } from "./scoreCalculator";

export const WEIGHT_MULTIPLIERS: Record<WeightLevel, number> = {
  normal: 1,
  important: 1.5,
  critical: 2
};

export const WEIGHT_LABELS: Record<WeightLevel, string> = {
  normal: "×1",
  important: "×1.5",
  critical: "×2"
};

export const WEIGHT_LEVEL_NAMES: Record<WeightLevel, string> = {
  normal: "Normal",
  important: "High",
  critical: "Critical"
};

const STORAGE_KEY = "user_weights_v1";

export const DEFAULT_WEIGHTS: UserWeights = Object.fromEntries(
  Object.keys(SENSITIVE_PENALTIES).map((key) => [key, "normal" as WeightLevel])
);

export const loadWeights = async (): Promise<UserWeights> => {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const saved = stored[STORAGE_KEY] as UserWeights | undefined;
  if (!saved) return { ...DEFAULT_WEIGHTS };
  // Merge with defaults to handle any new keys added after the user last saved
  return { ...DEFAULT_WEIGHTS, ...saved };
};

export const saveWeights = async (weights: UserWeights): Promise<void> => {
  await chrome.storage.local.set({ [STORAGE_KEY]: weights });
};
