"use client";

import { useEffect, useState, useMemo } from "react";
import RuleModal from "./RuleModal";
import ShowToModal from "./ShowToModal";
import toast from "react-hot-toast";
import { useTraitStore } from "@/lib/useTraitStore";
import { sanitize, beautify } from "@/lib/sanitize";

interface SpecificRule {
  trait: string;
  value: string;
  context?: string;
  exclude_with?: { trait: string; value: string; context?: string }[];
  require_with?: { trait: string; value: string; context?: string }[];
  always_with?: { trait: string; value: string; context?: string }[];
}

type ShowToMap = Record<string, Record<string, string[]>>;

type ShowToItem = {
  trait_type: string;
  value: string;
  tags: string[];
};

interface Trait {
  type: string;
  value: string;
  image: string;
  context?: string;
}

import { saveRules } from "@/lib/api";
const baseUrl = process.env.NEXT_PUBLIC_API_URL;

function getUniqueTraits(traits: Trait[]): Trait[] {
  const seen = new Set();
  return traits.filter((t) => {
    const key = `${t.type}-${t.value}-${t.context || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function Rules() {
  const traits = useTraitStore((s) => s.traits);
  const rules = useTraitStore((s) => s.rules);
  const fetchAll = useTraitStore((s) => s.fetchAll);
  const showTo: ShowToMap = (rules?.showTo as ShowToMap) || {};
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;

  // Local state untuk modal
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"exclude" | "require" | "pair">(
    "exclude"
  );
  const [editingItem, setEditingItem] = useState<{
    trait_type: string;
    value: string;
  } | null>(null);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ADD Specific
  const handleAddSpecific = async (newRule: SpecificRule) => {
    try {
      await saveRules({ mode: "append", specific: [newRule], global: {} });
      toast.success("Rule saved!");
      fetchAll();
      setShowModal(false);
    } catch (err) {
      toast.error("Error Saving Rule");
      console.error(err);
    }
  };

  // DELETE Specific
  const handleDeleteSpecific = async (index: number) => {
    const rule = rules.specific?.[index];
    if (!rule) return;

    const type = rule.exclude_with
      ? "exclude"
      : rule.require_with
      ? "require"
      : rule.always_with
      ? "pair"
      : null;

    if (!type) return;

    const targets = (
      rule.exclude_with ||
      rule.require_with ||
      rule.always_with ||
      []
    ).map((t: any) => ({
      trait: t.trait,
      value: t.value,
      // PATCH: ikut context secondary juga kalau memang ada
      ...(t.context ? { context: t.context } : {}),
    }));

    try {
      await fetch(`${baseUrl}/api/rules`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trait: rule.trait,
          value: rule.value,
          type,
          targets,
          // PATCH: kirim context primary juga
          ...(rule.context ? { context: rule.context } : {}),
        }),
      });

      toast.success("Rule deleted!");
      fetchAll();
    } catch (err) {
      toast.error("Error deleting rules");
      console.error(err);
    }
  };

  const openModal = (mode: "exclude" | "require" | "pair") => {
    setModalMode(mode);
    setShowModal(true);
  };

  // ... (semua kode atas biarin aja, ganti mulai dari sini)
  // Helper image: **wajib compare context juga!**
  const getImageUrl = (trait: string, value: string, context?: string) => {
    const found = traits.find(
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

  const showToList: ShowToItem[] = useMemo(() => {
    // contoh: { type: { mohawk: ["male"], punk: ["villain"] }, hair: {...} }
    return Object.entries(showTo).flatMap(([trait_type, byValue]) =>
      Object.entries(byValue || {}).map(([value, tags]) => ({
        trait_type,
        value,
        tags: Array.isArray(tags) ? tags : [],
      }))
    );
  }, [showTo]);

  return (
    <div>
      <h2 className="text-4xl font-semibold mb-4">Trait Rules Editor</h2>
      <div className="flex flex-col gap-10">
        <div className="border-4 p-10">
          <h3 className="font-semibold text-8xl mb-2">Specific Rules</h3>
          <div className="flex gap-5 mb-15 flex-1">
            <button
              onClick={() => openModal("exclude")}
              className="border-4 border-red-500 text-white text-2xl px-3 py-1 uppercase active:translate-y-1 hover:-translate-y-1 cursor-pointer"
            >
              Doesn't Mix With
            </button>
            <button
              onClick={() => openModal("require")}
              className="border-4 border-green-500 text-white text-2xl px-3 py-1 uppercase active:translate-y-1 hover:-translate-y-1 cursor-pointer"
            >
              Only Mix With
            </button>
            <button
              onClick={() => openModal("pair")}
              className="border-4 border-blue-500 text-white text-2xl px-3 py-1 uppercase active:translate-y-1 hover:-translate-y-1 cursor-pointer"
            >
              Always Pair With
            </button>
          </div>

          <ul className="text-xl flex flex-col gap-5">
            {(rules.specific || []).map((rule: SpecificRule, idx: number) => (
              <li key={idx} className="border-4 p-10 flex relative">
                <div className="flex flex-1 flex-col gap-5">
                  <div className="flex items-center gap-5">
                    <img
                      src={getImageUrl(rule.trait, rule.value, rule.context)}
                      alt={`${rule.trait}/${rule.value}`}
                      className="w-12 h-12 border"
                    />
                    <strong className="text-white text-4xl flex items-center gap-2">
                      {beautify(rule.trait)} / {beautify(rule.value)}
                      {rule.context && (
                        <span className="ml-2 px-2 py-1 bg-[#444] text-xl uppercase tracking-wide">
                          {rule.context}
                        </span>
                      )}
                    </strong>
                  </div>

                  {rule.exclude_with && (
                    <div className="text-xl items-center flex flex-wrap gap-3">
                      <span className="text-2xl text-red-500">
                        Doesn’t Mix With:
                      </span>
                      <div className="grid grid-cols-4 gap-10 max-h-90 overflow-auto p-10">
                        {rule.exclude_with.map((r, i) => (
                          <div key={i} className="flex items-center gap-5">
                            <img
                              src={getImageUrl(r.trait, r.value, r.context)}
                              alt={`${r.trait}/${r.value}`}
                              className="w-14 h-14 hover:z-50 border hover:scale-200 hover:bg-white transition-all ease-in-out"
                            />
                            <span>
                              {beautify(r.trait)} / {beautify(r.value)}
                              {r.context && (
                                <span className="ml-2 px-2 py-1 bg-[#444] text-xl uppercase tracking-wide">
                                  {r.context}
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {rule.require_with && (
                    <div className="text-xl flex flex-wrap items-center gap-3">
                      <span className="text-2xl text-green-500">
                        Only Mix With:
                      </span>
                      <div className="grid grid-cols-4 gap-10 max-h-90 overflow-auto p-10">
                        {rule.require_with.map((r, i) => (
                          <div key={i} className="flex items-center gap-5">
                            <img
                              src={getImageUrl(r.trait, r.value, r.context)}
                              alt={`${r.trait}/${r.value}`}
                              className="w-14 h-14 hover:z-50 border hover:scale-200 hover:bg-white transition-all ease-in-out"
                            />
                            <span>
                              {beautify(r.trait)} / {beautify(r.value)}
                              {r.context && (
                                <span className="ml-2 px-2 py-1 bg-[#444] text-xl uppercase tracking-wide">
                                  {r.context}
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {rule.always_with && (
                    <div className="text-xl items-center flex flex-wrap gap-3">
                      <span className="text-2xl text-blue-500">
                        Always Pair With:
                      </span>
                      <div className="grid grid-cols-4 gap-10 max-h-90 overflow-auto p-10">
                        {rule.always_with.map((r, i) => (
                          <div key={i} className="flex items-center gap-5">
                            <img
                              src={getImageUrl(r.trait, r.value, r.context)}
                              alt={`${r.trait}/${r.value}`}
                              className="w-14 h-14 border hover:scale-200 hover:bg-white transition-all ease-in-out"
                            />
                            <span>
                              {beautify(r.trait)} / {beautify(r.value)}
                              {r.context && (
                                <span className="ml-2 px-2 py-1 bg-[#444] text-xl uppercase tracking-wide">
                                  {r.context}
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleDeleteSpecific(idx)}
                  className="absolute top-10 right-10 cursor-pointer ml-4"
                >
                  <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    className="stroke-4 stroke-red-500 active:translate-y-1"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <line x1="4" y1="4" x2="20" y2="20" />
                    <line x1="20" y1="4" x2="4" y2="20" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="border p-10">
          <h3 className="font-semibold text-8xl mb-2">ShowTo Rules</h3>

          <button
            onClick={() => setEditingItem({ trait_type: "", value: "" })}
            className="mb-6 border-purple-600 border-4 text-white px-3 py-1 text-2xl hover:-translate-y-1 active:translate-y-0 cursor-pointer"
          >
            Add ShowTo Rule
          </button>

          {/* LIST SHOWTO */}
          {showToList.length === 0 ? (
            <p className="text-xl opacity-70">Belum ada ShowTo rule.</p>
          ) : (
            <ul className="text-xl flex flex-col gap-5">
              {showToList.map((item) => (
                <li
                  key={`${item.trait_type}:${item.value}`}
                  className="border-4 p-10 flex items-start justify-between gap-6"
                >
                  <div className="flex items-center gap-5 flex-wrap">
                    <img
                      src={getImageUrl(item.trait_type, item.value)}
                      alt={`${item.trait_type}/${item.value}`}
                      className="w-12 h-12 border"
                      onError={(e) => (e.currentTarget.style.opacity = "0.3")}
                    />
                    <strong className="text-white text-4xl">
                      {beautify(item.trait_type)} / {beautify(item.value)}
                    </strong>

                    <div className="flex flex-wrap gap-2">
                      {item.tags.map((t) => (
                        <span
                          key={t}
                          className="ml-2 px-2 py-1 bg-[#444] text-xl uppercase tracking-wide"
                        >
                          {t}
                        </span>
                      ))}
                      {item.tags.length === 0 && (
                        <span className="opacity-70">No tags</span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    {/* EDIT */}
                    <button
                      onClick={() =>
                        setEditingItem({
                          trait_type: item.trait_type,
                          value: item.value,
                        })
                      }
                      className="border-4 border-yellow-500 text-white px-3 py-1 text-2xl hover:-translate-y-1 active:translate-y-0 cursor-pointer"
                    >
                      Edit
                    </button>

                    {/* REMOVE */}
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(
                            `${baseUrl}/api/rules/showto`,
                            {
                              method: "DELETE",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                trait_type: item.trait_type,
                                value: item.value,
                              }),
                            }
                          );
                          const data = await res.json();
                          if (!res.ok) throw new Error(data?.error || "Failed");
                          toast.success("ShowTo removed!");
                          await fetchAll();
                        } catch (e) {
                          console.error(e);
                          toast.error("❌ Gagal hapus ShowTo");
                        }
                      }}
                      className="border-4 border-red-600 text-white px-3 py-1 text-2xl hover:-translate-y-1 active:translate-y-0 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editingItem && (
        <ShowToModal
          item={editingItem}
          currentTags={
            showTo[editingItem.trait_type]?.[editingItem.value] || []
          }
          showToMap={showTo} // <-- biar kalau ganti selection di modal, tags lama auto kebaca
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

      <RuleModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleAddSpecific}
        traits={getUniqueTraits(traits)}
        mode={modalMode}
      />
    </div>
  );
}
