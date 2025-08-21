// ShowToModal.tsx
"use client";

import { useState, useEffect } from "react";
import { beautify } from "@/lib/sanitize"; // kalau sudah ada; kalau tidak, hapus beautify

type TraitType = {
  type: string;
  value: string;
  image: string;
  context?: string; // ⬅️ tambahkan
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
  showToMap?: Record<string, Record<string, string[]>>; // optional, kalau sudah dipakai biarin
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
  const [selectedContext, setSelectedContext] = useState<string>(""); // ⬅️ baru

  const [tags, setTags] = useState<string[]>(currentTags || []);
  const [newTag, setNewTag] = useState("");

  const availableTraitTypes = Array.from(new Set(traits.map((t) => t.type)));
  const availableValues = traits.filter((t) => t.type === traitType); // ⬅️ tetap per-context (biar kelihatan dobelnya)

  // ganti type => reset value & preview
  useEffect(() => {
    if (traitType) {
      setValue("");
      setSelectedFile("");
      setSelectedContext("");
    }
  }, [traitType]);

  // saat value berubah, set preview + load tags lama (kalau ada)
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
  }, [traitType, value, currentTags, traits, showToMap]);

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
    // ⛔ Catatan: ShowTo disimpan per value (TIDAK per context). selectedContext hanya untuk tampilan.
    onSave({ trait_type: traitType, value, tags: finalTags });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
      <div className="w-[min(1100px,95vw)] max-h-[85vh] overflow-auto bg-[#121212] border-4 border-white p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-red-400 text-3xl"
        >
          ×
        </button>

        <h2 className="text-5xl mb-6">Add ShowTo Rule</h2>

        {/* Trait Type selector (kalau lo sudah punya, pake punyamu) */}
        <div className="mb-4 flex gap-3 flex-wrap">
          {availableTraitTypes.map((tt) => (
            <button
              key={tt}
              onClick={() => setTraitType(tt)}
              className={`px-3 py-1 border-4 ${
                traitType === tt ? "border-purple-500" : "border-[#333]"
              }`}
            >
              {beautify ? beautify(tt) : tt}
            </button>
          ))}
        </div>

        {/* Grid nilai, PER-CONTEXT, pake badge */}
        <h3 className="text-2xl mb-3">Select Trait Value</h3>
        <div className="grid grid-cols-4 gap-5">
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
                className={`relative border-4 p-2 text-left ${
                  isActive ? "border-purple-500" : "border-[#333]"
                }`}
              >
                <div className="relative w-full aspect-square overflow-hidden bg-[#2a2a2a]">
                  {/* image */}
                  <img
                    src={`${baseUrl}${t.image}`}
                    alt={t.value}
                    className="object-contain w-full h-full"
                  />
                  {/* badge context */}
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
        </div>

        {/* Info pilihan */}
        {value && (
          <div className="mt-4 text-lg opacity-80">
            Selected:&nbsp;
            <b>{beautify ? beautify(traitType) : traitType}</b>
            {" / "}
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
              Note: ShowTo disimpan per <i>value</i> (tidak spesifik per
              file-context). Kalau mau beda-beda per context (mis. value yang
              sama tapi MALE dan FEMALE punya tag berbeda), kita perlu extend
              backend untuk menyimpan <code>context</code> juga.
            </div>
          </div>
        )}

        {/* Tag input mini (pakai punyamu sendiri kalau sudah ada) */}
        <div className="mt-6 flex items-center gap-3">
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
            className="px-3 py-2 border-2 border-[#444] bg-transparent"
          />
          <button
            onClick={() => {
              const t = newTag.trim().toLowerCase();
              if (t && !tags.includes(t)) setTags([...tags, t]);
              setNewTag("");
            }}
            className="border-4 border-purple-500 px-3 py-1"
          >
            Add
          </button>
        </div>

        {/* Tag preview */}
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t}
              className="px-2 py-1 bg-[#444] uppercase tracking-wide"
            >
              {t}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="border-4 border-[#555] px-4 py-2"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={
              !traitType || !value || (tags.length === 0 && !newTag.trim())
            }
            className="border-4 border-purple-600 px-4 py-2"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
