"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import ShowToModal from "@/components/modal/ShowToModal";
import { sanitize, beautify } from "@/lib/sanitize";
import Image from "next/image";
import AppImage from "../ui/AppImage";

export type ShowToMap = Record<string, Record<string, string[]>>;
export interface Trait {
  type: string;
  value: string;
  image: string;
  context?: string;
}

type ShowToItem = {
  trait_type: string;
  value: string;
  tags: string[];
};

export default function ShowToRules({
  baseUrl,
  traits,
  rules,
  fetchAll,
}: {
  baseUrl: string;
  traits: Trait[];
  rules: { showTo?: ShowToMap };
  fetchAll: () => void | Promise<void>;
}) {
  const showTo: ShowToMap = (rules?.showTo as ShowToMap) || {};
  const [editingItem, setEditingItem] = useState<{
    trait_type: string;
    value: string;
  } | null>(null);

  const showToList: ShowToItem[] = useMemo(() => {
    return Object.entries(showTo).flatMap(([trait_type, byValue]) =>
      Object.entries(byValue || {}).map(([value, tags]) => ({
        trait_type,
        value,
        tags: Array.isArray(tags) ? tags : [],
      }))
    );
  }, [showTo]);

  const getImageUrl = (trait: string, value: string, context?: string) => {
    const found = (traits || []).find(
      (t: any) =>
        sanitize(t.type) === sanitize(trait) &&
        sanitize(t.value) === sanitize(value) &&
        sanitize(t.context || "") === sanitize(context || "")
    );
    return found
      ? `${baseUrl}${found.image}`
      : `${baseUrl}/layers/${sanitize(trait)}${
          context ? `/${sanitize(context)}` : ""
        }/${sanitize(value)}.png`;
  };

  // di dalam ShowToRules (sebelum return)

  const resolveContext = (
    traitType: string,
    value: string
  ): string | undefined => {
    // cari semua trait yang match type+value
    const matches = (traits || []).filter(
      (t) =>
        sanitize(t.type) === sanitize(traitType) &&
        sanitize(t.value) === sanitize(value)
    );

    if (matches.length === 0) return undefined;

    // 1) kalau ada yang TANPA context, pakai itu (path jadi tanpa subfolder context)
    const noCtx = matches.find((t) => !t.context);
    if (noCtx) return undefined;

    // 2) kalau semuanya pakai context, ambil yang pertama (atau bikin prioritas sendiri)
    return matches[0].context;
  };

  return (
    <section className="">
      <div className="flex justify-between mb-20">
        <h3 className="font-semibold text-6xl">ShowTo Rules</h3>

        <button
          onClick={() => setEditingItem({ trait_type: "", value: "" })}
          className=" border-4 text-white px-3 cursor-pointer hover:-translate-y-1 active:translate-y-0"
        >
          Add Rule
        </button>
      </div>

      {showToList.length === 0 ? (
        <p className="text-xl opacity-70">Belum ada ShowTo rule.</p>
      ) : (
        <ul className="text-xl grid grid-cols-3  gap-5">
          {showToList.map((item) => (
            <li
              key={`${item.trait_type}:${item.value}`}
              className="group relative border-2 p-5 flex items-start justify-between gap-6"
            >
              <div className="grid grid-cols-3 items-center gap-5 w-full">
                <div className="relative w-20 h-20">
                  <AppImage
                    path={getImageUrl(
                      item.trait_type,
                      item.value,
                      resolveContext(item.trait_type, item.value)
                    )}
                    pixelated
                    fill
                    alt={`${item.trait_type}/${item.value}`}
                    className="w-12 h-12 border"
                    onError={(e) => (e.currentTarget.style.opacity = "0.3")}
                  />
                </div>

                <strong className="col-span-2 text-white ">
                  {beautify(item.value)}{" "}
                  {resolveContext(item.trait_type, item.value)}
                </strong>

                <div className="flex text-xs flex-wrap gap-2 col-span-3">
                  <span className="flex items-center">TAGS:</span>
                  {item.tags.map((t) => (
                    <span
                      key={t}
                      className=" px-2 py-1 bg-[#444]  uppercase tracking-wide"
                    >
                      {t}
                    </span>
                  ))}
                  {item.tags.length === 0 && (
                    <span className="opacity-70">No tags</span>
                  )}
                </div>
              </div>

              <div className="hidden group-hover:flex absolute text-sm right-3 top-3 flex gap-4 *:cursor-pointer">
                <button
                  onClick={() =>
                    setEditingItem({
                      trait_type: item.trait_type,
                      value: item.value,
                    })
                  }
                  className="relative border-yellow-500 text-white w-5 h-5 hover:-translate-y-1 active:translate-y-0"
                >
                  <Image src="./ui/pencil.svg" fill alt="pencil" />
                </button>

                <button
                  onClick={async () => {
                    try {
                      const res = await fetch(`${baseUrl}/api/rules/showto`, {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          trait_type: item.trait_type,
                          value: item.value,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data?.error || "Failed");
                      toast.success("ShowTo removed!");
                      await fetchAll();
                    } catch (e) {
                      console.error(e);
                      toast.error("❌ Gagal hapus ShowTo");
                    }
                  }}
                  className="relative border-red-500 text-white w-5 h-5 hover:-translate-y-1 active:translate-y-0"
                >
                  <Image src="./ui/x.svg" fill alt="pencil" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editingItem && (
        <ShowToModal
          item={editingItem}
          currentTags={
            showTo[editingItem.trait_type]?.[editingItem.value] || []
          }
          showToMap={showTo}
          traits={traits}
          onClose={() => setEditingItem(null)}
          onSave={async ({ trait_type, value, tags }) => {
            try {
              if (!tags?.length) {
                toast.error("Minimal 1 tag (mis. 'male').");
                return;
              }
              const res = await fetch(`${baseUrl}/api/rules/showto`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ trait_type, value, tags }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data?.error || "Failed");
              toast.success("ShowTo updated!");
              await fetchAll();
              setEditingItem(null);
            } catch (e) {
              console.error(e);
              toast.error("❌ Gagal simpan ShowTo");
            }
          }}
        />
      )}
    </section>
  );
}
