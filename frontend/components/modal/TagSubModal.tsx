// components/TagSubModal.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { sanitize, beautify } from "@/lib/sanitize";
import AppImage from "../ui/AppImage";

type Trait = { type: string; value: string; context?: string; image?: string };

export default function TagSubtagModal({
  baseUrl,
  initialTag,
  initialSubtag,
  traits,
  onClose,
}: {
  baseUrl: string;
  initialTag?: string;
  initialSubtag?: string;
  traits: Trait[];
  onClose: (changed: boolean) => void;
}) {
  const [tag, setTag] = useState(initialTag || "");
  const [subtag, setSubtag] = useState(initialSubtag || "");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<
    { trait_type: string; value: string; context?: string }[]
  >([]);
  const [prevSelected, setPrevSelected] = useState<
    { trait_type: string; value: string; context?: string }[]
  >([]);
  const [serverTags, setServerTags] = useState<
    Record<string, { subtags: Record<string, any[]> }>
  >({});

  const tagValid = tag.trim().length > 0;
  const subtagValid = subtag.trim().length > 0;
  const canPickTrait = tagValid && subtagValid;

  const eq = (
    a: { trait_type: string; value: string; context?: string },
    b: { trait_type: string; value: string; context?: string }
  ) =>
    a.trait_type === b.trait_type &&
    a.value === b.value &&
    (a.context || "") === (b.context || "");

  async function fetchTags() {
    const r = await fetch(`${baseUrl}/api/rules/tags`);
    const j = await r.json();
    setServerTags(j || {});
  }

  useEffect(() => {
    fetchTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!initialTag || !initialSubtag) return;
    const items = serverTags[initialTag]?.subtags?.[initialSubtag] || [];
    if (Array.isArray(items)) {
      setSelected(items);
      setPrevSelected(items);
      if (!tag) setTag(initialTag);
      if (!subtag) setSubtag(initialSubtag);
    }
  }, [serverTags, initialTag, initialSubtag]);

  const isEdit = !!(initialTag && initialSubtag);

  async function ensureTagExists() {
    if (!tagValid) {
      toast.error("Isi Tag dulu (mis. 'Alien').");
      return false;
    }
    if (serverTags[tag]) return true;
    try {
      const res = await fetch(`${baseUrl}/api/rules/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: tag.trim() }),
      });
      if (res.status === 409) return true;
      if (!res.ok) throw new Error("create tag failed");
      return true;
    } catch (e) {
      console.error(e);
      toast.error("Gagal bikin tag");
      return false;
    }
  }

  async function ensureSubtagExists() {
    if (!subtagValid) {
      toast.error("Subtag wajib diisi (mis. 'female').");
      return false;
    }
    if (isEdit && tag === initialTag && subtag === initialSubtag) return true;
    if (isEdit && tag === initialTag && subtag !== initialSubtag) return true;

    if (serverTags[tag]?.subtags?.[subtag]) {
      toast.error(`Subtag '${subtag}' sudah ada di '${tag}'.`);
      return false;
    }
    try {
      const res = await fetch(
        `${baseUrl}/api/rules/tags/${encodeURIComponent(tag)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subtag: subtag.trim() }),
        }
      );
      if (res.status === 409) {
        toast.error(`Subtag '${subtag}' sudah ada di '${tag}'.`);
        return false;
      }
      if (!res.ok) throw new Error("create subtag failed");
      return true;
    } catch (e) {
      console.error(e);
      toast.error("Gagal bikin subtag");
      return false;
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (!tagValid) return toast.error("Isi Tag dulu.");
      if (!subtagValid) return toast.error("Isi Subtag dulu.");

      const okTag = await ensureTagExists();
      if (!okTag) return;

      // A) Edit-in-place
      if (isEdit && tag === initialTag && subtag === initialSubtag) {
        const add = selected.filter(
          (it) => !prevSelected.some((p) => eq(p, it))
        );
        const remove = prevSelected.filter(
          (it) => !selected.some((s) => eq(s, it))
        );

        if (add.length || remove.length) {
          const res = await fetch(
            `${baseUrl}/api/rules/tags/${encodeURIComponent(
              tag
            )}/${encodeURIComponent(subtag.trim())}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ add, remove }),
            }
          );
          if (!res.ok) throw new Error("Failed update items");
        }
        toast.success("Updated!");
        onClose(true);
        return;
      }

      // B) Rename subtag (tag sama)
      if (isEdit && tag === initialTag && subtag !== initialSubtag) {
        const r = await fetch(
          `${baseUrl}/api/rules/tags/${encodeURIComponent(
            tag
          )}/${encodeURIComponent(initialSubtag!)}/rename`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newName: subtag.trim() }),
          }
        );
        if (r.status === 409)
          return toast.error(`Subtag '${subtag}' sudah ada di '${tag}'.`);
        if (!r.ok) throw new Error("Rename failed");

        const add = selected.filter(
          (it) => !prevSelected.some((p) => eq(p, it))
        );
        const remove = prevSelected.filter(
          (it) => !selected.some((s) => eq(s, it))
        );

        if (add.length || remove.length) {
          const res = await fetch(
            `${baseUrl}/api/rules/tags/${encodeURIComponent(
              tag
            )}/${encodeURIComponent(subtag.trim())}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ add, remove }),
            }
          );
          if (!res.ok) throw new Error("Failed update items");
        }
        toast.success("Renamed & updated!");
        onClose(true);
        return;
      }

      // C) Pindah ke tujuan lain (create kalau perlu)
      const okSub = await ensureSubtagExists();
      if (!okSub) return;

      if (selected.length) {
        const resAdd = await fetch(
          `${baseUrl}/api/rules/tags/${encodeURIComponent(
            tag
          )}/${encodeURIComponent(subtag.trim())}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ add: selected, remove: [] }),
          }
        );
        if (!resAdd.ok) throw new Error("Failed move(add)");
      }

      if (isEdit && initialTag && initialSubtag && prevSelected.length) {
        const resRem = await fetch(
          `${baseUrl}/api/rules/tags/${encodeURIComponent(
            initialTag
          )}/${encodeURIComponent(initialSubtag)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ add: [], remove: prevSelected }),
          }
        );
        if (!resRem.ok) throw new Error("Failed move(remove)");
      }

      toast.success("Moved & saved!");
      onClose(true);
    } catch (e) {
      console.error(e);
      toast.error("Gagal simpan");
    } finally {
      setSaving(false);
    }
  }

  const uniqueTraits = useMemo(() => {
    const seen = new Set<string>();
    return (traits ?? []).filter((t) => {
      const key = `${t.type}::${t.value}::${t.context || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [traits]);

  const groupedByTypeThenContext = useMemo(() => {
    const out: Record<string, Record<string, Trait[]>> = {};
    for (const t of uniqueTraits) {
      const typeKey = t.type;
      const ctxKey = t.context || "__noctx__";
      if (!out[typeKey]) out[typeKey] = {};
      if (!out[typeKey][ctxKey]) out[typeKey][ctxKey] = [];
      out[typeKey][ctxKey].push(t);
    }
    return out;
  }, [uniqueTraits]);

  function toggleSelect(t: Trait) {
    const payload = {
      trait_type: t.type,
      value: t.value,
      context: t.context || undefined,
    };
    const idx = selected.findIndex(
      (x) =>
        x.trait_type === payload.trait_type &&
        x.value === payload.value &&
        (x.context || "") === (payload.context || "")
    );
    if (idx >= 0) setSelected((s) => s.filter((_, i) => i !== idx));
    else setSelected((s) => [...s, payload]);
  }

  return (
    <div className="fixed z-50 inset-0 bg-black/50 flex items-center justify-center overflow-hidden">
      <div className="bg-[#262626] rounded-lg p-6 w-[min(1100px,95vw)] max-h-[90vh] overflow-hidden drop-shadow-2xl border-4 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-3xl font-bold">
            {isEdit ? "Edit Tag/Subtag" : "Add Tags / Subtags"}
          </h2>
          <button
            onClick={() => onClose(false)}
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

        {/* Body (scrollable) */}
        <div className="overflow-y-auto pr-1">
          {/* Tag */}
          <div className="space-y-2 mb-4">
            <label className="text-xl">
              Tag <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-3">
              <input
                className="border-2 border-white/20 px-3 py-2 flex-1 bg-transparent"
                placeholder="mis. Alien"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
              <button
                className="border-4 px-4 py-1 text-xl active:translate-y-1"
                onClick={async () => {
                  const ok = await ensureTagExists();
                  if (ok) {
                    toast.success(`Tag '${tag.trim()}' ready!`);
                    fetchTags();
                  }
                }}
              >
                Create/Use
              </button>
            </div>
          </div>

          {/* Subtag */}
          <div className="space-y-2 mb-6">
            <label className="text-xl">Subtag</label>
            <div className="flex gap-3">
              <input
                className="border-2 border-white/20 px-3 py-2 flex-1 bg-transparent"
                placeholder="mis. male"
                value={subtag}
                onChange={(e) => setSubtag(e.target.value)}
                disabled={!tagValid}
              />
              <button
                className="border-4 px-4 py-1 text-xl active:translate-y-1 disabled:opacity-50"
                disabled={!tagValid || !subtag.trim()}
                onClick={async () => {
                  const okTag = await ensureTagExists();
                  if (!okTag) return;
                  const ok = await ensureSubtagExists();
                  if (ok) {
                    toast.success(`Subtag '${subtag.trim()}' ready!`);
                    fetchTags();
                  }
                }}
              >
                Create/Use
              </button>
            </div>
          </div>

          {/* Trait picker */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <h4 className="text-2xl">
                Select Traits to put into {subtag ? `${tag}/${subtag}` : tag}
              </h4>
            </div>

            <div
              className={`grid gap-3 border-4 border-white/20 p-4 ${
                !canPickTrait ? "opacity-40 pointer-events-none" : ""
              } max-h-[50vh] overflow-y-auto`}
            >
              {Object.entries(groupedByTypeThenContext).map(
                ([typeName, byCtx]) => (
                  <section key={typeName} className="border-2 border-white/10">
                    <div className="px-4 py-2 border-b border-white/10 bg-[#1f1f1f] top-0 z-10">
                      <h5 className="text-3xl font-bold tracking-wide">
                        {beautify(typeName)}
                      </h5>
                    </div>

                    <div className="p-3 space-y-4">
                      {Object.entries(byCtx).map(([ctxKey, items]) => (
                        <div key={ctxKey} className="space-y-2">
                          {ctxKey !== "__noctx__" && (
                            <div className="text-xs uppercase opacity-70 px-1">
                              {" "}
                              <span className="font-mono">{ctxKey}</span>
                            </div>
                          )}
                          <div className="grid grid-cols-6 gap-3">
                            {items.map((t, i) => {
                              const isPicked = selected.some(
                                (x) =>
                                  x.trait_type === t.type &&
                                  x.value === t.value &&
                                  (x.context || "") === (t.context || "")
                              );
                              return (
                                <button
                                  key={`${t.type}::${t.value}::${
                                    t.context || ""
                                  }-${i}`}
                                  className={`flex flex-col items-center gap-3 border-2 border-white/20 px-3 py-2 text-left active:translate-y-1 cursor-pointer ${
                                    isPicked ? "outline outline-[3px]" : ""
                                  }`}
                                  onClick={() => toggleSelect(t)}
                                  role="option"
                                  aria-selected={isPicked}
                                  title={`${beautify(t.type)} / ${beautify(
                                    t.value
                                  )}${t.context ? ` (${t.context})` : ""}`}
                                >
                                  <AppImage
                                    path={`${baseUrl}/layers/${beautify(
                                      t.type
                                    )}${
                                      t.context ? `/${sanitize(t.context)}` : ""
                                    }/${t.value}.png`}
                                    className="w-10 h-10 border"
                                    bgWhite={true}
                                    pixelated
                                    loading="lazy"
                                    onError={(e) =>
                                      (e.currentTarget.style.opacity = "0.3")
                                    }
                                    alt={`${beautify(t.type)} / ${beautify(
                                      t.value
                                    )}`}
                                  />
                                  <div className="min-w-0 text-center">
                                    <div className="font-semibold truncate text-wrap">
                                      {beautify(t.value)}
                                    </div>
                                    {t.context ? (
                                      <div className="text-xs opacity-70 truncate ">
                                        {t.context}
                                      </div>
                                    ) : null}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )
              )}

              {uniqueTraits.length === 0 && (
                <div className="border-2 border-white/20 rounded p-4 text-sm opacity-70 col-span-full">
                  Belum ada traits.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="px-4 py-1 border-4 text-2xl active:translate-y-1"
            onClick={() => onClose(false)}
          >
            Cancel
          </button>
          <button
            className="bg-[#FFDF0F] text-[#262626] text-2xl px-4 py-1 active:translate-y-1 disabled:opacity-60"
            disabled={!tagValid || !subtagValid || saving}
            onClick={handleSave}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
