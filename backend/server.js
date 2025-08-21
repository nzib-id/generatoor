const express = require("express");
const fs = require("fs-extra");
const path = require("path");

console.clear();
console.log("🚀 Server restarted at", new Date().toLocaleTimeString());

// PATCH AUTO DEFAULT WEIGHTS MULAI DI SINI
const { sanitize } = require("./utils/sanitize");
const traitRulesPath = path.join(__dirname, "utils", "traitrules.json");
const layersPath = path.join(__dirname, "layers");

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

fs.writeFileSync(traitRulesPath, JSON.stringify(traitRules, null, 2));
console.log(
  "PATCH: Default weights ensured (no overwrite, context-aware, sanitized)."
);

// ========== lanjut ke deklarasi CORS, express, API, routes, dst =========

const cors = require("cors");
const { generateOneNFT } = require("./generator");
const { generateAllNFT, getProgress, cancelGenerate } = require("./generator");

const app = express();
const PORT = 4000;

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
app.use("/utils", express.static(path.join(__dirname, "utils")));

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
    fs.writeFileSync(
      path.join(__dirname, "utils", "layerorder.json"),
      JSON.stringify(order, null, 2)
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
      global: mergedGlobal,
      specific: mergedSpecific,
    };

    fs.writeFileSync(
      traitRulesPath,
      JSON.stringify(finalRules, null, 2),
      "utf8"
    );
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

    fs.writeFileSync(traitRulesPath, JSON.stringify(updated, null, 2), "utf8");
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

    fs.writeFileSync(traitRulesPath, JSON.stringify(rules, null, 2), "utf8");
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
      fs.writeFileSync(traitRulesPath, JSON.stringify(rules, null, 2), "utf8");
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

// Generate multiple NFTs via API
app.post("/api/generate", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount < 1) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // Pindah clean output ke sini (setelah valid input)
    const outputDir = path.join(__dirname, "output");
    await fs.emptyDir(path.join(outputDir, "images"));
    await fs.emptyDir(path.join(outputDir, "metadata"));

    const batchPrefix = Date.now();
    const results = [];

    for (let i = 1; i <= amount; i++) {
      const tokenId = `${batchPrefix}-${i}`;
      const edition = i;
      const metadata = await generateOneNFT(tokenId, edition);
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
    const { amount = 10, start = 1, context = [] } = req.body;

    if (isNaN(amount) || amount < 1) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const outputDir = path.join(__dirname, "output");
    await fs.emptyDir(path.join(outputDir, "images"));
    await fs.emptyDir(path.join(outputDir, "metadata"));

    // Non-blocking generate (ga tungguin proses selesai)
    generateAllNFT(start, amount, context);

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

const archiver = require("archiver");

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

    fs.writeFileSync(rulesPath, JSON.stringify(updated, null, 2));
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
const multer = require("multer");
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

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
