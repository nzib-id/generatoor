import { create } from "zustand";

type GeneratorState = {
  totalAmount: number;
  setTotalAmount: (n: number) => void;
};

export const useGeneratorState = create<GeneratorState>((set) => ({
  totalAmount: 0,
  setTotalAmount: (n) => set({ totalAmount: n }),
}));
