// ShowToModal.tsx
"use client";

import { useState, useEffect } from "react";
import { beautify } from "@/lib/sanitize"; // kalau ada; kalau tidak, hapus
import AppImage from "../ui/AppImage";

type TraitType = {
  type: string;
  value: string;
  image: string;
  context?: string;
};

interface ShowToModalProps {
  item: { trait_type: string; value: string };
  currentTags: string[];
  onClose: () => void;
  onSave: (payload: {
    trait_type: string;
    value: string;
    tags: string[];
  }) => void;
  traits: TraitType[];
  showToMap?: Record<string, Record<string, string[]>>;
}

export default function ShowToModal({
  item,
  currentTags,
  onClose,
  onSave,
  traits,
  showToMap = {},
}: ShowToModalProps) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;

  const [traitType, setTraitType] = useState(item.trait_type || "");
  const [value, setValue] = useState(item.value || "");
  const [selectedFile, setSelectedFile] = useState("");
  const [selectedContext, setSelectedContext] = useState<string>("");

  const [tags, setTags] = useState<string[]>(currentTags || []);
  const [newTag, setNewTag] = useState("");

  const availableTraitTypes = Array.from(new Set(traits.map((t) => t.type)));
  const availableValues = traits.filter((t) => t.type === traitType);

  useEffect(() => {
    if (traitType) {
      setValue("");
      setSelectedFile("");
      setSelectedContext("");
    }
  }, [traitType]);

  useEffect(() => {
    if (traitType && value) {
      const existing = showToMap?.[traitType]?.[value] ?? currentTags ?? [];
      setTags(existing);

      const match = traits.find(
        (t) => t.type === traitType && t.value === value
      );
      if (match) {
        setSelectedFile(match.image);
        setSelectedContext(match.context || "");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traitType, value]);

  const handleSave = () => {
    if (!traitType || !value) {
      alert("Pilih trait type & value dulu.");
      return;
    }
    const typed = (newTag || "").trim().toLowerCase();
    const finalTags = Array.from(
      new Set([...(tags || []), ...(typed ? [typed] : [])])
    ).filter(Boolean);
    if (finalTags.length === 0) {
      alert("Tambahkan minimal 1 tag (mis. 'male').");
      return;
    }
    onSave({ trait_type: traitType, value, tags: finalTags });
  };

  return (
    <div className="fixed z-50 inset-0 bg-black/50 flex items-center justify-center overflow-hidden">
      <div className="bg-[#262626] rounded-lg p-6 w-[min(1100px,95vw)] h-[85vh] overflow-y-auto drop-shadow-2xl border-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-3xl font-bold">Add ShowTo Rule</h2>
          <button
            onClick={onClose}
            className="text-white cursor-pointer"
            aria-label="Close modal"
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              className="stroke-4 stroke-white active:translate-y-1"
              xmlns="http://www.w3.org/2000/svg"
            >
              <line x1="4" y1="4" x2="20" y2="20" />
              <line x1="20" y1="4" x2="4" y2="20" />
            </svg>
          </button>
        </div>

        {/* Type selector */}
        <div className="mb-6 flex gap-3 flex-wrap">
          {availableTraitTypes.map((tt) => (
            <button
              key={tt}
              onClick={() => setTraitType(tt)}
              className={`px-3 py-1 border-4 text-xl active:translate-y-1 ${
                traitType === tt ? "border-purple-500" : "border-white/20"
              }`}
              title={tt}
            >
              {beautify ? beautify(tt) : tt}
            </button>
          ))}
        </div>

        {/* Value grid */}
        <h3 className="text-2xl mb-3">Select Trait Value</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-6">
          {availableValues.map((t) => {
            const isActive = value === t.value;
            return (
              <button
                key={`${t.type}:${t.value}:${t.context || ""}`}
                onClick={() => {
                  setValue(t.value);
                  setSelectedFile(t.image);
                  setSelectedContext(t.context || "");
                }}
                className={`relative border-4 p-2 text-left active:translate-y-1 ${
                  isActive ? "border-purple-500" : "border-white/20"
                }`}
                title={`${t.type}/${t.value}${
                  t.context ? ` (${t.context})` : ""
                }`}
              >
                <div className="relative w-full aspect-square overflow-hidden bg-[#2a2a2a]">
                  <AppImage
                    path={`${baseUrl}${t.image}`}
                    alt={t.value}
                    className="object-contain w-full h-full"
                    pixelated
                  />
                  {t.context ? (
                    <span className="absolute top-2 left-2 px-2 py-1 text-xs uppercase tracking-wide bg-[#444]">
                      {t.context}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 text-center text-xl">
                  {beautify ? beautify(t.value) : t.value}
                </div>
              </button>
            );
          })}
          {traitType && availableValues.length === 0 && (
            <div className="border-4 border-white/20 p-4 text-center col-span-full opacity-70">
              No values
            </div>
          )}
        </div>

        {/* Selection info */}
        {value && (
          <div className="mb-6 text-lg opacity-80">
            Selected:&nbsp;<b>{beautify ? beautify(traitType) : traitType}</b> /{" "}
            <b>{beautify ? beautify(value) : value}</b>
            {selectedContext && (
              <>
                {" — "}
                <span className="uppercase px-2 py-0.5 bg-[#333]">
                  {selectedContext}
                </span>
              </>
            )}
            <div className="text-sm mt-1 opacity-60">
              Note: ShowTo disimpan per <i>value</i> (bukan per{" "}
              <code>context</code>).
            </div>
          </div>
        )}

        {/* Tag input */}
        <div className="mb-3 flex items-center gap-3">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const t = newTag.trim().toLowerCase();
                if (t && !tags.includes(t)) setTags([...tags, t]);
                setNewTag("");
              }
            }}
            placeholder="Tambah tag (mis. male)"
            className="px-3 py-2 border-2 border-white/20 bg-transparent"
          />
          <button
            onClick={() => {
              const t = newTag.trim().toLowerCase();
              if (t && !tags.includes(t)) setTags([...tags, t]);
              setNewTag("");
            }}
            className="border-4 border-purple-500 px-3 py-1 text-xl active:translate-y-1"
          >
            Add
          </button>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t}
              className="px-2 py-1 bg-[#444] uppercase tracking-wide"
            >
              {t}
            </span>
          ))}
          {tags.length === 0 && (
            <span className="opacity-60">Belum ada tag</span>
          )}
        </div>

        {/* Footer */}
        <div className="mt-2 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1 border-4 text-2xl active:translate-y-1"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={
              !traitType || !value || (tags.length === 0 && !newTag.trim())
            }
            className="bg-[#FFDF0F] text-[#262626] text-2xl px-4 py-1 active:translate-y-1 disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
