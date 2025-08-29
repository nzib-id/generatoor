"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface TraitType {
  type: string;
  value: string;
  image: string;
  context?: string;
}

interface RuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rule: any) => void;
  traits: TraitType[];
  mode: "exclude" | "require" | "pair";
}

interface TraitItem {
  trait_type: string;
  value: string;
  image: string;
  context?: string;
}

export default function RuleModal({
  isOpen,
  onClose,
  onSave,
  traits,
  mode,
}: RuleModalProps) {
  const [allItems, setAllItems] = useState<Record<string, TraitItem[]>>({});
  const [primary, setPrimary] = useState<TraitItem | null>(null);
  const [secondary, setSecondary] = useState<TraitItem[]>([]);
  const [openTraits, setOpenTraits] = useState<Record<string, boolean>>({});

  const baseUrl = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    if (!isOpen) return;

    // Kumpulin trait_type unik
    const traitTypes = Array.from(new Set(traits.map((t) => t.type)));

    const fetchData = async () => {
      const data: Record<string, TraitItem[]> = {};

      for (const traitType of traitTypes) {
        // Ambil semua item dari array traits yang type nya sama
        const items = traits
          .filter((t) => t.type === traitType)
          .map((t) => ({
            trait_type: t.type,
            value: t.value,
            image: baseUrl + t.image,
            context: t.context, // << PATCH
          }));
        data[traitType] = items;
      }

      setAllItems(data);
    };

    fetchData();
    setPrimary(null);
    setSecondary([]);
  }, [isOpen, traits]);

  if (!isOpen) return null;

  // Semua COMPARE dan KEY harus ikut context biar ga ketuker antar gender/context!
  const isSameTrait = (a: TraitItem | null, b: TraitItem) =>
    a?.trait_type === b.trait_type &&
    a.value === b.value &&
    a.context === b.context;

  const handlePrimarySelect = (item: TraitItem) => {
    if (isSameTrait(primary, item)) {
      setPrimary(null);
      setSecondary([]);
    } else {
      setPrimary(item);
      setSecondary([]);
    }
  };

  const handleSecondaryToggle = (item: TraitItem) => {
    if (
      primary &&
      item.trait_type === primary.trait_type &&
      item.context === primary.context
    )
      return;

    const exists = secondary.find((s) => isSameTrait(s, item));
    if (exists) {
      setSecondary(secondary.filter((s) => !isSameTrait(s, item)));
    } else {
      setSecondary([...secondary, item]);
    }
  };

  const handleSubmit = async () => {
    if (!primary || secondary.length === 0) return;

    const rule: any = {
      trait: primary.trait_type,
      value: primary.value,
      context: primary.context, // <-- PATCH
    };

    if (mode === "exclude")
      rule.exclude_with = secondary.map(({ trait_type, value, context }) => ({
        trait: trait_type,
        value,
        context, // <-- PATCH
      }));
    if (mode === "require")
      rule.require_with = secondary.map(({ trait_type, value, context }) => ({
        trait: trait_type,
        value,
        context, // <-- PATCH
      }));
    if (mode === "pair")
      rule.always_with = secondary.map(({ trait_type, value, context }) => ({
        trait: trait_type,
        value,
        context, // <-- PATCH
      }));

    try {
      const res = await fetch(`${baseUrl}/api/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          global: {},
          specific: [rule],
          mode: "append",
        }),
      });

      const data = await res.json();

      if (data.message) {
        toast.success("Rules Added!");
        onSave({ ...rule, mode: "append" });
        onClose();
      } else {
        toast.error("Error Saving Rules");
      }
    } catch (err) {
      console.error("Error:", err);
      toast.error("Error Saving Rules");
    }
  };

  const handleSelectAll = (trait_type: string) => {
    const items = allItems[trait_type] || [];

    if (primary?.trait_type === trait_type && primary?.context) return;

    const filtered = items.filter(
      (item) => !secondary.some((s) => isSameTrait(s, item))
    );

    setSecondary([...secondary, ...filtered]);
  };

  const handleUnselectAll = (trait_type: string) => {
    setSecondary(secondary.filter((item) => item.trait_type !== trait_type));
  };

  const isAllSelected = (trait_type: string) => {
    const items = allItems[trait_type] || [];
    const selected = items.filter((item) =>
      secondary.some((s) => isSameTrait(s, item))
    );
    return selected.length === items.length;
  };

  const getTitle = () => {
    if (mode === "exclude") return "Doesn't mix with";
    if (mode === "require") return "Only mix with";
    if (mode === "pair") return "Always pair with";
  };

  return (
    <div className="fixed z-50 inset-0 bg-black/50 flex items-center justify-center  overflow-hidden">
      <div className="bg-262626 rounded-lg p-6 w-4xl h-[80vh] bg-[#262626] overflow-y-auto drop-shadow-2xl border-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-bold">Create Rules</h2>
          <button onClick={onClose} className="text-white cursor-pointer">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              className="stroke-4 stroke-white active:translate-y-1"
              xmlns="http://www.w3.org/2000/svg"
            >
              <line x1="4" y1="4" x2="20" y2="20" />
              <line x1="20" y1="4" x2="4" y2="20" />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-between p-4 border mb-6">
          <div
            className={`w-[45%] h-24 border flex flex-row gap-5 items-center justify-center ${
              primary ? "cursor-pointer" : ""
            }`}
            onClick={() => {
              if (primary) {
                setPrimary(null);
              }
            }}
          >
            {primary ? (
              <>
                <img
                  src={primary.image}
                  alt={primary.value}
                  className="h-10 border"
                />
                <span className="text-xl">
                  {primary.trait_type}/{primary.value}
                  {primary.context && (
                    <span className="ml-2 inline-block px-2 py-1 bg-[#444] text-xs rounded">
                      {primary.context}
                    </span>
                  )}
                </span>
              </>
            ) : (
              <span className="text-2xl">Select a Trait</span>
            )}
          </div>
          <div className="text-center font-bold">{getTitle()}</div>
          <div
            className={`w-[45%] h-24 border rounded flex flex-wrap items-center justify-center border overflow-y-auto ${
              secondary.length > 0 ? "cursor-pointer" : ""
            }`}
            onClick={() => {
              if (secondary) {
                setSecondary([]);
              }
            }}
          >
            {secondary.length > 0 ? (
              secondary.map((item) => (
                <img
                  key={`${item.trait_type}-${item.value}-${
                    item.context ?? ""
                  }-${item.image}`}
                  src={item.image}
                  alt={item.value}
                  className="h-10 mx-1"
                />
              ))
            ) : (
              <span className="text-2xl">Select one or more traits</span>
            )}
          </div>
        </div>

        <div className="overflow-auto flex flex-col gap-10 max-h-[65%] select-none p-5">
          {Object.entries(allItems).map(([trait_type, items]) => (
            <div key={trait_type} className="border p-5">
              <div
                onClick={() =>
                  setOpenTraits((prev) => ({
                    ...prev,
                    [trait_type]: !prev[trait_type],
                  }))
                }
                className="flex mb-5 items-center cursor-pointer"
              >
                <h3 className="font-semibold text-2xl mb-2 capitalize flex items-center gap-4">
                  {trait_type} ({items.length}){" "}
                  <button
                    className="text-sm bg-white text-black px-2 py-1 rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isAllSelected(trait_type)) {
                        handleUnselectAll(trait_type);
                      } else {
                        handleSelectAll(trait_type);
                      }
                    }}
                    disabled={primary?.trait_type === trait_type}
                  >
                    {isAllSelected(trait_type) ? "Unselect All" : "Select All"}
                  </button>
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-5">
                {items.map((item) => {
                  const isPrimary = isSameTrait(primary, item);
                  const isSecondary = secondary.some((s) =>
                    isSameTrait(s, item)
                  );

                  return (
                    <div
                      key={`${item.trait_type}-${item.value}-${
                        item.context ?? ""
                      }-${item.image}`}
                      className={`border p-5 cursor-pointer flex gap-5 items-center ${
                        isPrimary || isSecondary ? "ring-2 ring-[#FFDF0F]" : ""
                      } ${openTraits[trait_type] ? "hidden" : ""}`}
                      onClick={() => {
                        if (isPrimary) {
                          setPrimary(null);
                          setSecondary([]);
                        } else if (!primary) {
                          handlePrimarySelect(item);
                        } else if (
                          item.trait_type === primary.trait_type &&
                          item.context === primary.context
                        ) {
                          handlePrimarySelect(item); // ini yang penting
                        } else {
                          handleSecondaryToggle(item);
                        }
                      }}
                    >
                      <img
                        src={item.image}
                        alt={item.value}
                        className="h-15 w-15 object-contain border hover:scale-200 hover:bg-white transition-all ease-in-out"
                      />
                      <p className="text-xl flex-1 text-center mt-1 leading-5">
                        {item.value}
                        {item.context && (
                          <span className="ml-2 inline-block px-2 py-1 bg-[#444] text-xs rounded">
                            {item.context}
                          </span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1 border-4 text-2xl active:translate-y-1 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={
              !primary || secondary.length === 0
                ? () => toast.error("Input Some Rules!")
                : handleSubmit
            }
            className="bg-[#FFDF0F] text-[#262626] text-2xl px-4 py-1 active:translate-y-1 cursor-pointer"
          >
            Create Rules
          </button>
        </div>
      </div>
    </div>
  );
}
