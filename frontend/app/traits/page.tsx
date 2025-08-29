"use client";

import { useEffect, useState } from "react";
import { useTraitStore } from "@/lib/useTraitStore";
import { useGeneratorState } from "@/lib/state";
import SliderInput from "@/components/ui/SliderInput";
import AppImage from "@/components/ui/AppImage";
import toast from "react-hot-toast";
import Link from "next/link";
import {
  FaHashtag,
  FaPercentage,
  FaSave,
  FaLock,
  FaLockOpen,
} from "react-icons/fa";
import Image from "next/image";
import { saveRules } from "@/lib/api";

type TraitType = {
  type: string;
  value: string;
  image: string;
  context?: string; // <<< ini WAJIB ADA!
};

export default function TraitsPage() {
  const traits = useTraitStore((s) => s.traits);
  const rules = useTraitStore((s) => s.rules);
  const fetchAll = useTraitStore((s) => s.fetchAll);

  // === KEY PATCH: all weights/datas are by type__context ===
  const ctxKey = (traitType: string, context: string) =>
    `${traitType}__${context || ""}`;

  // Group traits by [type+context] for display+logic
  const traitsByTypeCtx = traits.reduce((acc, t) => {
    const key = ctxKey(t.type, t.context || "");
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {} as Record<string, TraitType[]>);

  // ========== STATE ==========

  // All state use key [type__context]
  const [weights, setWeights] = useState<
    Record<string, Record<string, number>>
  >({});
  const [inputModes, setInputModes] = useState<
    Record<string, Record<string, "percent" | "integer">>
  >({});
  const [initialWeights, setInitialWeights] = useState<
    Record<string, Record<string, number>>
  >({});
  const [lockedTraits, setLockedTraits] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [totalAmount, setTotalAmount] = useState(1000);

  const { totalAmount: globalTotalAmount } = useGeneratorState();

  // INIT DATA (weight, mode, lock)
  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (traits.length === 0) return;

    // Get all ctx keys
    const allKeys = Object.keys(traitsByTypeCtx);

    // === INIT DEFAULT WEIGHTS
    const defaultWeights: Record<string, Record<string, number>> = {};
    allKeys.forEach((key) => {
      const list = traitsByTypeCtx[key];
      const defaultPerItem = Math.floor(totalAmount / list.length);
      defaultWeights[key] = {};
      list.forEach((trait) => {
        defaultWeights[key][trait.value] = defaultPerItem;
      });
    });

    // === INIT FROM RULES (weights di rules.json)
    const mergedWeights: Record<string, Record<string, number>> = {};
    allKeys.forEach((key) => {
      mergedWeights[key] = {};
      const fromRules = rules.weights?.[key] || {};
      const fromDefault = defaultWeights[key];
      for (const value of Object.keys(fromDefault)) {
        mergedWeights[key][value] = fromRules[value] || fromDefault[value];
      }
    });

    setWeights(mergedWeights);
    setInitialWeights(mergedWeights);

    // === INIT input mode & lock
    const modes: Record<string, Record<string, "percent" | "integer">> = {};
    const locks: Record<string, Record<string, boolean>> = {};
    allKeys.forEach((key) => {
      modes[key] = {};
      locks[key] = {};
      traitsByTypeCtx[key].forEach((trait) => {
        modes[key][trait.value] = "integer";
        locks[key][trait.value] = false;
      });
    });
    setInputModes(modes);
    setLockedTraits(locks);

    // === langsung auto balance setelah init
    allKeys.forEach((key) => {
      autoBalanceWeights(key);
    });

    // Total Amount dari localStorage kalau ada
    const savedAmount = localStorage.getItem("amount");
    if (savedAmount) setTotalAmount(parseInt(savedAmount));
    // eslint-disable-next-line
  }, [traits.length, rules]);

  useEffect(() => {
    if (
      globalTotalAmount &&
      globalTotalAmount > 0 &&
      globalTotalAmount !== totalAmount
    ) {
      setTotalAmount(globalTotalAmount);
    }
  }, [globalTotalAmount]);

  // ========== FUNGSI2 CORE ==========

  // tambahin debounce util (misal di atas file atau bikin helper)
  function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
    let timer: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  // bikin 1 instance debouncedSave
  const debouncedSave = debounce(async (updatedWeights) => {
    try {
      await saveRules({ weights: updatedWeights });
      // update global store biar sync
      useTraitStore.getState().setRules({ weights: updatedWeights });
      console.log("Auto saved to backend");
    } catch (err) {
      console.error("Failed to auto save", err);
    }
  }, 500); // 500ms setelah terakhir edit

  const handleWeightChange = (key: string, value: string, weight: number) => {
    const safeWeight = Math.min(Math.max(1, weight), totalAmount);

    // update local state
    const newWeights = {
      ...weights,
      [key]: {
        ...weights[key],
        [value]: safeWeight,
      },
    };
    setWeights(newWeights);

    // update langsung ke global store
    useTraitStore.getState().setRules({ weights: newWeights });

    // trigger debounced save ke backend
    debouncedSave(newWeights);
  };

  const handleToggleMode = (key: string, value: string) => {
    setInputModes((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [value]: prev[key][value] === "percent" ? "integer" : "percent",
      },
    }));
  };

  const toggleLock = (key: string, value: string) => {
    setLockedTraits((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [value]: !prev[key][value],
      },
    }));
  };

  // Patch: all weights/modes/locked pakai ctxKey
  const autoBalanceWeights = (key: string) => {
    const rawTraits = traitsByTypeCtx[key] || [];
    const allValues = rawTraits.map((trait) => trait.value);

    const traitWeights: Record<string, number> = {};
    allValues.forEach((value) => {
      traitWeights[value] = weights[key]?.[value] || 1;
    });

    const modes = inputModes[key] || {};
    const locked = lockedTraits[key] || {};

    const converted: Record<string, number> = {};
    let lockedTotal = 0;

    for (const [v, val] of Object.entries(traitWeights)) {
      const isPercent = modes[v] === "percent";
      const intVal = isPercent ? Math.round((val / 100) * totalAmount) : val;
      converted[v] = intVal;
      if (locked[v]) lockedTotal += intVal;
    }

    const unlocked = Object.entries(converted).filter(([k]) => !locked[k]);
    const unlockedCount = unlocked.length;

    const minNeeded = lockedTotal + unlockedCount;
    if (minNeeded > totalAmount) {
      toast.error(`inbalanced locked amount`);
      return;
    }

    const unlockedTotal = unlocked.reduce((sum, [_, val]) => sum + val, 0);
    const remaining = totalAmount - lockedTotal;

    const adjusted: Record<string, number> = {};
    for (const [k, val] of unlocked) {
      adjusted[k] = Math.max(1, Math.round((val / unlockedTotal) * remaining));
    }

    const adjustedSum = Object.values(adjusted).reduce((a, b) => a + b, 0);
    const overflow = adjustedSum - remaining;
    if (overflow > 0) {
      const keysSorted = Object.entries(adjusted)
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => k);
      let i = 0;
      let reduceLeft = overflow;
      while (reduceLeft > 0 && i < keysSorted.length) {
        const k = keysSorted[i];
        if (adjusted[k] > 1) {
          adjusted[k] -= 1;
          reduceLeft -= 1;
        }
        i++;
      }
    }

    const final: Record<string, number> = {};
    for (const [k] of Object.entries(traitWeights)) {
      if (locked[k]) {
        final[k] = traitWeights[k];
      } else {
        const newVal = adjusted[k];
        final[k] =
          modes[k] === "percent"
            ? Math.round((newVal / totalAmount) * 100)
            : newVal;
      }
    }

    setWeights((prev) => ({
      ...prev,
      [key]: final,
    }));
  };

  const hasChanges = (key: string): boolean => {
    const current = weights[key] || {};
    const initial = initialWeights[key] || {};
    return Object.keys(current).some((k) => current[k] !== initial[k]);
  };

  const handleSaveAll = async (key: string) => {
    const updatedWeights = {
      ...initialWeights,
      [key]: { ...weights[key] },
    };

    try {
      await saveRules({ weights: updatedWeights });
      toast.success(`Saved (${key})`);
      setInitialWeights(updatedWeights);
    } catch (err) {
      toast.error("Failed to save weights");
      console.error(err);
    }
  };

  // ========== RENDER ==========

  return (
    <main className="">
      <h1 className="text-5xl font-bold mb-6">Traits</h1>

      {Object.entries(traitsByTypeCtx).map(([key, traitList]) => {
        const [traitType, context] = key.split("__");
        const itemCount = traitList.length; // ⬅️ total item di layer ini
        return (
          <div key={key} className="mb-20 border-4 p-10 ">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-4xl font-bold">
                {traitType}
                {context && context.length > 0 && (
                  <span className="ml-3 px-3 py-1 bg-[#444] rounded text-lg uppercase tracking-widest">
                    {context}
                  </span>
                )}
              </h2>

              {/* Badge total item */}
              <span className="px-3 py-1 text-white rounded text-xl">
                {itemCount} items
              </span>
            </div>

            <div className="flex justify-between items-center mb-2">
              <button
                onClick={() => autoBalanceWeights(key)}
                className="text-xl border-4 border-blue-700 active:translate-y-1 px-3 py-1 text-white cursor-pointer"
              >
                Auto Balance
              </button>

              {hasChanges(key) && (
                <button
                  onClick={() => handleSaveAll(key)}
                  className="text-2xl bg-[#FFDF0F] active:translate-y-1 px-3 py-1 text-black flex items-center gap-1 cursor-pointer"
                >
                  <FaSave />
                  Save All
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-5 p-10 gap-x-6 gap-y-8 max-h-150 overflow-auto">
              {traitList.map((trait) => {
                const value = trait.value;
                const currentWeight = weights[key]?.[value] || 1;
                const mode = inputModes[key]?.[value] || "integer";
                const isLocked = lockedTraits[key]?.[value] || false;

                return (
                  <div
                    key={trait.image}
                    className="grid gap-3 border p-5 text-center"
                  >
                    <div className="relative aspect-square w-full">
                      <AppImage path={trait.image} alt={value} pixelated fill />
                    </div>

                    <div className="text-2xl">{value}</div>

                    {mode === "percent" ? (
                      <div className="flex flex-col gap-2">
                        <SliderInput
                          min={0}
                          max={100}
                          value={currentWeight}
                          onChange={(newValue: number) => {
                            handleWeightChange(key, value, newValue);
                          }}
                        />
                        <div className="text-xl opacity-70 text-right">
                          Appears:{" "}
                          {((currentWeight / totalAmount) * 100).toFixed(2)}%
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <input
                          type="number"
                          min={0}
                          max={totalAmount}
                          value={currentWeight}
                          onChange={(e) =>
                            handleWeightChange(
                              key,
                              value,
                              parseInt(e.target.value)
                            )
                          }
                          className="w-full mt-1 px-2 py-1 border-2 text-2xl text-white font-medium no-spinner"
                        />
                        <div className="text-xl opacity-70 text-right">
                          Appears:{" "}
                          {((currentWeight / totalAmount) * 100).toFixed(2)}%
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-center mt-1">
                      <button
                        onClick={() => handleToggleMode(key, value)}
                        className="p-2 rounded text-white border flex items-center justify-center active:translate-y-1 cursor-pointer"
                      >
                        {mode === "percent" ? <FaHashtag /> : <FaPercentage />}
                      </button>

                      <button
                        onClick={() => toggleLock(key, value)}
                        className={`text-xl p-2 flex items-center gap-1 ${
                          isLocked ? "bg-[#FFDF0F] text-black" : "bg-gray-600"
                        } active:translate-y-1 cursor-pointer`}
                      >
                        {isLocked ? <FaLock /> : <FaLockOpen />}
                      </button>
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
