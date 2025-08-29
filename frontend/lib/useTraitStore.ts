"use client";

import { create } from "zustand";
import { fetchTraits, fetchRules } from "@/lib/api";

type TraitType = {
  type: string;
  value: string;
  image: string;
  context?: string;
};

type RulesType = Record<string, any>;

type TraitStore = {
  traits: TraitType[];
  rules: RulesType;
  fetchAll: () => Promise<void>;
  setTraits: (traits: TraitType[]) => void;
  setRules: (rules: RulesType) => void;
};

export const useTraitStore = create<TraitStore>((set) => ({
  traits: [],
  rules: {},
  fetchAll: async () => {
    const [traits, rules] = await Promise.all([fetchTraits(), fetchRules()]);
    set({ traits, rules });
  },
  setTraits: (traits: TraitType[]) => set({ traits }),
  setRules: (rules: RulesType) => set({ rules }),
}));
