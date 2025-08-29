const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const cors = require("cors");
const archiver = require("archiver");
const multer = require("multer"); // ← PINDAH KE SINI

const { buildFileIndex, readDrawOrder } = require("./generator");

const json = express.json();

function writeJsonIfChangedSync(file, obj) {
  const next = JSON.stringify(obj, null, 2);
  let prev = null;
  try {
    prev = fs.readFileSync(file, "utf8");
  } catch (_) {
    /* file belum ada */
  }
  if (prev !== next) {
    fs.writeFileSync(file, next);
  }
}

function sanitizeSize(val, def = 1080) {
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return def;
  // batas aman; bebas kamu sesuaikan
  return Math.max(64, Math.min(8192, n));
}

if (process.env.NODE_ENV !== "production") console.clear();
console.log("🚀 Server restarted at", new Date().toLocaleTimeString());

// PATCH AUTO DEFAULT WEIGHTS MULAI DI SINI
const { sanitize } = require("./utils/sanitize");
const traitRulesPath = path.join(__dirname, "utils", "traitrules.json");
const layersPath = path.join(__dirname, "layers");
fs.ensureDirSync(layersPath); // pakai fs-extra yang sudah kamu import
fs.ensureDirSync(path.join(__dirname, ".tmp_uploads"));

let traitRules = fs.existsSync(traitRulesPath)
  ? JSON.parse(fs.readFileSync(traitRulesPath, "utf8"))
  : {};

traitRules.weights = traitRules.weights || {};

function ctxKey(trait, ctx) {
  return `${sanitize(trait)}__${sanitize(ctx || "")}`;
}

function walk(dir, prefix = "") {
  const res = [];
  if (!fs.existsSync(dir)) return res;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      res.push(...walk(p, path.join(prefix, name)));
    } else if (/\.(png|jpg)$/i.test(name)) {
      res.push(path.join(prefix, name).replace(/\\/g, "/"));
    }
  }
  return res;
}

fs.readdirSync(layersPath).forEach((traitType) => {
  const traitTypePath = path.join(layersPath, traitType);
  if (!fs.statSync(traitTypePath).isDirectory()) return;

  const files = walk(traitTypePath);
  for (const rel of files) {
    const parts = rel.split("/");
    const valueRaw = parts[parts.length - 1].replace(/\.(png|jpg)$/i, "");
    const contextRaw = parts.length > 1 ? parts.slice(0, -1).join("/") : "";

    const bucket = ctxKey(traitType, contextRaw);
    const value = sanitize(valueRaw);

    traitRules.weights[bucket] = traitRules.weights[bucket] || {};
    if (traitRules.weights[bucket][value] == null) {
      traitRules.weights[bucket][value] = 100;
    }
  }
});

writeJsonIfChangedSync(traitRulesPath, traitRules);
console.log(
  "PATCH: Default weights ensured (no overwrite, context-aware, sanitized)."
);

// ========== lanjut ke deklarasi CORS, express, API, routes, dst =========

const { generateOneNFT } = require("./generator");
const { generateAllNFT, getProgress, cancelGenerate } = require("./generator");

const app = express();
const PORT = 4000;

if (process.env.NODE_ENV !== "production") {
  const morgan = require("morgan");
  app.use(morgan("dev"));
}

// ✅ Middleware CORS - allow all origins
app.use(
  cors({
    origin: "*", // atau sesuaikan "http://localhost:3000" biar lebih ketat
  })
);

app.use(express.json());

// Serve static files
app.use("/layers", express.static(path.join(__dirname, "layers")));
app.use("/output", express.static(path.join(__dirname, "output")));

// ========== PREVIEW INDEX (gabungan, paginated) ==========
app.get("/api/preview-index", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const size = Math.min(
      300,
      Math.max(1, parseInt(req.query.size || "250", 10))
    );

    const imagesDir = path.join(__dirname, "output", "images");
    const metaDir = path.join(__dirname, "output", "metadata");

    await fs.ensureDir(imagesDir);
    await fs.ensureDir(metaDir);

    // Ambil semua PNG/GIF
    let files = [];
    try {
      files = (await fs.readdir(imagesDir)).filter((f) =>
        /\.(png|gif)$/i.test(f)
      );
    } catch {
      files = [];
    }

    // Petakan id ↔ filename (id dari angka di nama file)
    const entries = files
      .map((f) => {
        const base = f.replace(/\.(png|gif)$/i, "");
        const m = base.match(/\d+/);
        return m ? { id: parseInt(m[0], 10), filename: f } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.id - b.id);

    const total = entries.length;
    const startIndex = (page - 1) * size;
    const pageEntries = entries.slice(startIndex, startIndex + size);

    const items = await Promise.all(
      pageEntries.map(async ({ id, filename }) => {
        const image = `/output/images/${filename}`;
        const metaPath = path.join(metaDir, `${id}.json`);
        let meta = null;
        if (await fs.pathExists(metaPath)) {
          try {
            meta = await fs.readJson(metaPath);
          } catch (_) {}
        }
        return {
          token_id: id,
          image,
          name: meta?.name ?? `Parodee #${id}`,
          attributes: Array.isArray(meta?.attributes) ? meta.attributes : [],
          hasMetadata: !!meta,
        };
      })
    );

    // No-cache
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    res.json({
      page,
      size,
      total,
      itemsCount: items.length,
      items,
    });
  } catch (e) {
    console.error("preview-index error:", e);
    res.status(500).json({ error: "preview-index failed" });
  }
});

// /api/traits endpoint - FULL RECURSIVE, INCLUDE SUBFOLDER, CONTEXT, dan URL LENGKAP

app.get("/api/traits", (req, res) => {
  const traitsDir = path.join(__dirname, "layers");
  const layerOrderPath = path.join(__dirname, "utils", "layerorder.json");
  fs.ensureDirSync(traitsDir);

  let layerOrder = [];
  if (fs.existsSync(layerOrderPath)) {
    layerOrder = JSON.parse(fs.readFileSync(layerOrderPath, "utf8"));
  } else {
    layerOrder = fs
      .readdirSync(traitsDir)
      .filter((file) => fs.statSync(path.join(traitsDir, file)).isDirectory());
  }

  let allTraits = [];

  // RECURSIVE FILE WALKER
  function getPngsRecursive(dir, prefix = "") {
    let results = [];
    if (!fs.existsSync(dir)) return results;

    fs.readdirSync(dir).forEach((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        results = results.concat(
          getPngsRecursive(filePath, path.join(prefix, file))
        );
      } else if (file.endsWith(".png")) {
        results.push(path.join(prefix, file).replace(/\\/g, "/"));
      }
    });

    return results;
  }

  layerOrder.forEach((layer) => {
    const folderPath = path.join(traitsDir, layer);
    const files = getPngsRecursive(folderPath);

    files.forEach((relPath) => {
      // relPath contoh: "male/alien1.png" atau "alien1.png"
      const parts = relPath.split("/");
      const value = path.basename(relPath, ".png");
      const context = parts.length > 1 ? parts.slice(0, -1).join("/") : ""; // support multi-level
      allTraits.push({
        type: layer,
        value: value,
        context: context,
        image: `/layers/${layer}/${relPath}`,
      });
    });
  });

  res.json(allTraits);
});

// Save custom layer order
app.post("/api/layer-order", (req, res) => {
  const { order } = req.body;

  if (!Array.isArray(order)) {
    return res.status(400).json({ error: "Invalid format" });
  }

  try {
    writeJsonIfChangedSync(
      path.join(__dirname, "utils", "layerorder.json"),
      order
    );

    res.json({ message: "Layer order saved!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save order" });
  }
});

app.get("/api/rules", (req, res) => {
  try {
    const rules = fs.readFileSync(traitRulesPath, "utf-8");
    const parsed = JSON.parse(rules);
    console.log(parsed);
    res.json(parsed);
  } catch (err) {
    console.error("❌ Error reading traitrules.json:", err);
    res.status(500).json({ error: "Error reading traitrules.json" });
  }
});

app.post("/api/rules", async (req, res) => {
  const { global = {}, specific = [], mode } = req.body;
  const { sanitize } = require("./utils/sanitize");

  function sanitizeRules(rules) {
    return (rules || []).map((rule) => {
      const fixed = {
        trait: sanitize(rule.trait),
        value: sanitize(rule.value),
        ...(rule.context ? { context: sanitize(rule.context) } : {}),
      };

      if (Array.isArray(rule.exclude_with)) {
        fixed.exclude_with = rule.exclude_with.map((r) => ({
          trait: sanitize(r.trait),
          value: sanitize(r.value),
          ...(r.context ? { context: sanitize(r.context) } : {}),
        }));
      }

      if (Array.isArray(rule.require_with)) {
        fixed.require_with = rule.require_with.map((r) => ({
          trait: sanitize(r.trait),
          value: sanitize(r.value),
          ...(r.context ? { context: sanitize(r.context) } : {}),
        }));
      }

      if (Array.isArray(rule.always_with)) {
        fixed.always_with = rule.always_with.map((r) => ({
          trait: sanitize(r.trait),
          value: sanitize(r.value),
          ...(r.context ? { context: sanitize(r.context) } : {}),
        }));
      }

      return fixed;
    });
  }

  const sanitizedSpecific = sanitizeRules(specific);

  try {
    // baca rules lama
    let existing = { weights: {}, showTo: {}, global: {}, specific: [] };
    if (fs.existsSync(traitRulesPath)) {
      existing = JSON.parse(fs.readFileSync(traitRulesPath, "utf8"));
    }

    let mergedGlobal = existing.global || {};
    let mergedSpecific = existing.specific || [];

    if (mode === "append") {
      const newSpecific = sanitizedSpecific.filter((nr) => {
        return !mergedSpecific.some(
          (er) =>
            er.trait === nr.trait &&
            er.value === nr.value &&
            JSON.stringify(er.exclude_with || []) ===
              JSON.stringify(nr.exclude_with || []) &&
            JSON.stringify(er.require_with || []) ===
              JSON.stringify(nr.require_with || []) &&
            JSON.stringify(er.always_with || []) ===
              JSON.stringify(nr.always_with || [])
        );
      });
      mergedSpecific = [...mergedSpecific, ...newSpecific];
    } else {
      mergedGlobal = global; // update global kalau dikirim
      mergedSpecific = sanitizedSpecific; // replace specific sesuai UI
    }

    // ⛔ PENTING: pertahankan weights & showTo lama
    const finalRules = {
      weights: existing.weights || {},
      showTo: existing.showTo || {},
      tags: existing.tags || {},
      global: mergedGlobal,
      specific: mergedSpecific,
    };

    writeJsonIfChangedSync(traitRulesPath, finalRules);

    res.json({ message: "✅ Rules saved successfully!" });
  } catch (err) {
    console.error("❌ Error saving rules:", err);
    res.status(500).json({ error: "Failed to save rules." });
  }
});

app.delete("/api/rules", async (req, res) => {
  const { trait, value, type, targets, context = "" } = req.body;

  try {
    if (!trait || !value || !type || !Array.isArray(targets)) {
      return res.status(400).json({ error: "Invalid data for deletion" });
    }

    const raw = fs.readFileSync(traitRulesPath, "utf8");
    const rules = JSON.parse(raw);

    const filteredSpecific = rules.specific.filter((rule) => {
      // PATCH: compare context too!
      if (
        rule.trait !== trait ||
        rule.value !== value ||
        (rule.context || "") !== (context || "")
      )
        return true;

      const fieldMap = {
        exclude: "exclude_with",
        require: "require_with",
        pair: "always_with",
      };

      const field = fieldMap[type];
      const ruleTargets = rule[field];

      // Kalau match semua item, hapus rule-nya
      if (
        ruleTargets &&
        JSON.stringify(ruleTargets) === JSON.stringify(targets)
      ) {
        return false;
      }

      return true;
    });

    const updated = {
      ...rules,
      specific: filteredSpecific,
    };

    writeJsonIfChangedSync(traitRulesPath, updated);

    console.log("Rule deleted!");
    res.json({ message: "✅ Rule deleted!" });
  } catch (err) {
    console.error("❌ Error deleting rule:", err);
    res.status(500).json({ error: "Failed to delete rule." });
  }
});

// === SHOWTO: Upsert satu item (create/update) ===
app.patch("/api/rules/showto", (req, res) => {
  try {
    let { trait_type, value, tags } = req.body || {};
    if (!trait_type || !value || !Array.isArray(tags)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const { sanitize } = require("./utils/sanitize");
    trait_type = sanitize(String(trait_type));
    value = sanitize(String(value));
    tags = tags.map((t) => sanitize(String(t))).filter(Boolean);

    // baca rules lama, jaga field lain
    let rules = { weights: {}, showTo: {}, global: {}, specific: [] };
    if (fs.existsSync(traitRulesPath)) {
      rules = JSON.parse(fs.readFileSync(traitRulesPath, "utf8")) || rules;
    }

    rules.showTo = rules.showTo || {};
    rules.showTo[trait_type] = rules.showTo[trait_type] || {};
    rules.showTo[trait_type][value] = tags; // overwrite sesuai UI
    rules.tags = rules.tags || {};

    writeJsonIfChangedSync(traitRulesPath, rules);

    return res.json({ message: "ok", tags: rules.showTo[trait_type][value] });
  } catch (e) {
    console.error("❌ Failed to save showTo:", e);
    return res.status(500).json({ error: "Failed to save showTo" });
  }
});

// === SHOWTO: Hapus satu entry (trait_type+value) ===
app.delete("/api/rules/showto", (req, res) => {
  try {
    let { trait_type, value } = req.body || {};
    if (!trait_type || !value) {
      return res.status(400).json({ error: "trait_type & value required" });
    }

    const { sanitize } = require("./utils/sanitize");
    trait_type = sanitize(String(trait_type));
    value = sanitize(String(value));

    let rules = { weights: {}, showTo: {}, global: {}, specific: [] };
    if (fs.existsSync(traitRulesPath)) {
      rules = JSON.parse(fs.readFileSync(traitRulesPath, "utf8")) || rules;
    }

    if (rules.showTo?.[trait_type]?.[value]) {
      delete rules.showTo[trait_type][value];
      if (!Object.keys(rules.showTo[trait_type]).length) {
        delete rules.showTo[trait_type];
      }
      writeJsonIfChangedSync(traitRulesPath, rules);
    }

    return res.json({ message: "ok" });
  } catch (e) {
    console.error("❌ Failed to delete showTo:", e);
    return res.status(500).json({ error: "Failed to delete showTo" });
  }
});

// === SHOWTO: Get cepat untuk satu kombinasi (opsional, useful buat debug/preview) ===
app.get("/api/rules/showto/:trait_type/:value", (req, res) => {
  try {
    const { sanitize } = require("./utils/sanitize");
    const tt = sanitize(String(req.params.trait_type || ""));
    const val = sanitize(String(req.params.value || ""));

    let rules = { weights: {}, showTo: {}, global: {}, specific: [] };
    if (fs.existsSync(traitRulesPath)) {
      rules = JSON.parse(fs.readFileSync(traitRulesPath, "utf8")) || rules;
    }

    const tags = rules.showTo?.[tt]?.[val] || [];
    return res.json({ trait_type: tt, value: val, tags });
  } catch (e) {
    console.error("❌ Failed to read showTo:", e);
    return res.status(500).json({ error: "Failed to read showTo" });
  }
});

// Tags

// -- helper: sanitizer lokal (server-side)
const s = (v = "") => String(v).normalize().trim();
const clean = (v = "") => s(v);
// item = {trait_type, value, context?}
const normalizeItem = (it) => {
  if (!it || typeof it !== "object") return null;
  const trait_type = clean(it.trait_type);
  const value = clean(it.value);
  const context = clean(it.context || "");
  if (!trait_type || !value) return null;
  return context ? { trait_type, value, context } : { trait_type, value };
};
const cleanItems = (items = []) =>
  Array.isArray(items) ? items.map(normalizeItem).filter(Boolean) : [];

const eqItem = (a, b) =>
  a.trait_type === b.trait_type &&
  a.value === b.value &&
  (a.context || "") === (b.context || "");

// -- IO
const readRules = () => {
  try {
    if (!fs.existsSync(traitRulesPath)) {
      const init = { specific: [], showTo: {}, weights: {}, tags: {} };
      fs.writeFileSync(traitRulesPath, JSON.stringify(init, null, 2));
      return init;
    }
    const j = JSON.parse(fs.readFileSync(traitRulesPath, "utf8"));
    return ensureTagsRoot(j);
  } catch (e) {
    // fallback aman kalau file korup
    return { specific: [], showTo: {}, weights: {}, tags: {} };
  }
};
const writeRules = (r) =>
  writeJsonIfChangedSync(traitRulesPath, ensureTagsRoot(r));

const ensureTagsRoot = (rules) => {
  if (!rules || typeof rules !== "object") rules = {};
  if (!Array.isArray(rules.specific)) rules.specific = [];
  if (!rules.showTo || typeof rules.showTo !== "object") rules.showTo = {};
  if (!rules.weights || typeof rules.weights !== "object") rules.weights = {};
  if (!rules.tags || typeof rules.tags !== "object") rules.tags = {};
  return rules;
};
const ensureTagNode = (rules, tag) => {
  if (!rules.tags[tag]) rules.tags[tag] = { subtags: {} };
  if (!rules.tags[tag].subtags || typeof rules.tags[tag].subtags !== "object") {
    rules.tags[tag].subtags = {};
  }
  return rules.tags[tag];
};

// ===== GET semua tags
app.get("/api/rules/tags", (req, res) => {
  const rules = readRules();
  res.json(rules.tags || {});
});

// ===== POST bikin tag (folder) – STRICT (409 kalau ada)
app.post("/api/rules/tags", json, (req, res) => {
  const tag = clean(req.body?.tag);
  if (!tag) return res.status(400).json({ error: "Tag name is required" });

  const rules = readRules();
  const exists = !!rules.tags?.[tag];
  if (exists) {
    return res.status(409).json({ error: "Tag already exists", tag });
  }
  ensureTagNode(rules, tag);
  writeRules(rules);
  res.json({ ok: true, tag });
});

// ===== POST bikin subtag (subfolder) – STRICT (409 kalau ada)
// POST bikin subtag (STRICT per-tag)
app.post("/api/rules/tags/:tag", json, (req, res) => {
  const tag = clean(req.params.tag);
  const subtag = clean(req.body?.subtag);
  if (!tag) return res.status(400).json({ error: "Tag required" });
  if (!subtag) return res.status(400).json({ error: "Subtag is required" });

  const rules = readRules();
  const node = ensureTagNode(rules, tag);

  // ❗ cek keberadaan subtag HANYA di dalam tag saat ini
  if (node.subtags?.[subtag]) {
    return res
      .status(409)
      .json({ error: "Subtag already exists", tag, subtag });
  }

  node.subtags[subtag] = [];
  writeRules(rules);
  res.json({ ok: true, tag, subtag });
});

// ===== PATCH add/remove item ke subtag (incremental)
app.patch("/api/rules/tags/:tag/:subtag", json, (req, res) => {
  const tag = clean(req.params.tag);
  const sub = clean(req.params.subtag);
  if (!tag || !sub)
    return res.status(400).json({ error: "Tag/Subtag required" });

  const add = cleanItems(req.body?.add || []);
  const remove = cleanItems(req.body?.remove || []);

  const rules = readRules();
  const node = ensureTagNode(rules, tag);
  if (!node.subtags[sub]) node.subtags[sub] = [];

  // remove dulu yang match
  if (remove.length) {
    node.subtags[sub] = node.subtags[sub].filter(
      (x) => !remove.some((r) => eqItem(r, x))
    );
  }
  // add yang belum ada
  for (const it of add) {
    if (!node.subtags[sub].some((x) => eqItem(x, it))) {
      node.subtags[sub].push(it);
    }
  }

  writeRules(rules);
  res.json({ ok: true, tag, subtag: sub, items: node.subtags[sub] });
});

// ===== (opsional) PUT replace full subtag – kalau masih dipakai
app.put("/api/rules/tags/:tag/:subtag", json, (req, res) => {
  const tag = clean(req.params.tag);
  const sub = clean(req.params.subtag);
  const items = cleanItems(req.body?.items || []);
  if (!tag || !sub)
    return res.status(400).json({ error: "Tag/Subtag required" });

  const rules = readRules();
  const node = ensureTagNode(rules, tag);
  node.subtags[sub] = items;
  writeRules(rules);
  res.json({ ok: true, tag, subtag: sub, count: items.length });
});

// PATCH rename subtag: /api/rules/tags/:tag/:subtag/rename  { newName }
app.patch("/api/rules/tags/:tag/:subtag/rename", json, (req, res) => {
  const tag = clean(req.params.tag);
  const oldName = clean(req.params.subtag);
  const newName = clean(req.body?.newName || "");

  if (!tag) return res.status(400).json({ error: "Tag required" });
  if (!oldName) return res.status(400).json({ error: "Old subtag required" });
  if (!newName) return res.status(400).json({ error: "New subtag required" });

  const rules = readRules();
  const node = ensureTagNode(rules, tag);

  if (!node.subtags?.[oldName]) {
    return res.status(404).json({ error: "Source subtag not found" });
  }
  if (node.subtags[newName]) {
    // Biar aman, kita TOLAK kalau nama baru sudah ada. (Kalau mau merge, bilang, gue ubah)
    return res.status(409).json({ error: "Target subtag already exists" });
  }

  node.subtags[newName] = node.subtags[oldName];
  delete node.subtags[oldName];

  writeRules(rules);
  res.json({
    ok: true,
    tag,
    from: oldName,
    to: newName,
    count: node.subtags[newName].length,
  });
});

// ===== DELETE tag
app.delete("/api/rules/tags/:tag", (req, res) => {
  const tag = clean(req.params.tag);
  const rules = readRules();
  if (!rules.tags[tag]) return res.status(404).json({ error: "Tag not found" });
  delete rules.tags[tag];
  writeRules(rules);
  res.json({ ok: true, tag, removed: true });
});

// ===== DELETE subtag
app.delete("/api/rules/tags/:tag/:subtag", (req, res) => {
  const tag = clean(req.params.tag);
  const sub = clean(req.params.subtag);
  const rules = readRules();
  if (!rules.tags?.[tag])
    return res.status(404).json({ error: "Tag not found" });
  if (!rules.tags[tag].subtags?.[sub])
    return res.status(404).json({ error: "Subtag not found" });
  delete rules.tags[tag].subtags[sub];
  writeRules(rules);
  res.json({ ok: true, tag, subtag: sub, removed: true });
});

// Generate multiple NFTs via API
app.post("/api/generate", async (req, res) => {
  try {
    const { amount, outWidth, outHeight } = req.body || {};
    if (!amount || isNaN(amount) || amount < 1) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // Pindah clean output ke sini (setelah valid input)
    const outputDir = path.join(__dirname, "output");
    await fs.emptyDir(path.join(outputDir, "images"));
    await fs.emptyDir(path.join(outputDir, "metadata"));

    // === BACA SEKALI: order, rules, dan bangun index
    const { readDrawOrder, buildFileIndex } = require("./generator");
    const drawOrder = readDrawOrder();
    const traitRulesPath = path.join(__dirname, "utils", "traitrules.json");
    const traitRules = fs.existsSync(traitRulesPath)
      ? JSON.parse(fs.readFileSync(traitRulesPath, "utf-8"))
      : {};
    const fileIndex = await buildFileIndex(
      path.join(__dirname, "layers"),
      drawOrder
    );

    // ukuran output (opsional; default 1080x1080)
    const opts = {
      outWidth: sanitizeSize(outWidth, 1080),
      outHeight: sanitizeSize(outHeight, 1080),
    };

    const batchPrefix = Date.now();
    const results = [];
    for (let i = 1; i <= amount; i++) {
      const tokenId = `${batchPrefix}-${i}`;
      const metadata = await generateOneNFT(
        tokenId,
        [], // contextTags opsional
        traitRules,
        fileIndex,
        opts // <<— teruskan ukuran ke generator
      );
      results.push(metadata);
    }

    res.json({ success: true, items: results });
  } catch (err) {
    console.error("❌ Failed to generate NFTs:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/generate-bulk", async (req, res) => {
  try {
    const {
      amount = 10,
      start = 1,
      context = [],
      outWidth,
      outHeight,
    } = req.body || {};

    if (isNaN(amount) || amount < 1) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const outputDir = path.join(__dirname, "output");
    await fs.emptyDir(path.join(outputDir, "images"));
    await fs.emptyDir(path.join(outputDir, "metadata"));

    const opts = {
      outWidth: sanitizeSize(outWidth, 1080),
      outHeight: sanitizeSize(outHeight, 1080),
    };

    // Non-blocking generate (ga tungguin proses selesai)
    generateAllNFT(start, amount, Array.isArray(context) ? context : [], opts);

    res.json({ message: "🚀 NFT generation started!" });
  } catch (err) {
    console.error("❌ Failed to start bulk generation:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/generate/stop", (req, res) => {
  cancelGenerate();
  res.json({ ok: true, cancelled: true });
});

// List output images
app.get("/api/generated-tokens", async (req, res) => {
  try {
    const imgDir = path.join(__dirname, "output/images");
    const files = (await fs.readdir(imgDir))
      .filter((f) => /\.(png|gif)$/i.test(f))
      .map((f) => f.replace(/\.(png|gif)$/i, ""))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
        const numB = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
        return numA - numB;
      });

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    res.json({ tokenIds: files });
  } catch (err) {
    res.status(500).json({ error: "Gagal baca images" });
  }
});

app.get("/api/download-zip", (req, res) => {
  const outputPath = path.join(__dirname, "output");

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=parodee-output.zip"
  );

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);
  archive.directory(outputPath, false);
  archive.finalize();
});

app.get("/api/generate-progress", (req, res) => {
  try {
    const progress = getProgress();
    res.json(progress);
  } catch (err) {
    console.error("❌ Failed to get progress:", err);
    res.status(500).json({ error: "Failed to get progress" });
  }
});

// 🚨 ENDPOINT: Simpan weights ke traitRules.json
app.post("/api/save-rules", (req, res) => {
  try {
    const { weights } = req.body;

    const rulesPath = path.join(__dirname, "utils", "traitrules.json");

    // Ambil data lama (showTo, specific)
    let existing = { weights: {}, showTo: {}, specific: [] };
    if (fs.existsSync(rulesPath)) {
      existing = JSON.parse(fs.readFileSync(rulesPath));
    }

    // Gabungkan: replace weights tapi tetap simpan showTo & specific
    const updated = {
      ...existing,
      weights: weights !== undefined ? weights : existing.weights,
    };

    writeJsonIfChangedSync(rulesPath, updated);

    console.log("✅ Weights saved!");
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to save rules", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Test ping
app.get("/api/ping", (req, res) => {
  res.json({ message: "🧠 Parodee Generator API is running!" });
});

// === Custom Token 1/1 ===
const { v4: uuidv4 } = require("uuid");
const customDir = path.join(__dirname, "custom", "images");
const customDBPath = path.join(__dirname, "utils", "customTokens.json");

// pastikan folder & db ada
fs.ensureDirSync(customDir);
if (!fs.existsSync(customDBPath)) {
  fs.writeFileSync(customDBPath, JSON.stringify({ items: [] }, null, 2));
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, customDir);
  },
  filename: function (req, file, cb) {
    // simpan dengan uuid + ext asli
    const ext = path.extname(file.originalname || ".png");
    cb(null, `${uuidv4()}${ext || ".png"}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!/\.(png|gif)$/i.test(file.originalname)) {
      return cb(new Error("Only .png or .gif allowed"));
    }
    cb(null, true);
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // naikin dikit buat GIF
});

// static serve untuk preview
app.use("/custom/images", express.static(customDir));

// GET list custom tokens
app.get("/api/custom-tokens", (_req, res) => {
  try {
    const db = JSON.parse(fs.readFileSync(customDBPath, "utf-8"));
    res.json(db.items || []);
  } catch (e) {
    res.status(500).json({ error: "Failed to read custom tokens" });
  }
});

// POST upload + metadata (multipart/form-data)
app.post("/api/custom-tokens", upload.single("image"), (req, res) => {
  try {
    const { name, trait_type, include, description, attributes } = req.body;

    if (!req.file)
      return res.status(400).json({ error: "image (.png atau .gif) required" });

    if (!name) return res.status(400).json({ error: "name required" });

    // parse attributes kalau dikirim (boleh kosong)
    let attrs = undefined;
    if (typeof attributes !== "undefined") {
      try {
        const parsed =
          typeof attributes === "string" ? JSON.parse(attributes) : attributes;
        if (Array.isArray(parsed)) {
          // keep only {trait_type, value} string pairs
          attrs = parsed
            .filter((x) => x && typeof x === "object")
            .map((x) => ({
              trait_type: String(x.trait_type ?? "").trim(),
              value: String(x.value ?? "").trim(),
            }))
            .filter((x) => x.trait_type && x.value);
          if (attrs.length === 0) attrs = undefined;
        }
      } catch (_) {
        // attributes invalid → abaikan aja (optional)
      }
    }

    const db = JSON.parse(fs.readFileSync(customDBPath, "utf-8"));
    const item = {
      id: uuidv4(), // internal id (bukan token_id)
      file: `/custom/images/${req.file.filename}`,
      name: String(name),
      include: include === "true" || include === true,
      created_at: Date.now(),
      ...(trait_type ? { trait_type: String(trait_type) } : {}),
      ...(description ? { description: String(description) } : {}),
      ...(attrs ? { attributes: attrs } : {}),
    };

    db.items.push(item);
    fs.writeFileSync(customDBPath, JSON.stringify(db, null, 2));
    res.json(item);
  } catch (e) {
    res.status(500).json({
      error: "Failed to save custom token",
      detail: String(e?.message || e),
    });
  }
});

// PATCH set include true/false
// PATCH set include / edit fields
app.patch("/api/custom-tokens/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { include, name, trait_type, description, attributes } =
      req.body || {};

    const db = JSON.parse(fs.readFileSync(customDBPath, "utf-8"));
    const idx = db.items.findIndex((x) => x.id === id);
    if (idx === -1) return res.status(404).json({ error: "not found" });

    if (typeof include !== "undefined") db.items[idx].include = !!include;
    if (typeof name === "string" && name.trim())
      db.items[idx].name = name.trim();
    if (typeof trait_type === "string" && trait_type.trim())
      db.items[idx].trait_type = trait_type.trim();
    if (typeof description === "string") {
      if (description.trim()) db.items[idx].description = description.trim();
      else delete db.items[idx].description;
    }

    if (typeof attributes !== "undefined") {
      let attrs = attributes;
      try {
        if (typeof attrs === "string") attrs = JSON.parse(attrs);
      } catch (_) {}
      if (Array.isArray(attrs)) {
        const cleaned = attrs
          .filter((x) => x && typeof x === "object")
          .map((x) => ({
            trait_type: String(x.trait_type ?? "").trim(),
            value: String(x.value ?? "").trim(),
          }))
          .filter((x) => x.trait_type && x.value);
        if (cleaned.length) db.items[idx].attributes = cleaned;
        else delete db.items[idx].attributes; // kosongin kalau gak valid/empty
      } else if (attributes === null) {
        delete db.items[idx].attributes; // explicit null → hapus
      }
    }

    fs.writeFileSync(customDBPath, JSON.stringify(db, null, 2));
    res.json(db.items[idx]);
  } catch (e) {
    res.status(500).json({
      error: "Failed to update custom token",
      detail: String(e?.message || e),
    });
  }
});

// DELETE hapus item
app.delete("/api/custom-tokens/:id", (req, res) => {
  try {
    const { id } = req.params;
    const db = JSON.parse(fs.readFileSync(customDBPath, "utf-8"));
    const idx = db.items.findIndex((x) => x.id === id);
    if (idx === -1) return res.status(404).json({ error: "not found" });

    const filePath = path.join(
      __dirname,
      db.items[idx].file.replace(/^\/+/, "")
    );
    // aman-kan: hapus file kalau ada
    fs.pathExists(filePath).then((exists) => {
      if (exists) fs.remove(filePath);
    });

    const removed = db.items.splice(idx, 1);
    fs.writeFileSync(customDBPath, JSON.stringify(db, null, 2));
    res.json({ ok: true, removed: removed[0]?.id });
  } catch (e) {
    res.status(500).json({
      error: "Failed to delete custom token",
      detail: String(e?.message || e),
    });
  }
});

// === CONST & UTILS ===
const LAYERS_DIR = path.join(__dirname, "layers");
const rulesPath = path.join(__dirname, "utils", "traitrules.json");

function safePath(rel) {
  const p = path.normalize(path.join(LAYERS_DIR, rel));
  if (!p.startsWith(LAYERS_DIR)) throw new Error("Out of bounds");
  return p;
}
function listTree(dir = LAYERS_DIR, base = "") {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((name) => {
    const full = path.join(dir, name);
    const rel = path.join(base, name).replace(/\\/g, "/");
    const st = fs.statSync(full);
    return st.isDirectory()
      ? { type: "dir", name, path: rel, children: listTree(full, rel) }
      : { type: "file", name, path: rel };
  });
}
function walkFiles(dir, prefix = "") {
  let out = [];
  if (!fs.existsSync(dir)) return out;
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) out = out.concat(walkFiles(p, path.join(prefix, n)));
    else if (/\.png$/i.test(n)) {
      out.push(path.join(prefix, n).replace(/\\/g, "/"));
    }
  }
  return out;
}

function rebuildWeights() {
  let rules = fs.existsSync(rulesPath)
    ? JSON.parse(fs.readFileSync(rulesPath, "utf8"))
    : {};
  rules.weights = {};
  fs.ensureDirSync(LAYERS_DIR);

  const traitTypes = fs
    .readdirSync(LAYERS_DIR)
    .filter((d) => fs.statSync(path.join(LAYERS_DIR, d)).isDirectory());

  for (const traitType of traitTypes) {
    const files = walkFiles(path.join(LAYERS_DIR, traitType));
    for (const rel of files) {
      const parts = rel.split("/");
      const valueRaw = parts.at(-1).replace(/\.png$/i, ""); // PNG-only
      const contextRaw = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
      const bucket = `${sanitize(traitType)}__${sanitize(contextRaw || "")}`;
      const value = sanitize(valueRaw);
      rules.weights[bucket] ??= {};
      if (rules.weights[bucket][value] == null) {
        rules.weights[bucket][value] = 100;
      }
    }
  }
  writeJsonIfChangedSync(rulesPath, rules);
}

app.get("/api/traits-tree", (_req, res) => {
  try {
    res.json({ items: listTree() });
  } catch (e) {
    res.status(500).json({ error: "Failed to read tree" });
  }
});

// ===== /api/upload-traits (VERBOSE LOGGING) =====
const crypto = require("crypto");
const os = require("os");

// Memory storage → tiap file punya buffer sendiri (hindari ketuker)
const uploadTraits = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 5000,
    fileSize: 20 * 1024 * 1024, // 20 MB
    fieldNameSize: 10 * 1024, // jaga2 fieldname panjang (files:<rel>)
    fields: 10000, // banyak subfolder? aman
  },
});

app.post(
  "/api/upload-traits",
  (req, res, next) => {
    // Log awal request (sebelum multer proses)
    console.log("===== /api/upload-traits REQUEST =====");
    console.log("[time]", new Date().toISOString());
    console.log(
      "[ip]",
      req.ip,
      "| x-forwarded-for:",
      req.headers["x-forwarded-for"]
    );
    console.log("[method]", req.method, "[url]", req.originalUrl);
    console.log("[content-type]", req.headers["content-type"]);
    console.log("[content-length]", req.headers["content-length"]);
    console.log("[user-agent]", req.headers["user-agent"]);
    console.log("======================================");
    next();
  },
  uploadTraits.any(),
  async (req, res) => {
    // Log hasil parsing multer
    try {
      const files = Array.isArray(req.files) ? req.files : [];
      console.log("---- Multer parsed ----");
      console.log("files.length =", files.length);
      if (!files.length) {
        console.warn("No files parsed by multer. Kemungkinan:");
        console.warn("- FormData tidak mengirim file");
        console.warn("- Boundary multipart hilang / content-type salah");
        console.warn("- Proxy mengubah request");
        return res.status(400).json({ error: "no files" });
      }

      // rel path dari fieldname "files:<rel>", fallback ke originalname
      const relOf = (f) => {
        const fn = String(f.fieldname || "");
        if (fn.startsWith("files:")) return fn.slice(6);
        return String(f.originalname || "");
      };

      // Dump per-file info awal
      files.forEach((f, i) => {
        const sha1 = crypto.createHash("sha1").update(f.buffer).digest("hex");
        console.log(
          `[file#${i}] fieldname="${f.fieldname}" original="${f.originalname}" size=${f.size} mime=${f.mimetype} sha1=${sha1}`
        );
      });

      // --- 1) validasi path minimal & 1 root ---
      const rels = files
        .map(relOf)
        .map((s) => s.replace(/\\/g, "/").trim())
        .filter(Boolean);

      if (!rels.length) {
        console.warn("Semua rel kosong setelah normalisasi.");
        return res.status(400).json({ error: "invalid rel paths" });
      }

      for (const rel of rels) {
        const seg = rel.split("/").filter(Boolean);
        if (seg.length < 3) {
          console.error("Invalid path (butuh Project/Layer/file):", rel);
          return res
            .status(400)
            .json({
              error: `Invalid path: ${rel}. Minimal Project/Layer/file`,
            });
        }
      }

      const roots = Array.from(new Set(rels.map((p) => p.split("/")[0])));
      console.log("roots =", roots);
      if (roots.length !== 1) {
        console.error("Lebih dari 1 root project:", roots);
        return res
          .status(400)
          .json({ error: "Upload must be ONE root folder (project)" });
      }
      const project = roots[0];

      // --- 2) hitung rel di bawah /layers ---
      fs.ensureDirSync(layersPath);
      const layersRootName = path.basename(layersPath);
      const getRelAfterLayers = (parts) => {
        const i = parts.findIndex(
          (p) => p.toLowerCase() === layersRootName.toLowerCase()
        );
        if (i >= 0 && i < parts.length - 1) return parts.slice(i + 1);
        return parts.slice(1); // buang parent project
      };

      // --- 3) rencanakan tulis → Map<dstRel, {buf, from, sha1}> ---
      const plan = new Map();
      const debugList = [];

      for (const f of files) {
        const srcRelRaw = relOf(f).replace(/\\/g, "/");
        const parts = srcRelRaw.split("/").filter(Boolean);
        const after = getRelAfterLayers(parts);
        if (after.length < 2) {
          console.warn("Skip karena kurang dari Layer/filename:", srcRelRaw);
          continue;
        }

        const base = after[after.length - 1];
        if (/^\.DS_Store$/i.test(base) || /__MACOSX/i.test(srcRelRaw)) {
          console.log("Skip junk:", srcRelRaw);
          continue;
        }
        if (after.some((s) => s === "." || s === "..")) {
          console.error("Path traversal terdeteksi:", srcRelRaw);
          return res
            .status(400)
            .json({ error: "illegal path segment", from: srcRelRaw });
        }

        const dstRel = after.join("/");
        if (!/\.png$/i.test(dstRel)) {
          console.log("Skip non-png:", srcRelRaw);
          continue;
        }

        if (plan.has(dstRel)) {
          const prev = plan.get(dstRel);
          console.error("Duplicate target path:", dstRel, "from", [
            prev.from,
            srcRelRaw,
          ]);
          return res.status(400).json({
            error: "duplicate target path",
            target: dstRel,
            from: [prev.from, srcRelRaw],
          });
        }

        const sha1 = crypto.createHash("sha1").update(f.buffer).digest("hex");
        plan.set(dstRel, {
          buf: f.buffer,
          from: srcRelRaw,
          sha1,
          size: f.size,
        });
      }

      console.log("Planned writes:", plan.size);

      if (plan.size === 0) {
        console.warn(
          "Tidak ada file sah untuk ditulis (mungkin semua non-png / junk)."
        );
        return res.status(400).json({ error: "no valid png files" });
      }

      // --- 4) tulis ke disk ---
      for (const [rel, { buf, from, sha1, size }] of plan.entries()) {
        const dst = path.join(layersPath, rel);
        console.log(
          "WRITE →",
          dst,
          "| from:",
          from,
          "| bytes:",
          size,
          "| sha1:",
          sha1
        );
        await fs.mkdir(path.dirname(dst), { recursive: true });
        await fs.writeFile(dst, buf);
        debugList.push({ rel, from, bytes: size, sha1, dst });
      }

      // --- 5) merge layerorder.json ---
      const orderPath = path.join(__dirname, "utils", "layerorder.json");
      let existingOrder = [];
      if (fs.existsSync(orderPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(orderPath, "utf8"));
          if (Array.isArray(raw)) existingOrder = raw;
          else if (raw && Array.isArray(raw.order)) existingOrder = raw.order;
        } catch (e) {
          console.warn("layerorder.json parse warning:", e.message);
        }
      }
      const traitTypes = fs
        .readdirSync(layersPath)
        .filter((d) => fs.statSync(path.join(layersPath, d)).isDirectory());
      const kept = existingOrder.filter((name) => traitTypes.includes(name));
      const missing = traitTypes.filter((name) => !kept.includes(name));
      const finalOrder = [...kept, ...missing];
      console.log(
        "layerorder kept:",
        kept.length,
        "missing:",
        missing.length,
        "final:",
        finalOrder.length
      );
      writeJsonIfChangedSync(orderPath, finalOrder);

      // --- 6) simpan prefix project & rebuild weights ---
      writeJsonIfChangedSync(path.join(__dirname, "utils", "project.json"), {
        namePrefix: project,
        uploadedAt: new Date().toISOString(),
        host: os.hostname(),
      });

      console.log("Rebuild weights…");
      rebuildWeights();
      console.log("Rebuild weights done.");

      return res.json({
        success: true,
        message: "Traits uploaded, rules & layer order updated",
        stats: {
          totalReceived: files.length,
          totalWritten: plan.size,
          traitTypes: traitTypes.length,
          newLayersAppended: missing.length,
          orderLength: finalOrder.length,
        },
        debug: debugList, // verifikasi Male/Noir vs Female/Noir beda sha1
      });
    } catch (e) {
      // Tangkap error multer (limit dll) & lain-lain
      const code = e && e.code ? String(e.code) : "";
      if (code) console.error("Multer/Node error code:", code);
      console.error("upload-traits error:", e?.stack || e);
      const hint =
        code === "LIMIT_FILE_SIZE"
          ? "File terlalu besar (kena limit multer)"
          : code === "LIMIT_FILE_COUNT"
          ? "Kelebihan jumlah file (kena limit multer)"
          : undefined;
      return res.status(500).json({
        error: "upload-traits failed",
        code,
        hint,
        detail: String(e?.message || e),
      });
    }
  }
);

app.delete("/api/traits", async (req, res) => {
  try {
    const { target } = req.body || {};
    if (!target) return res.status(400).json({ error: "target required" });
    const full = safePath(target);
    if (!fs.existsSync(full))
      return res.status(404).json({ error: "not found" });
    const st = fs.statSync(full);
    if (st.isDirectory()) await fs.remove(full);
    else await fs.unlink(full);
    rebuildWeights();
    res.json({ ok: true });
  } catch (e) {
    res
      .status(500)
      .json({ error: "Failed to delete", detail: String(e.message || e) });
  }
});

app.patch("/api/traits/rename", async (req, res) => {
  try {
    const { from, to } = req.body || {};
    if (!from || !to)
      return res.status(400).json({ error: "from & to required" });
    const src = safePath(from),
      dst = safePath(to);
    if (!fs.existsSync(src))
      return res.status(404).json({ error: "source not found" });
    await fs.ensureDir(path.dirname(dst));
    await fs.move(src, dst, { overwrite: false });
    rebuildWeights();
    res.json({ ok: true });
  } catch (e) {
    const msg = /exists|EEXIST/i.test(String(e))
      ? "target already exists"
      : "Failed to rename";
    res.status(500).json({ error: msg, detail: String(e.message || e) });
  }
});

app.post("/api/traits/bulk-rename", async (req, res) => {
  try {
    const {
      base = "",
      pattern,
      replacement = "",
      includeSubdirs = true,
      testOnly = false,
    } = req.body || {};
    if (!pattern) return res.status(400).json({ error: "pattern required" });
    const rx = new RegExp(pattern, "g");
    const root = safePath(base);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      return res.status(404).json({ error: "base dir not found" });
    }
    const scan = (dir, rel = "") => {
      let out = [];
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const r = path.posix.join(rel.replace(/\\/g, "/"), name);
        const st = fs.statSync(full);
        if (st.isDirectory()) {
          if (includeSubdirs) out = out.concat(scan(full, r));
        } else if (/\.(png|jpg)$/i.test(name)) out.push(r);
      }
      return out;
    };
    const files = scan(root, base);
    const planned = [];
    for (const rel of files) {
      const dir = path.posix.dirname(rel);
      const baseName = path.posix.basename(rel);
      const nextName = baseName.replace(rx, replacement);
      if (nextName !== baseName)
        planned.push({
          from: rel,
          to: dir === "." ? nextName : `${dir}/${nextName}`,
        });
    }
    if (testOnly) return res.json({ planned });
    for (const { from, to } of planned) {
      const src = safePath(from),
        dst = safePath(to);
      await fs.ensureDir(path.dirname(dst));
      if (fs.existsSync(dst)) throw new Error(`target exists: ${to}`);
      await fs.move(src, dst);
    }
    rebuildWeights();
    res.json({ ok: true, changed: planned.length, planned });
  } catch (e) {
    res
      .status(500)
      .json({ error: "Bulk rename failed", detail: String(e.message || e) });
  }
});

// ===== GET coverage tags -> cek alokasi lengkap/belum per group & trait
app.get("/api/rules/tags/coverage", async (req, res) => {
  try {
    // 1) ambil rules & index layers
    const rules = readRules(); // sudah ada di file lo
    const drawOrder = readDrawOrder(); // dari generator
    const fileIndex = await buildFileIndex(
      path.join(__dirname, "layers"),
      drawOrder
    );

    // 2) semua nilai unik per TRAIT (dalam bentuk SANITIZE)
    const allValsByTraitSan = new Map(); // traitSan -> Set(valueSan)
    for (const [traitName, items] of fileIndex.entries()) {
      const tSan = sanitize(traitName);
      const set = allValsByTraitSan.get(tSan) || new Set();
      for (const it of items) set.add(sanitize(it.value)); // value dari fileIndex sudah sanitize, tetep dipaksa
      allValsByTraitSan.set(tSan, set);
    }

    // 3) covered (gabungan semua subtag) — juga SANITIZE
    const result = {};
    const tagsRoot = rules.tags || {};
    for (const [group, node] of Object.entries(tagsRoot)) {
      const subtags = node?.subtags || {};

      const coveredByTraitSan = new Map(); // traitSan -> Set(valueSan)
      for (const items of Object.values(subtags)) {
        for (const it of items || []) {
          const tSan = sanitize(it.trait_type);
          const vSan = sanitize(it.value);
          const set = coveredByTraitSan.get(tSan) || new Set();
          set.add(vSan);
          coveredByTraitSan.set(tSan, set);
        }
      }

      // 4) hitung missing per trait (bandingkan SANITIZE vs SANITIZE)
      const perTrait = {};
      for (const [tSan, allSet] of allValsByTraitSan.entries()) {
        if (allSet.size === 0) continue;
        const coveredSet = coveredByTraitSan.get(tSan) || new Set();
        const missing = [...allSet].filter((v) => !coveredSet.has(v));
        perTrait[tSan] = {
          total: allSet.size,
          coveredCount: [...coveredSet].filter((v) => allSet.has(v)).length,
          missing, // <- masih sanitize; beautify di UI
          isComplete: missing.length === 0,
        };
      }

      const traitNames = Object.keys(perTrait);
      const completeTraits = traitNames.filter(
        (t) => perTrait[t].isComplete
      ).length;
      result[group] = {
        perTrait,
        totalTraits: traitNames.length,
        completeTraits,
        isGroupComplete: completeTraits === traitNames.length,
      };
    }

    // no-cache biar UI selalu fresh
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to compute tag coverage" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
