"use client";

import { useEffect, useState, useRef } from "react";
import { useTraitStore } from "@/lib/useTraitStore";
import SliderInput from "@/components/ui/SliderInput";
import AppImage from "@/components/ui/AppImage";
import toast from "react-hot-toast";
import { FaSave } from "react-icons/fa";
import { saveRules } from "@/lib/api";
import { sanitize } from "@/lib/sanitize";

// range slider kayak Bueno
const MAX_WEIGHT = 200;
const DEFAULT_WEIGHT = 100;

type TraitType = {
  type: string;
  value: string;
  image: string;
  context?: string;
};

export default function TraitsPage() {
  const traits = useTraitStore((s) => s.traits);
  const rules = useTraitStore((s) => s.rules);
  const fetchAll = useTraitStore((s) => s.fetchAll);

  const ctxKey = (traitType: string, context: string) =>
    `${sanitize(traitType)}__${sanitize(context || "")}`;

  const traitsByTypeCtx = traits.reduce((acc, t) => {
    const key = ctxKey(t.type, t.context || "");
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {} as Record<string, TraitType[]>);

  const [weights, setWeights] = useState<
    Record<string, Record<string, number>>
  >({});

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (traits.length === 0) return;

    const allKeys = Object.keys(traitsByTypeCtx);
    const newWeights: Record<string, Record<string, number>> = {};

    allKeys.forEach((key) => {
      newWeights[key] = {};
      const fromRules = rules.weights?.[key] || {};
      traitsByTypeCtx[key].forEach((trait) => {
        const saved = fromRules[trait.value];
        newWeights[key][trait.value] =
          typeof saved === "number" ? saved : DEFAULT_WEIGHT;
      });
    });

    setWeights(newWeights);
  }, [traits.length, rules]);

  const debounce = <T extends (...args: any[]) => void>(
    fn: T,
    delay: number
  ) => {
    let timer: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  };

  const debouncedSave = useRef(
    debounce(async (updatedWeights: Record<string, Record<string, number>>) => {
      try {
        await saveRules({ weights: updatedWeights });

        // merge ke global store
        const prev = useTraitStore.getState().rules.weights || {};
        const merged = { ...prev };
        Object.entries(updatedWeights).forEach(([key, obj]) => {
          merged[key] = { ...(prev[key] || {}), ...obj };
        });
        useTraitStore.getState().setRules({ weights: merged });

        console.log("✅ Saved updated weights (Bueno-style)");
      } catch (err) {
        console.error("❌ Failed to save weights", err);
      }
    }, 600)
  ).current;

  const handleWeightChange = (
    key: string,
    value: string,
    newWeight: number
  ) => {
    setWeights((prev) => {
      // clone grup yang dimaksud
      const group = { ...(prev[key] || {}) };

      // ubah hanya 1 trait yang digeser
      group[value] = newWeight;

      // simpan hasil baru ke state global
      const updated = { ...prev, [key]: group };

      // debounce save ke backend (biar gak spam tiap geser)
      debouncedSave({ [key]: group });

      return updated;
    });
  };

  const handleSaveAll = async (key: string) => {
    try {
      await saveRules({ weights: { [key]: weights[key] } });
      toast.success(`Saved (${key})`);
    } catch (err) {
      toast.error("Failed to save weights");
      console.error(err);
    }
  };

  return (
    <main>
      <h1 className="text-5xl font-bold mb-6">Traits</h1>

      {Object.entries(traitsByTypeCtx).map(([key, traitList]) => {
        const [traitType, context] = key.split("__");
        const totalWeight = Object.values(weights[key] || {}).reduce(
          (a, b) => a + b,
          0
        );

        return (
          <div key={key} className="mb-20 border-4 p-10">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-4xl font-bold">
                {traitType}
                {context && (
                  <span className="ml-3 px-3 py-1 bg-[#444] rounded text-lg uppercase tracking-widest">
                    {context}
                  </span>
                )}
              </h2>
              <button
                onClick={() => handleSaveAll(key)}
                className="text-2xl bg-[#FFDF0F] active:translate-y-1 px-3 py-1 text-black flex items-center gap-1 cursor-pointer"
              >
                <FaSave /> Save All
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-5 gap-x-6 gap-y-8 p-10 max-h-150 overflow-auto">
              {traitList.map((trait) => {
                const value = trait.value;
                const weight = weights[key]?.[value] ?? DEFAULT_WEIGHT;
                const estPercent =
                  totalWeight > 0
                    ? ((weight / totalWeight) * 100).toFixed(1)
                    : 0;

                return (
                  <div
                    key={trait.image}
                    className="grid gap-3 border p-5 text-center rounded-xl transition-all"
                    style={{
                      borderColor: "rgba(255,255,255,0.1)",
                    }}
                  >
                    <div className="relative aspect-square w-full">
                      <AppImage path={trait.image} alt={value} pixelated fill />
                    </div>

                    <div className="text-2xl font-bold">{value}</div>

                    <div className="flex flex-col gap-2">
                      <SliderInput
                        value={weight}
                        onChange={(v: number) =>
                          handleWeightChange(key, value, v)
                        }
                      />
                      <div className="text-xl opacity-70 text-right">
                        {estPercent}% estimated
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </main>
  );
}
