"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import TagSubtagModal from "@/components/modal/TagSubModal";
import { beautify } from "@/lib/sanitize";

export interface Trait {
  type: string;
  value: string;
  image: string;
  context?: string;
}

type CoverageRow = {
  total: number; // jumlah value unik di trait (dari /layers)
  coveredCount: number; // yang sudah masuk salah satu subtag di group ini
  missing: string[]; // value yang belum ketag
  isComplete: boolean; // true kalau missing.length === 0
};

type CoverageGroup = {
  perTrait: Record<string, CoverageRow>;
  totalTraits: number; // berapa trait terdeteksi di layers/
  completeTraits: number; // berapa trait yang sudah complete
  isGroupComplete: boolean;
};

type CoverageMap = Record<string, CoverageGroup>;

function SubtagBlock({
  tag,
  sub,
  items,
  onEdit,
  onDelete,
  max = 6,
}: {
  tag: string;
  sub: string;
  items: { trait_type: string; value: string; context?: string }[];
  onEdit: () => void;
  onDelete: () => void;
  max?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const safeItems = Array.isArray(items) ? items : [];
  const visible = expanded ? safeItems : safeItems.slice(0, max);
  const hiddenCount = Math.max(0, safeItems.length - visible.length);

  return (
    <div className="border p-4 rounded-lg">
      <div className="flex items-center justify-between">
        <strong className="text-2xl">
          {sub}
          {safeItems.length === 0 && (
            <span className="ml-2 text-xs opacity-70">(empty)</span>
          )}
        </strong>
        <div className="flex gap-2">
          <button className="border px-2" onClick={onEdit}>
            Edit
          </button>
          <button className="border px-2" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <ul className="mt-3 text-xl space-y-1">
        {visible.map((it, i) => (
          <li key={`${it.trait_type}::${it.value}::${it.context || ""}-${i}`}>
            {beautify(it.trait_type)} / {beautify(it.value)}
            {it.context ? (
              <span className="opacity-70"> ({it.context})</span>
            ) : null}
          </li>
        ))}
        {safeItems.length === 0 && (
          <li className="opacity-60">Belum ada item</li>
        )}
      </ul>

      {!expanded && hiddenCount > 0 && (
        <button
          className="mt-2 text-sm underline opacity-80 hover:opacity-100"
          onClick={() => setExpanded(true)}
        >
          Show {hiddenCount} more…
        </button>
      )}
      {expanded && safeItems.length > max && (
        <button
          className="mt-2 ml-3 text-sm underline opacity-80 hover:opacity-100"
          onClick={() => setExpanded(false)}
        >
          Show less
        </button>
      )}
    </div>
  );
}

function summarizeCoverage(groupCov?: CoverageGroup) {
  if (!groupCov)
    return {
      incomplete: [] as [string, CoverageRow][],
      completeCount: 0,
      totalTraits: 0,
      missingCount: 0,
    };
  const entries = Object.entries(groupCov.perTrait) as [string, CoverageRow][];
  const incomplete = entries.filter(([, row]) => !row.isComplete);
  const completeCount = entries.length - incomplete.length;
  const missingCount = incomplete.reduce(
    (acc, [, row]) => acc + row.missing.length,
    0
  );
  return {
    incomplete,
    completeCount,
    totalTraits: entries.length,
    missingCount,
  };
}

export default function TagsPanel({
  baseUrl,
  traits,
}: {
  baseUrl: string;
  traits: Trait[];
}) {
  const [openTag, setOpenTag] = useState<{ tag?: string; sub?: string } | null>(
    null
  );
  const [tags, setTags] = useState<
    Record<string, { subtags: Record<string, any[]> }>
  >({});

  const [coverage, setCoverage] = useState<CoverageMap>({});
  const [covLoading, setCovLoading] = useState(false);
  const [covError, setCovError] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState<Record<string, boolean>>({});

  async function fetchCoverage(signal?: AbortSignal) {
    try {
      setCovError(null);
      setCovLoading(true);
      const r = await fetch(`${baseUrl}/api/rules/tags/coverage`, { signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j: CoverageMap = await r.json();
      setCoverage(j || {});
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.error(e);
        setCovError("Gagal load coverage");
        toast.error("Gagal load coverage");
      }
    } finally {
      setCovLoading(false);
    }
  }

  async function fetchTags() {
    try {
      const r = await fetch(`${baseUrl}/api/rules/tags`);
      const j = await r.json();
      setTags(j || {});
    } catch (e) {
      console.error(e);
      toast.error("Gagal load tags");
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    fetchTags();
    fetchCoverage(ac.signal);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="">
      <div className="flex items-center justify-between">
        <h3 className="text-6xl font-bold">Tags</h3>
        <div className="flex items-center gap-3">
          <button className="border-4 px-4 py-2" onClick={() => setOpenTag({})}>
            Add Tag/Subtag
          </button>
          <button
            className="border-4 px-3 py-2"
            onClick={() => fetchCoverage()}
            disabled={covLoading}
            title="Refresh coverage"
          >
            {covLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {Object.keys(tags).length === 0 ? (
        <p className="text-xl opacity-70 mt-6">Belum ada tag.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-6">
          {Object.entries(tags).map(([tagName, data]) => (
            <li key={tagName} className="border-4 p-8 gap-5 rounded-xl">
              <div className="flex items-center justify-between">
                <h4 className="text-3xl md:text-4xl uppercase">{tagName}</h4>
                <div className="flex items-center gap-3">
                  <button
                    className="border-4 px-3 py-1"
                    onClick={() => setOpenTag({ tag: tagName })}
                  >
                    + Subtag
                  </button>
                  <button
                    className="border-4 px-3 py-1"
                    onClick={async () => {
                      try {
                        const r = await fetch(
                          `${baseUrl}/api/rules/tags/${encodeURIComponent(
                            tagName
                          )}`,
                          { method: "DELETE" }
                        );
                        if (!r.ok) throw new Error("Failed");
                        toast.success(`Tag '${tagName}' dihapus`);
                        await fetchTags();
                        await fetchCoverage();
                      } catch (e) {
                        console.error(e);
                        toast.error("Gagal hapus tag");
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* 🔎 Ringkasan coverage per group */}
              {(() => {
                const cov = coverage[tagName];
                const { incomplete, completeCount, totalTraits, missingCount } =
                  summarizeCoverage(cov);

                if (covLoading && !cov) {
                  return (
                    <div className="mt-2 text-sm opacity-70">
                      Loading coverage…
                    </div>
                  );
                }
                if (covError && !cov) {
                  return (
                    <div className="mt-2 text-sm text-red-400">{covError}</div>
                  );
                }
                return (
                  <div className="mt-2 text-sm">
                    {totalTraits === 0 ? (
                      <span className="opacity-70">
                        — belum ada data layers untuk dihitung.
                      </span>
                    ) : incomplete.length === 0 ? (
                      <span className="px-2 py-1 rounded bg-green-900/20 border border-green-700/40">
                        ✅ All traits covered ({completeCount}/{totalTraits})
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-yellow-900/20 border border-yellow-700/40">
                        ⚠️ {incomplete.length} trait belum lengkap ·{" "}
                        {missingCount} value belum ditag
                        <button
                          className="ml-3 underline opacity-90 hover:opacity-100"
                          onClick={() =>
                            setShowMissing((prev) => ({
                              ...prev,
                              [tagName]: !prev[tagName],
                            }))
                          }
                        >
                          {showMissing[tagName] ? "Hide" : "Show"} missing
                        </button>
                      </span>
                    )}
                  </div>
                );
              })()}

              <div className="mt-4 grid md:grid-cols-2 gap-4">
                {Object.entries(
                  (data?.subtags || {}) as Record<string, any[]>
                ).map(([subName, items]) => (
                  <SubtagBlock
                    key={subName}
                    tag={tagName}
                    sub={subName}
                    items={Array.isArray(items) ? items : []}
                    onEdit={() => setOpenTag({ tag: tagName, sub: subName })}
                    onDelete={async () => {
                      try {
                        const res = await fetch(
                          `${baseUrl}/api/rules/tags/${encodeURIComponent(
                            tagName
                          )}/${encodeURIComponent(subName)}`,
                          { method: "DELETE" }
                        );
                        if (!res.ok) throw new Error("Failed");
                        toast.success(`Subtag '${subName}' dihapus`);
                        await fetchTags();
                        await fetchCoverage();
                      } catch (e) {
                        console.error(e);
                        toast.error("Gagal hapus subtag");
                      }
                    }}
                    max={6}
                  />
                ))}
              </div>

              {/* 🧩 Daftar trait/value yang belum ke-tag di group ini */}
              {showMissing[tagName] &&
                (() => {
                  const cov = coverage[tagName];
                  const { incomplete } = summarizeCoverage(cov);
                  if (!incomplete.length) return null;

                  return (
                    <div className="mt-5 border rounded-lg p-4 bg-black/20">
                      <div className="font-semibold mb-2">
                        Missing (belum kena subtag):
                      </div>
                      <ul className="space-y-1 text-sm md:text-base">
                        {incomplete.map(([trait, row]) => {
                          const preview = row.missing.slice(0, 8);
                          return (
                            <li key={trait} className="leading-relaxed">
                              <span className="font-mono font-semibold">
                                {beautify(trait)}
                              </span>
                              :{" "}
                              {preview.map((v, i) => (
                                <span key={v}>
                                  {beautify(v)}
                                  {i < preview.length - 1 ? ", " : ""}
                                </span>
                              ))}
                              {row.missing.length > 8
                                ? `  +${row.missing.length - 8} more`
                                : ""}
                            </li>
                          );
                        })}
                      </ul>
                      <div className="mt-3">
                        <button
                          className="border px-3 py-1"
                          onClick={() => setOpenTag({ tag: tagName })}
                        >
                          Open editor for “{tagName}”
                        </button>
                      </div>
                    </div>
                  );
                })()}
            </li>
          ))}
        </ul>
      )}

      {openTag && (
        <TagSubtagModal
          baseUrl={baseUrl}
          initialTag={openTag?.tag}
          initialSubtag={openTag?.sub}
          traits={Array.isArray(traits) ? traits : []}
          onClose={(changed) => {
            setOpenTag(null);
            if (changed) {
              fetchTags();
              fetchCoverage();
            }
          }}
        />
      )}
    </section>
  );
}
