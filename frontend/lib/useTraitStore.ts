"use client";

import { create } from "zustand";
import { fetchTraits, fetchRules, saveRules } from "@/lib/api";

type TraitType = {
  type: string;
  value: string;
  image: string;
  context?: string;
};

type RulesType = {
  weights?: Record<string, Record<string, number>>;
  showTo?: Record<string, any>;
  tags?: Record<string, any>;
  specific?: any[];
  global?: Record<string, any>;
  [key: string]: any;
};

type TraitStore = {
  traits: TraitType[];
  rules: RulesType;
  autoSync: boolean;
  fetchAll: () => Promise<void>;
  setTraits: (traits: TraitType[]) => void;
  setRules: (rules: RulesType, options?: { sync?: boolean }) => void;
  setAutoSync: (value: boolean) => void;
  syncToBackend: () => Promise<void>;
};

export const useTraitStore = create<TraitStore>((set, get) => ({
  traits: [],
  rules: {},
  autoSync: true,

  fetchAll: async () => {
    const [traits, rules] = await Promise.all([fetchTraits(), fetchRules()]);
    set({ traits, rules });
  },

  setTraits: (traits: TraitType[]) => set({ traits }),

  setAutoSync: (value: boolean) => set({ autoSync: value }),

  setRules: (rules: RulesType, options = { sync: true }) => {
    set((state) => {
      // pastikan weights selalu ada bentuknya (bukan undefined)
      const mergedWeights = {
        ...(state.rules.weights || {}),
        ...(rules.weights || {}),
      };
      return {
        rules: {
          ...state.rules,
          ...rules,
          weights: mergedWeights,
        },
      };
    });

    if (get().autoSync && options.sync) {
      get().syncToBackend();
    }
  },

  syncToBackend: async () => {
    try {
      const { rules } = get();
      // ✅ kirim HANYA weights ke /api/save-rules
      await saveRules({ weights: rules.weights || {} });
      console.log("✅ Rules synced to backend");
    } catch (err) {
      console.error("❌ Failed to sync rules:", err);
    }
  },
}));
