"use client";

// + NEW import di paling atas
import { useEffect, useRef } from "react";
import Image from "next/image";
import { useRarityStore } from "@/lib/useRarityStore";

type Attribute = {
  trait_type: string;
  value: string | number | boolean | null;
};

export type TokenDetail = {
  token_id: number | string;
  name?: string;
  image: string; // URL lengkap
  attributes: Attribute[];
};

export default function TokenDetailModal({
  open,
  onClose,
  token,
}: {
  open: boolean;
  onClose: () => void;
  token: TokenDetail | null;
}) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // ❗ Hooks store harus selalu dipanggil (tanpa kondisi)
  const getRank = useRarityStore((s) => s.getRank);
  const total = useRarityStore((s) => s.total);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // focus close button when open
  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  if (!open || !token) return null;

  const info = getRank(String(token.token_id)); // normalisasi key Map

  const title =
    token.name && String(token.name).trim() !== ""
      ? String(token.name)
      : `Token #${token.token_id}`;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={(e) => {
        // click outside to close
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="relative w-full max-w-5xl bg-[#1f1f1f] text-white border-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-4">
          <h3 className="text-3xl font-bold truncate">{title}</h3>
          <div className="flex items-center gap-3">
            {info ? (
              <span
                className="inline-flex items-center rounded-full border px-3 py-1 text-sm"
                title={`Rarity score: ${info.score.toFixed(2)}`}
              >
                Rank #{info.rank} / {total}
              </span>
            ) : (
              <span className="text-sm opacity-70">Calculating rarity…</span>
            )}
            <button
              ref={closeBtnRef}
              onClick={onClose}
              className="border-3 px-3 py-1 text-xl hover:-translate-y-1 active:translate-y-0 cursor-pointer"
              aria-label="Close"
            >
              Close
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          {/* Image with hover zoom */}
          <div className="group relative border-4 overflow-hidden">
            <Image
              src={token.image}
              alt={title}
              width={1024}
              height={1024}
              className="w-full h-auto transition-transform duration-300 ease-out group-hover:scale-110 cursor-zoom-in"
              unoptimized
              loading="eager"
            />
          </div>

          {/* Attributes */}
          <div className="flex flex-col">
            <div className="text-2xl mb-4 font-semibold">Attributes</div>
            {token.attributes?.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {token.attributes.map((att, idx) => (
                  <div
                    key={`${att.trait_type}-${idx}`}
                    className="border-2 px-3 py-2"
                  >
                    <div className="text-xs opacity-70 uppercase tracking-wide">
                      {String(att.trait_type ?? "")}
                    </div>
                    <div className="text-lg font-semibold break-words">
                      {String(att.value ?? "")}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="opacity-70">No attributes</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
