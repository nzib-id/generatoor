"use client";

import { rankTokens } from "@/lib/rarity";
import { useRarityStore } from "@/lib/useRarityStore";
import { useEffect, useState, useRef } from "react";
import toast from "react-hot-toast";
import { useGeneratorState } from "@/lib/state";
import AppImage from "@/components/ui/AppImage";
import SearchableDropdown from "@/components/ui/SearchableDropdown";
import TokenDetailModal, {
  TokenDetail,
} from "@/components/modal/TokenDetailModal";

const baseUrl = process.env.NEXT_PUBLIC_API_URL as string;
const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://ipfs.io/ipfs/";
const PAGE_SIZE = 250;

/* =========================
   Types
========================= */
type Attribute = {
  trait_type: string;
  value: string | number | boolean | null;
};

type PreviewIndexItem = {
  token_id: number;
  name: string | null;
  image: string; // "/output/images/{id}.png" atau absolute
  attributes: Attribute[]; // sudah dari backend
  hasMetadata?: boolean;
};

type UIItem = PreviewIndexItem & {
  edition: number; // kompat lama = token_id
  rarity: number; // dihitung lokal
};

/* =========================
   API helpers
========================= */
async function fetchPreviewPage(
  apiBase: string,
  page = 1,
  size = PAGE_SIZE
): Promise<PreviewIndexItem[]> {
  const r = await fetch(
    `${apiBase}/api/preview-index?page=${page}&size=${size}`,
    {
      cache: "no-store",
    }
  );
  if (!r.ok) throw new Error(`Failed /api/preview-index p=${page}`);
  const data = await r.json();
  return (data.items || []) as PreviewIndexItem[];
}

// Tambahkan di dalam file (di luar component OK)
async function fetchAllPreview(apiBase: string, size = PAGE_SIZE) {
  const all: { token_id: number | string; attributes: Attribute[] }[] = [];
  let page = 1;
  // loop sampai dapat < size
  // NOTE: jangan pakai Promise.all biar santai ke server
  // (lo bisa parallel kalau mau)
  for (;;) {
    const r = await fetch(
      `${apiBase}/api/preview-index?page=${page}&size=${size}`,
      { cache: "no-store" }
    );
    if (!r.ok) throw new Error(`Failed /api/preview-index p=${page}`);
    const data = await r.json();
    const items: PreviewIndexItem[] = (data.items || []) as PreviewIndexItem[];
    for (const it of items) {
      all.push({ token_id: it.token_id, attributes: it.attributes || [] });
    }
    if (items.length < size) break;
    page++;
  }
  return all;
}

/* =========================
   Component
========================= */
export default function PreviewPage() {
  // di dalam component:
  const setRanking = useRarityStore((s) => s.setRanking);

  // generate
  const [amount, setAmount] = useState(0);
  const [progress, setProgress] = useState({
    total: 0,
    done: 0,
    isGenerating: false,
  });

  // data
  const [items, setItems] = useState<UIItem[]>([]);
  const [traitWeightMap, setTraitWeightMap] = useState<
    Record<string, Record<string, number>>
  >({});

  // di dalam component:
  async function buildRankingAll() {
    try {
      if (!baseUrl) return;
      // coba restore cache dulu
      const saved = localStorage.getItem("rarity_rank_v1");
      const savedTotal = localStorage.getItem("rarity_total_v1");
      if (saved && savedTotal) {
        const entries = JSON.parse(saved) as [
          string | number,
          { rank: number; score: number }
        ][];
        const map = new Map(entries);
        setRanking(map, Number(savedTotal));
        // lanjutkan silently: refresh cache di belakang (opsional)
      }

      const all = await fetchAllPreview(baseUrl, PAGE_SIZE);
      if (!all.length) return;
      const { rankById, total } = rankTokens(all);

      // simpan ke store + cache
      setRanking(rankById, total);
      try {
        const compact = Array.from(rankById.entries());
        localStorage.setItem("rarity_rank_v1", JSON.stringify(compact));
        localStorage.setItem("rarity_total_v1", String(total));
      } catch {}
    } catch (e) {
      // cukup silent/log; jangan ganggu UI
      console.warn("[rarity] build failed:", e);
    }
  }

  // pagination
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);

  // ui states
  const [rounded, setRounded] = useState(false);
  const [previewTs, setPreviewTs] = useState(Date.now()); // bust cache
  const [showFilterSort, setShowFilterSort] = useState(false);
  const [sortBy, setSortBy] = useState<"edition" | "rarity">("edition");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [traitFilters, setTraitFilters] = useState<Record<string, string>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenDetail | null>(null);

  const loadedPagesRef = useRef<Set<number>>(new Set());

  const { setTotalAmount } = useGeneratorState();

  /* ========== Utils ========== */
  function getImageRarity(
    attributes: Attribute[] = [],
    weightMap: Record<string, Record<string, number>> = {}
  ) {
    if (!attributes?.length || !weightMap) return 0;

    const san = (s: any) =>
      String(s ?? "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_\/-]/g, "");

    let total = 0;

    for (const attr of attributes) {
      const tRaw = String(attr?.trait_type ?? "");
      const vRaw = String(attr?.value ?? "");
      if (!tRaw || !vRaw) continue;

      const tLc = tRaw.toLowerCase();
      const tSan = san(tRaw);
      const vLc = vRaw.toLowerCase();
      const vSan = san(vRaw);

      let w: number | undefined;
      w ??= weightMap?.[tLc]?.[vRaw];
      w ??= weightMap?.[tLc]?.[vLc];
      w ??= weightMap?.[tLc]?.[vSan];
      w ??= weightMap?.[tSan]?.[vRaw];
      w ??= weightMap?.[tSan]?.[vLc];
      w ??= weightMap?.[tSan]?.[vSan];

      if (w === undefined) {
        const keys = Object.keys(weightMap || {});
        const cands = keys.filter(
          (k) => k.startsWith(tLc) || k.startsWith(tSan)
        );
        for (const key of cands) {
          w ??= weightMap?.[key]?.[vRaw];
          w ??= weightMap?.[key]?.[vLc];
          w ??= weightMap?.[key]?.[vSan];
          if (w !== undefined) break;
        }
      }
      total += Number.isFinite(Number(w)) ? Number(w) : 0;
    }
    return total;
  }

  const normalizeImageUrl = (
    rawImage: string | undefined | null,
    apiBase: string
  ) => {
    if (!rawImage) return "";
    const img = String(rawImage).trim();
    if (img.startsWith("ipfs://"))
      return img.replace(/^ipfs:\/\//, IPFS_GATEWAY);
    if (/^https?:\/\//i.test(img)) return img;
    if (img.startsWith("/")) return `${apiBase}${img}`;
    return `${apiBase}/output/images/${img}`;
  };

  /* ========== Effects ========== */

  // load saved amount
  useEffect(() => {
    const savedAmount = localStorage.getItem("amount");
    if (savedAmount) {
      const n = Number(savedAmount);
      setAmount(n);
      setTotalAmount(n);
    }
  }, [setTotalAmount]);

  // fetch weights (non-blocking)
  useEffect(() => {
    fetch("/api/trait-weights")
      .then((r) => r.json())
      .then((data) => setTraitWeightMap(data || {}))
      .catch(() => setTraitWeightMap({}));
  }, []);

  // initial load + whenever generation stops → reset pagination and load first page
  useEffect(() => {
    if (!baseUrl) return;
    if (progress.isGenerating) return;

    setItems([]);
    setPage(1);
    setHasMore(true);
    loadedPagesRef.current.clear();
    void loadPage(1);
    void buildRankingAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.isGenerating, traitWeightMap]);

  // recompute rarity when weights change (without refetch)
  useEffect(() => {
    if (!items.length) return;
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        rarity: getImageRarity(it.attributes, traitWeightMap),
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traitWeightMap]);

  // poll progress while generating
  useEffect(() => {
    if (!progress.isGenerating) return;
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`${baseUrl}/api/generate-progress`);
        const p = await r.json();
        setProgress(p);

        if (!p.isGenerating) {
          clearInterval(interval);
          toast.success("Generated!");
          setPreviewTs(Date.now());
          // trigger initial load effect above
          setTimeout(
            () => setProgress((prev) => ({ ...prev, isGenerating: false })),
            0
          );
        }
      } catch {
        clearInterval(interval);
        toast.error("Error during generate");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [progress.isGenerating]);

  /* ========== Pagination loader ========== */
  async function loadPage(p: number) {
    if (!baseUrl) return;
    // sudah pernah dimuat? skip
    if (loadedPagesRef.current.has(p)) return;
    // sedang loading atau sudah habis? skip
    if (loadingPage || !hasMore) return;

    setLoadingPage(true);
    try {
      const batch = await fetchPreviewPage(baseUrl, p, PAGE_SIZE);

      // tandai page ini sudah dimuat
      loadedPagesRef.current.add(p);

      const mapped: UIItem[] = batch.map((it) => ({
        ...it,
        edition: it.token_id,
        rarity: getImageRarity(it.attributes, traitWeightMap),
      }));

      // tambahkan hasil tanpa duplikasi id (jaga-jaga)
      setItems((prev) => {
        const seen = new Set(prev.map((x) => String(x.token_id)));
        const unique = mapped.filter((x) => !seen.has(String(x.token_id)));
        return [...prev, ...unique];
      });

      if (batch.length < PAGE_SIZE) setHasMore(false);
    } finally {
      setLoadingPage(false);
    }
  }

  /* ========== Handlers ========== */
  const handleGenerate = async () => {
    if (amount < 1) return toast.error("Invalid Amount!");
    if (!baseUrl) return toast.error("API URL not set");

    setItems([]);
    setPage(1);
    setHasMore(true);
    setProgress({ total: amount, done: 0, isGenerating: true });

    try {
      const res = await fetch(`${baseUrl}/api/generate-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!data?.message) {
        toast.error("Generate Failed!");
        setProgress({ total: 0, done: 0, isGenerating: false });
      }
      setPreviewTs(Date.now());
    } catch {
      toast.error("Generate Failed!");
      setProgress({ total: 0, done: 0, isGenerating: false });
      setPreviewTs(Date.now());
    }
  };

  const handleStop = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/generate/stop`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data?.ok) return toast.error("Stop failed!");

      toast.success("Stopped. Finishing current tasks...");
      const pr = await fetch(`${baseUrl}/api/generate-progress`);
      const pData = await pr.json();
      setProgress(pData);
      setPreviewTs(Date.now());

      // reset list and reload first page
      setItems([]);
      setPage(1);
      setHasMore(true);
      void loadPage(1);
    } catch {
      toast.error("Failed to stop");
    }
  };

  /* ========== Derivatives: counts, filter, sort ========== */
  // counts per trait
  let traitTypes: string[] = [];
  const traitValuesByType: Record<string, string[]> = {};
  const traitCountsByType: Record<string, Record<string, number>> = {};

  if (items.length > 0) {
    for (const it of items) {
      const attrs = Array.isArray(it.attributes) ? it.attributes : [];
      for (const a of attrs) {
        const tt = String(a?.trait_type ?? "");
        const val = String(a?.value ?? "");
        if (!tt || !val) continue;
        if (!traitCountsByType[tt]) traitCountsByType[tt] = {};
        traitCountsByType[tt][val] = (traitCountsByType[tt][val] || 0) + 1;
      }
    }
    traitTypes = Object.keys(traitCountsByType);
    traitTypes.forEach((tt) => {
      traitValuesByType[tt] = Object.keys(traitCountsByType[tt]);
    });
  }

  const withCountLabel = (tt: string, val: string) =>
    `${val} (${traitCountsByType?.[tt]?.[val] ?? 0})`;
  const stripCountLabel = (s: string) => s.replace(/\s*\(\d+\)\s*$/, "");

  // filter
  let previewItems: UIItem[] = [...items];
  Object.entries(traitFilters).forEach(([trait_type, value]) => {
    if (value && value !== "") {
      previewItems = previewItems.filter((item) =>
        item.attributes?.some(
          (attr) => attr.trait_type === trait_type && attr.value === value
        )
      );
    }
  });

  // sort
  previewItems.sort((a, b) => {
    const aEdition = Number(a.edition ?? a.token_id ?? 0);
    const bEdition = Number(b.edition ?? b.token_id ?? 0);

    let aVal: any;
    let bVal: any;

    if (sortBy === "edition") {
      aVal = aEdition;
      bVal = bEdition;
    } else if (sortBy === "rarity") {
      aVal = Number.isFinite(Number(a.rarity)) ? Number(a.rarity) : 0;
      bVal = Number.isFinite(Number(b.rarity)) ? Number(b.rarity) : 0;
    } else {
      aVal = (a as any)[sortBy] ?? "";
      bVal = (b as any)[sortBy] ?? "";
    }

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    }
    return sortOrder === "asc"
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  /* ========== Modal open/close ========== */
  const openTokenModal = (item: UIItem) => {
    const idNum = Number(item.edition ?? item.token_id ?? 0);
    const title =
      item?.name && String(item.name).trim() !== ""
        ? item.name
        : `Parodee #${idNum}`;

    const baseImg = String(item?.image || "");
    const normalized = baseImg
      ? normalizeImageUrl(baseImg, baseUrl)
      : `${baseUrl}/output/images/${idNum}.png`;
    const img = `${normalized}${
      normalized.includes("?") ? "&" : "?"
    }ts=${previewTs}`;

    const attributes = Array.isArray(item.attributes) ? item.attributes : [];
    setSelectedToken({ token_id: idNum, name: title, image: img, attributes });
    setIsModalOpen(true);
  };

  const closeTokenModal = () => {
    setIsModalOpen(false);
    setSelectedToken(null);
  };

  /* ========== Render ========== */
  return (
    <main className="text-white relative">
      <h1 className="text-8xl mb-8">Preview</h1>
      <div className="flex md:flex-row flex-col gap-10 text-3xl mb-10">
        <div>
          <label htmlFor="amount" className="mr-2">
            Amount:
          </label>
          <input
            min={0}
            type="number"
            value={amount || ""}
            onChange={(e) => {
              // parse ke number biar otomatis drop leading zero
              const newAmount = parseInt(e.target.value || "0", 10);

              setAmount(newAmount);
              setTotalAmount(newAmount);
              localStorage.setItem("amount", String(newAmount));
            }}
            className="border-4 px-2 py-1 w-full max-w-50 no-spinner"
          />
        </div>

        {!progress.isGenerating ? (
          <button
            onClick={handleGenerate}
            disabled={progress.isGenerating}
            className="bg-[#FFDF0F] px-5 text-[#262626] hover:-translate-y-1 active:translate-y-0 cursor-pointer disabled:opacity-50"
          >
            {progress.isGenerating ? "Generating..." : "Generate"}
          </button>
        ) : (
          <button
            onClick={handleStop}
            disabled={!progress.isGenerating}
            className="bg-red-500 text-white px-5 hover:-translate-y-1 active:translate-y-0 cursor-pointer disabled:opacity-50"
            title="Stop generating now"
          >
            Stop
          </button>
        )}

        <button
          onClick={() => window.open(`${baseUrl}/api/download-zip`, "_blank")}
          className="hover:-translate-y-1 active:translate-y-0 cursor-pointer border-4 px-5"
        >
          Download ZIP
        </button>

        <div className="flex flex-1 items-center justify-end gap-2 *:hover:-translate-y-1 *:active:translate-y-0">
          <button
            onClick={() => setRounded(false)}
            className={`border-3 w-5 h-5 cursor-pointer ${
              rounded ? "bg-none" : "bg-white"
            }`}
          />
          <button
            onClick={() => setRounded(true)}
            className={`border-3 w-5 h-5 rounded-full cursor-pointer ${
              rounded ? "bg-white" : "bg-none"
            }`}
          />
          <button
            onClick={() => setShowFilterSort((v) => !v)}
            className={`w-5 h-5 cursor-pointer transition-all ${
              showFilterSort ? "" : "rotate-180"
            }`}
            title="Sort & Filter"
          >
            <svg
              viewBox="0 0 32 32"
              fill="white"
              stroke="white"
              strokeWidth="10"
              className="w-full h-full"
            >
              <polygon points="8,12 24,12 16,24" />
            </svg>
          </button>
        </div>
      </div>

      {/* ------- FILTER & SORT MENU POPUP --------- */}
      {showFilterSort && (
        <div className="absolute right-7 top-35 z-50 text-white bg-[#262626] border-4 p-5 drop-shadow-xl min-w-[400px] shadow-2xl flex flex-col gap-4">
          <label className="text-4xl font-bold">Sort by</label>
          <select
            className="p-2 bg-transparent border *:bg-black text-xl"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "edition" | "rarity")}
          >
            <option value="edition">Edition</option>
            <option value="rarity">Rarity</option>
          </select>
          <div className="flex gap-3 text-xl *:cursor-pointer *:active:translate-y-1">
            <button
              className={`border-2 px-3 py-1 ${
                sortOrder === "asc" ? "bg-yellow-400 text-black" : ""
              }`}
              onClick={() => setSortOrder("asc")}
            >
              Asc
            </button>
            <button
              className={`border-2 px-3 py-1 ${
                sortOrder === "desc" ? "bg-yellow-400 text-black" : ""
              }`}
              onClick={() => setSortOrder("desc")}
            >
              Desc
            </button>
          </div>

          {/* ---- TRAIT FILTERS ---- */}
          {traitTypes.length > 0 &&
            traitTypes.map((tt) => (
              <div key={tt}>
                <SearchableDropdown
                  label={tt}
                  options={traitValuesByType[tt].map((v) =>
                    withCountLabel(tt, v)
                  )}
                  value={traitFilters[tt] || ""}
                  onChange={(val) =>
                    setTraitFilters((prev) => ({
                      ...prev,
                      [tt]: stripCountLabel(val),
                    }))
                  }
                />
              </div>
            ))}

          <button
            onClick={() => {
              setTraitFilters({});
              setSortBy("edition");
              setSortOrder("asc");
              setShowFilterSort(false);
            }}
            className="bg-yellow-400 text-black font-semibold text-2xl py-1 mt-4 cursor-pointer active:translate-y-1"
          >
            Reset & Close
          </button>
        </div>
      )}

      {/* progress bar */}
      {progress.isGenerating && (
        <div className="w-full border-4 h-8">
          <div
            className="bg-[#FFDF0F] h-4"
            style={{ width: `${(progress.done / progress.total) * 100 || 0}%` }}
          />
          <p className="text-xl mt-5">
            Generating {progress.done} / {progress.total}
          </p>
        </div>
      )}

      {/* grid */}
      {progress.isGenerating ? (
        <div className="mt-16 text-xl opacity-70">
          There's nothing to show here, try generate first or reset filter.
        </div>
      ) : (
        <>
          <div className="mt-20 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-x-8 gap-y-4">
            {previewItems.map((item) => {
              const idNum = Number(item.edition ?? item.token_id ?? 0);
              const normalized = item.image
                ? normalizeImageUrl(item.image, baseUrl)
                : `${baseUrl}/output/images/${idNum}.png`;
              const thumbSrc = `${normalized}${
                normalized.includes("?") ? "&" : "?"
              }ts=${previewTs}`;

              return (
                <button
                  key={`nft-${idNum}-${item.image}`}
                  onClick={() => openTokenModal(item)}
                  className="text-center group"
                  title={`Token details #${idNum}`}
                >
                  <AppImage
                    path={thumbSrc}
                    alt={`NFT #${idNum}`}
                    className={`w-full border-5 border-white transition-transform duration-300 ease-out group-hover:scale-105 select-none ${
                      rounded ? "rounded-full" : "rounded-none"
                    }`}
                    style={{ width: "100%", height: "auto" }}
                    pixelated
                    loading="lazy"
                    unoptimized
                  />
                  <p className="mt-2 text-xl">{item?.name ?? idNum}</p>
                  {item.hasMetadata === false && (
                    <p className="text-xs opacity-60">metadata missing</p>
                  )}
                </button>
              );
            })}
          </div>

          {hasMore && (
            <div className="flex justify-center my-8">
              <button
                onClick={() => {
                  const next = page + 1;
                  setPage(next);
                  void loadPage(next);
                }}
                disabled={loadingPage}
                className="border px-4 py-2"
              >
                {loadingPage ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </>
      )}

      <TokenDetailModal
        open={isModalOpen}
        onClose={closeTokenModal}
        token={selectedToken}
      />
    </main>
  );
}
