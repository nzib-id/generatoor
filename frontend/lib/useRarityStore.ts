// lib/useRarityStore.ts
import { create } from "zustand";

type RankInfo = { rank: number; score: number };

type State = {
  rankById: Map<string | number, RankInfo> | null;
  total: number;
  setRanking: (rankById: Map<string | number, RankInfo>, total: number) => void;
  getRank: (id: string | number) => RankInfo | null;
  clear: () => void;
};

export const useRarityStore = create<State>((set, get) => ({
  rankById: null,
  total: 0,
  setRanking: (rankById, total) => set({ rankById, total }),
  getRank: (id) => {
    const m = get().rankById;
    return m ? m.get(id) ?? null : null;
  },
  clear: () => set({ rankById: null, total: 0 }),
}));
