#!/usr/bin/env node
/**
 * Trait Usage Analyzer
 * Jalanin setelah generate buat cek pemakaian trait dari metadata.
 *
 * Fitur:
 * - Hitung pemakaian trait_type/value dari semua metadata JSON
 * - (Opsional) Scan folder /layers buat daftar trait yang "seharusnya ada"
 * - Bandingkan -> munculkan list trait yang 0 kali kepakai
 * - Output ke console + simpan report JSON & CSV di /output/reports/
 *
 * Usage:
 *   node scripts/analyze-usage.js \
 *     --metadata backend/output/metadata \
 *     --layers backend/layers \
 *     --out backend/output/reports
 *
 * Argumen opsional:
 *   --rules backend/utils/traitrules.json   (kalau mau baca weights/showTo sebagai referensi tambahan)
 */

const fs = require("fs-extra");
const path = require("path");

function arg(key, fallback = undefined) {
  const i = process.argv.indexOf(key);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

// === CLI args (edit sesuai struktur project lo) ===
const METADATA_DIR = arg(
  "--metadata",
  path.join(__dirname, "output", "metadata")
);
const LAYERS_DIR = arg("--layers", path.join(__dirname, "layers"));
const OUT_DIR = arg("--out", path.join(__dirname, "output", "reports"));
const RULES_PATH = arg(
  "--rules",
  path.join(__dirname, "utils", "traitrules.json")
);

// Coba load sanitize (kalau ada, bagus; kalau ngga ada, fallback)
let sanitize;
try {
  ({ sanitize } = require(path.join(__dirname, "utils", "sanitize"))); // << sebelumnya pakai ".."
} catch {
  sanitize = (s) =>
    String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^\w-]/g, "");
}

async function readAllJson(dir) {
  const files = await fs.readdir(dir);
  const jsonFiles = files.filter((f) => f.toLowerCase().endsWith(".json"));
  const out = [];
  for (const f of jsonFiles) {
    const p = path.join(dir, f);
    try {
      const raw = await fs.readFile(p, "utf8");
      const data = JSON.parse(raw);
      out.push({ file: f, data });
    } catch (e) {
      console.warn("⚠️  Gagal parse:", f, e.message);
    }
  }
  return out;
}

async function getAllPngFilesRecursively(dir) {
  const results = [];
  async function walk(d) {
    const list = await fs.readdir(d);
    for (const name of list) {
      const p = path.join(d, name);
      const stat = await fs.stat(p);
      if (stat.isDirectory()) {
        await walk(p);
      } else if (name.toLowerCase().endsWith(".png")) {
        results.push(p);
      }
    }
  }
  if (await fs.pathExists(dir)) {
    await walk(dir);
  }
  return results;
}

// Derive trait_type dan value dari path PNG di /layers
function deriveTraitFromPath(pngPath, layersRoot) {
  const rel = path.relative(layersRoot, pngPath);
  const parts = rel.split(path.sep);
  // Struktur umum: layers/<trait_type>/<...subdirs (context?)...>/<filename>.png
  const traitType = sanitize(parts[0] || "unknown");
  const file = parts[parts.length - 1] || "";
  const base = file.replace(/\.png$/i, "");
  const value = sanitize(base);

  // Context (opsional): subpath antara trait_type dan filename
  const contextParts = parts.slice(1, -1);
  const contextPath = contextParts.map(sanitize).filter(Boolean);
  const context = contextPath.length ? contextPath.join("/") : undefined;

  return { trait_type: traitType, value, context, source: rel };
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

(async () => {
  console.log("🔎 Analyzing trait usage...");
  console.log("   METADATA_DIR:", METADATA_DIR);
  console.log("   LAYERS_DIR  :", LAYERS_DIR);
  console.log("   OUT_DIR     :", OUT_DIR);

  await fs.ensureDir(OUT_DIR);

  // 1) Baca semua metadata
  const metas = await readAllJson(METADATA_DIR);
  const totalTokens = metas.length;
  if (!totalTokens) {
    console.warn(
      "⚠️  Tidak menemukan metadata JSON. Pastikan path --metadata benar."
    );
  }

  // 2) Hitung pemakaian trait dari metadata
  // Map: usage[trait_type][value] = count
  const usage = {};
  for (const { data } of metas) {
    const attrs = Array.isArray(data.attributes) ? data.attributes : [];
    for (const a of attrs) {
      const t = sanitize(a.trait_type);
      // nilai attribute bisa string/number/bool/null
      const v = sanitize(
        typeof a.value === "string"
          ? a.value
          : a.value === null
          ? "null"
          : String(a.value)
      );
      if (!usage[t]) usage[t] = {};
      if (!usage[t][v]) usage[t][v] = 0;
      usage[t][v]++;
    }
  }

  // 3) (Opsional) Ambil daftar "expected traits" dari /layers
  const expected = {}; // expected[trait_type] = Set(values)  (tanpa context, fokus value saja)
  const expectedWithContext = []; // simpan detail lengkap utk info
  if (await fs.pathExists(LAYERS_DIR)) {
    const pngs = await getAllPngFilesRecursively(LAYERS_DIR);
    for (const p of pngs) {
      const info = deriveTraitFromPath(p, LAYERS_DIR);
      if (!expected[info.trait_type]) expected[info.trait_type] = new Set();
      expected[info.trait_type].add(info.value);
      expectedWithContext.push(info);
    }
  }

  // 4) (Opsional) Baca rules sebagai referensi (nggak wajib untuk hitung 0-usage)
  let rulesWeights = null;
  if (await fs.pathExists(RULES_PATH)) {
    try {
      const raw = await fs.readFile(RULES_PATH, "utf8");
      const obj = JSON.parse(raw);
      rulesWeights = obj.weights || null;
    } catch (e) {
      console.warn("⚠️  Gagal baca rules:", RULES_PATH, e.message);
    }
  }

  // 5) Tentukan 0-usage
  //    - Kalau ada daftar expected dari layers -> pakai itu sebagai pembanding utama
  //    - Kalau nggak ada layers, ya 0-usage dihitung relatif ke apa yang muncul di usage saja (tidak ideal)
  const zeroUsage = []; // { trait_type, value }
  if (Object.keys(expected).length) {
    for (const t of Object.keys(expected)) {
      const set = expected[t];
      for (const v of set) {
        const count = usage[t]?.[v] || 0;
        if (count === 0) zeroUsage.push({ trait_type: t, value: v });
      }
    }
  } else {
    console.warn(
      "⚠️  Tidak ada referensi layers; zero-usage hanya valid jika trait tidak muncul sama sekali di metadata (tidak ada baseline)."
    );
  }

  // 6) Susun ringkasan usage flat untuk output
  const usageFlat = [];
  for (const t of Object.keys(usage)) {
    for (const v of Object.keys(usage[t])) {
      usageFlat.push({
        trait_type: t,
        value: v,
        count: usage[t][v],
        percent:
          totalTokens > 0 ? +((usage[t][v] / totalTokens) * 100).toFixed(2) : 0,
      });
    }
  }
  usageFlat.sort(
    (a, b) => a.trait_type.localeCompare(b.trait_type) || b.count - a.count
  );

  // 7) Write reports
  const stamp = nowStamp();
  const jsonPath = path.join(OUT_DIR, `trait-usage-${stamp}.json`);
  const csvPath = path.join(OUT_DIR, `trait-usage-${stamp}.csv`);
  const zeroJsonPath = path.join(OUT_DIR, `trait-zero-usage-${stamp}.json`);

  const report = {
    generated_at: new Date().toISOString(),
    total_tokens: totalTokens,
    totals_by_trait_type: Object.fromEntries(
      Object.entries(usage).map(([t, obj]) => [
        t,
        Object.values(obj).reduce((a, b) => a + b, 0),
      ])
    ),
    usage: usageFlat,
    zero_usage: zeroUsage,
    rules_weights_attached: !!rulesWeights,
  };

  await fs.writeJson(jsonPath, report, { spaces: 2 });
  await fs.writeJson(zeroJsonPath, zeroUsage, { spaces: 2 });

  // CSV simple
  const csvLines = ["trait_type,value,count,percent"];
  for (const u of usageFlat) {
    csvLines.push([u.trait_type, u.value, u.count, u.percent].join(","));
  }
  await fs.writeFile(csvPath, csvLines.join("\n"), "utf8");

  // 8) Console output ringkas
  console.log("\n=== TRAIT USAGE SUMMARY ===");
  console.log("Total metadata:", totalTokens);
  const totalTypes = Object.keys(usage).length;
  console.log("Trait types counted:", totalTypes);

  if (Object.keys(expected).length) {
    console.log(
      "Found layers reference. Checking zero-usage against layers..."
    );
  } else {
    console.log("No layers reference. Zero-usage list may be incomplete.");
  }

  // Show Top 10 paling jarang dipakai (non-zero)
  const rare = usageFlat
    .filter((x) => x.count > 0)
    .sort((a, b) => a.count - b.count)
    .slice(0, 10);
  console.log("\nTop 10 rare (non-zero):");
  for (const r of rare) {
    console.log(`  ${r.trait_type}/${r.value}: ${r.count}x (${r.percent}%)`);
  }

  // Show zero-usage
  if (zeroUsage.length) {
    console.log(`\n❌ Zero-usage traits (${zeroUsage.length}):`);
    for (const z of zeroUsage.slice(0, 50)) {
      console.log(`  ${z.trait_type}/${z.value}`);
    }
    if (zeroUsage.length > 50)
      console.log(`  ...and ${zeroUsage.length - 50} more`);
  } else {
    console.log(
      "\n✅ Tidak ada trait zero-usage (berdasarkan referensi yang ada)."
    );
  }

  console.log("\n📝 Saved reports:");
  console.log("  JSON (usage):", jsonPath);
  console.log("  CSV  (usage):", csvPath);
  console.log("  JSON (zero ) :", zeroJsonPath);
})();
