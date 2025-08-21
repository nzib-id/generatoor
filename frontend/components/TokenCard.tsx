"use client";

import Image from "next/image";

const baseUrl = process.env.NEXT_PUBLIC_API_URL;

type Attribute = {
  trait_type: string;
  value: string | number | boolean | null;
};

export type TokenPreviewItem = {
  token_id: number | string;
  edition?: number;
  name?: string;
  image: string; // URL penuh ke PNG
  attributes: Attribute[];
  rarity?: number;
};

export default function TokenCard({
  item,
  rounded,
  ts,
}: {
  item: TokenPreviewItem;
  rounded: boolean;
  ts?: number; // buat cache-busting preview
}) {
  const title =
    item?.name && String(item.name).trim() !== ""
      ? String(item.name)
      : `Token #${item.token_id}`;

  // tambahin ts buat bust cache (ikutin pola lo di preview)
  const imgSrc =
    item.image && ts
      ? `${item.image}${item.image.includes("?") ? "&" : "?"}ts=${ts}`
      : item.image;

  return (
    <div className="group text-center">
      <div className="relative w-full overflow-hidden border-5 border-white">
        <Image
          src={imgSrc}
          alt={title}
          width={256}
          height={256}
          quality={90}
          className={`w-full h-auto transform transition-transform duration-300 ease-out group-hover:scale-110 ${
            rounded ? "rounded-full" : "rounded-none"
          }`}
          loading="lazy"
          unoptimized
        />
      </div>

      {/* Judul */}
      <p className="mt-2 text-2xl truncate">{title}</p>

      {/* Attributes */}
      {Array.isArray(item.attributes) && item.attributes.length > 0 ? (
        <div className="mt-2 grid grid-cols-2 gap-2 text-left">
          {item.attributes.map((att, i) => (
            <div key={`${att.trait_type}-${i}`} className="border-2 px-2 py-1">
              <div className="text-xs opacity-70 uppercase tracking-wide">
                {att.trait_type}
              </div>
              <div className="text-sm font-semibold break-words">
                {String(att.value)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-sm opacity-70">No attributes</div>
      )}
    </div>
  );
}
