const fs = require("fs-extra");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const { beautify, sanitize } = require("./utils/sanitize");

const IPFS_IMAGE_CID = process.env.IPFS_IMAGE_CID || "CID";
const ipfsUri = (filename) => `ipfs://${IPFS_IMAGE_CID}/${filename}`;

const width = 1280;
const height = 1280;

const layersDir = path.join(__dirname, "layers");

// ==== CANCEL / PROGRESS STATE (NEW) ====
let currentProgress = {
  total: 0,
  done: 0,
  isGenerating: false,
  isCancelled: false,
  startedAt: null,
  lastError: null,
};

function cancelGenerate() {
  currentProgress.isCancelled = true;
}

function assertNotCancelled() {
  if (currentProgress.isCancelled) {
    const err = new Error("CANCELLED");
    err.code = "CANCELLED";
    throw err;
  }
}

// panggil ini sesering mungkin di step mahal
async function checkpoint() {
  assertNotCancelled();
  // optional: micro-yield
  // await Promise.resolve();
}

const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

// 🔁 Ambil semua PNG dari folder + subfolder
async function getAllPngFilesRecursively(dir) {
  let results = [];
  const list = await fs.readdir(dir);

  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);

    if (stat.isDirectory()) {
      const subResults = await getAllPngFilesRecursively(filePath);
      results = results.concat(subResults);
    } else if (file.endsWith(".png")) {
      results.push(filePath);
    }
  }

  return results;
}

// *** PATCH: Helper buat ambil key context ***
function getWeightKey(type, context) {
  return `${sanitize(type)}__${sanitize(context || "")}`;
}

// 🔎 Ambil hanya file trait yang boleh ditampilin sesuai showTo
async function loadValidTraits(
  trait,
  contextTags = [],
  rulesShowTo = {},
  selfHasContext = false
) {
  const layersDir = path.join(__dirname, "layers");
  const traitDir = path.join(layersDir, trait);

  const allPngFiles = await getAllPngFilesRecursively(traitDir);

  const traitRules = JSON.parse(
    fs.readFileSync(path.join(__dirname, "utils", "traitrules.json"), "utf-8")
  );
  const weightsMap = traitRules.weights || {};
  const showToMap = traitRules.showTo || {}; // { [trait]: { [valueSan]: string[]contexts } }

  return (
    allPngFiles
      .map((filePath) => {
        const valueRaw = path.parse(path.basename(filePath)).name;
        const valueSan = sanitize(valueRaw);

        const relative = path.relative(path.join(layersDir, trait), filePath);
        const dirName = path.dirname(relative);
        const contextRaw = dirName === "." ? "" : dirName;
        const contextSan = sanitize(contextRaw);

        // --- Weights lookup konsisten ---
        const weightKey = getWeightKey(trait, contextSan); // `${sanitize(type)}__${sanitize(context)}`
        const weightByValue = weightsMap[weightKey] || {};
        // pakai valueSan dulu, fallback ke raw
        const weight =
          (weightByValue[valueSan] ?? weightByValue[valueRaw] ?? 1) || 1;

        return {
          filename: path.basename(filePath),
          value: valueSan,
          weight,
          path: filePath,
          context: contextSan, // penting untuk filter & aturan
          contextRaw, // optional debug
          contextType: sanitize(trait),
        };
      })
      // --- FILTER berdasar contextTags + showTo (SEGMENT-AWARE) ---
      // SELF-CONTEXT FRIENDLY FILTER
      .filter((opt) => {
        const hasCtxFilter =
          Array.isArray(contextTags) && contextTags.length > 0;

        const optSegments = String(opt.context || "")
          .split("/")
          .map(sanitize)
          .filter(Boolean);

        const traitKey = sanitize(trait);
        const allowedForValue = showToMap?.[traitKey]?.[opt.value];
        const hasShowTo =
          Array.isArray(allowedForValue) && allowedForValue.length > 0;

        const allSegmentsInTags =
          optSegments.length === 0 ||
          optSegments.every((seg) => contextTags.includes(seg));

        // 1) Hormati showTo dulu
        if (hasShowTo) {
          if (!hasCtxFilter) return true;
          return allowedForValue.some((ctx) =>
            contextTags.includes(sanitize(ctx))
          );
        }

        // 2) Kalau trait ini adalah sumber context (punya subfolder),
        //    biarkan opsi yg ber-context lolos saat contextTags belum kebentuk.
        if (selfHasContext && optSegments.length > 0 && !hasCtxFilter) {
          return true;
        }

        // 3) Normal case
        if (!hasCtxFilter) return true;
        return allSegmentsInTags;
      })
  );
}

function weightedRandom(options) {
  const total = options.reduce((sum, o) => sum + (o.weight || 1), 0);
  let rand = Math.random() * total;

  for (const option of options) {
    rand -= option.weight || 1;
    if (rand <= 0) return option;
  }

  return options[options.length - 1]; // fallback
}

// --- Dynamic context helpers ---
function hasContext(pathStr) {
  return !!String(pathStr || "").trim();
}

async function traitHasContextOptions(trait) {
  // baca semua opsi tanpa filter context, kalau ada yang punya opt.context != "" berarti trait ini sumber context
  const opts = await loadValidTraits(trait, [], {});
  return opts.some((o) => hasContext(o.context));
}

// hitung "kedalaman context" (min depth), buat urutan: yang paling umum (depth kecil) dulu
async function traitContextDepth(trait) {
  const opts = await loadValidTraits(trait, [], {});
  let minDepth = Infinity;
  for (const o of opts) {
    if (!hasContext(o.context)) continue;
    const depth = String(o.context).split("/").filter(Boolean).length;
    if (depth < minDepth) minDepth = depth;
  }
  return minDepth === Infinity ? 0 : minDepth;
}

// 🚀 Generate 1 NFT
async function generateOneNFT(token_id, edition, contextTags = []) {
  await checkpoint(); // stop seketika kalau cancel sebelum mulai

  // 🛡️ Putus referensi: pakai salinan lokal
  contextTags = Array.isArray(contextTags) ? [...contextTags] : [];

  const canvas = createCanvas(width, height);
  Object.freeze(contextTags);
  contextTags = [...contextTags]; // kerja dari duplikat yang mutable

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  const attributes = [];

  // DRAW ORDER (tetap reverse)
  const drawOrder = JSON.parse(
    fs.readFileSync(path.join(__dirname, "utils", "layerorder.json"), "utf-8")
  )
    .slice()
    .reverse();

  const traitRules = JSON.parse(
    fs.readFileSync(path.join(__dirname, "utils", "traitrules.json"), "utf-8")
  );
  const rulesList = Array.isArray(traitRules.specific)
    ? traitRules.specific
    : [];

  // --- REORDER untuk SELEKSI (context-first) ---
  const withDepth = [];
  const withoutContext = [];
  for (const t of drawOrder) {
    await checkpoint();
    // eslint-disable-next-line no-await-in-loop
    if (await traitHasContextOptions(t)) {
      // eslint-disable-next-line no-await-in-loop
      const depth = await traitContextDepth(t);
      withDepth.push({ trait: t, depth });
    } else {
      withoutContext.push(t);
    }
  }
  withDepth.sort((a, b) => a.depth - b.depth);
  const selectOrder = [...withDepth.map((x) => x.trait), ...withoutContext];

  // ✅ hanya trait yang benar-benar punya subfolder (context) yang boleh nambah contextTags
  const traitsThatHaveContext = new Set(
    withDepth.map((x) => sanitize(x.trait))
  );

  const chosenByTrait = {}; // { [traitSan]: pickedOption }
  const selectedAttributes = []; // untuk cek rules selama seleksi

  for (const trait of selectOrder) {
    await checkpoint();

    const traitSan = sanitize(trait);
    const rulesShowTo = traitRules.showTo || {};
    const selfHasContext = traitsThatHaveContext.has(traitSan);

    const validOptions = await loadValidTraits(
      trait,
      contextTags,
      rulesShowTo,
      selfHasContext
    );

    await checkpoint();

    const totalWeight = validOptions.reduce(
      (sum, o) => sum + (o.weight || 1),
      0
    );
    if (totalWeight <= 0 || validOptions.length === 0) {
      console.warn(`⚠️ Skipping ${trait} (no valid options / total weight 0)`);
      continue;
    }

    let tries = 0;
    let picked = null;

    // helper: parser attr generic ("ctx - value")
    function parseAttr(a) {
      const t = sanitize(a.trait_type);
      const raw = String(a.value ?? "");
      const s = sanitize(raw);
      const parts = s.split("_-_");
      if (parts.length >= 2) {
        return {
          trait: t,
          value: parts.slice(1).join("_-_"),
          context: parts[0],
        };
      }
      return { trait: t, value: s, context: "" };
    }
    function normRule(obj) {
      return {
        trait: sanitize(obj.trait),
        value: sanitize(obj.value),
        context: sanitize(obj.context || ""),
      };
    }

    while (tries < 10) {
      await checkpoint();
      const cand = weightedRandom(validOptions);
      tries++;

      const candNorm = {
        trait: traitSan,
        value: sanitize(cand.value),
        context: sanitize(cand.context || ""),
      };

      const violates = rulesList.some((ruleRaw) => {
        const rule = normRule(ruleRaw);

        const samePrimary =
          rule.trait === candNorm.trait &&
          rule.value === candNorm.value &&
          (!rule.context || rule.context === candNorm.context);

        // ===== exclude_with (arah 1): cand sebagai primary, tolak jika ada pasangan terlarang yang SUDAH terpilih
        if (samePrimary && Array.isArray(ruleRaw.exclude_with)) {
          return ruleRaw.exclude_with.some((exRaw) => {
            const ex = normRule(exRaw);
            return selectedAttributes.some((a) => {
              const A = parseAttr(a);
              return (
                A.trait === ex.trait &&
                A.value === ex.value &&
                (!ex.context || ex.context === A.context)
              );
            });
          });
        }

        // ===== require_with (arah 1): cand sebagai primary
        // blokir HANYA jika sudah mustahil dipenuhi (partner trait SUDAH terpilih tapi salah)
        if (samePrimary && Array.isArray(ruleRaw.require_with)) {
          const impossible = ruleRaw.require_with.some((reqRaw) => {
            const req = normRule(reqRaw);
            return selectedAttributes.some((a) => {
              const A = parseAttr(a);
              if (A.trait !== req.trait) return false;
              if (req.context && req.context !== A.context) return true; // context mismatch
              if (A.value !== req.value) return true; // value mismatch
              return false; // sudah cocok
            });
          });
          if (impossible) return true;
        }

        // ===== exclude_with (arah 2): ada attr yg sudah terpilih jadi primary, tolak cand kalau cand termasuk daftar exclude-nya
        const matchedAttr = selectedAttributes.find((a) => {
          const A = parseAttr(a);
          return (
            A.trait === rule.trait &&
            A.value === rule.value &&
            (!rule.context || rule.context === A.context)
          );
        });
        if (matchedAttr && Array.isArray(ruleRaw.exclude_with)) {
          return ruleRaw.exclude_with.some((exRaw) => {
            const ex = normRule(exRaw);
            return (
              ex.trait === candNorm.trait &&
              ex.value === candNorm.value &&
              (!ex.context || ex.context === candNorm.context)
            );
          });
        }

        // ===== require_with (arah 2): INI YANG BELUM ADA — inti "Only mixes with"
        // Jika ADA attribute yang sudah terpilih sebagai primary (rule.trait/value[/context]),
        // dan dia punya daftar require_with, maka kandidat INI harus menjadi salah satu pasangan yang DIPERBOLEHKAN.
        if (matchedAttr && Array.isArray(ruleRaw.require_with)) {
          const allowed = ruleRaw.require_with.some((reqRaw) => {
            const req = normRule(reqRaw);
            return (
              req.trait === candNorm.trait &&
              req.value === candNorm.value &&
              (!req.context || req.context === candNorm.context)
            );
          });
          if (!allowed) return true; // cand tidak termasuk daftar "Only mixes with"
        }

        return false;
      });

      if (violates) continue;

      picked = cand;

      // hanya trait sumber context yang boleh nambah contextTags
      if (selfHasContext && picked.context) {
        const segs = String(picked.context)
          .split("/")
          .map(sanitize)
          .filter(Boolean);
        for (const seg of segs) {
          if (!contextTags.includes(seg)) contextTags.push(seg);
        }
      }

      chosenByTrait[traitSan] = picked;

      // simpan attribute buat evaluasi rule berikutnya
      selectedAttributes.push({
        trait_type: traitSan,
        value: picked.context
          ? `${sanitize(picked.context)} - ${sanitize(picked.value)}`
          : sanitize(picked.value),
      });

      break;
    }
  }

  // --- PASS 2: gambar trait ---
  for (const trait of drawOrder) {
    await checkpoint();

    const traitSan = sanitize(trait);
    const picked = chosenByTrait[traitSan];
    if (!picked) continue;

    assertNotCancelled();
    const img = await loadImage(picked.path);
    await checkpoint();
    ctx.drawImage(img, 0, 0, width, height);
    await checkpoint();

    attributes.push({
      trait_type: traitSan,
      value: picked.context
        ? `${sanitize(picked.context)} - ${sanitize(picked.value)}`
        : sanitize(picked.value),
    });
  }

  // 💾 Simpan image pakai edition
  const filename = `${edition}.png`;
  await fs.ensureDir(path.join(__dirname, "output", "images"));
  assertNotCancelled();
  await fs.writeFile(
    path.join(__dirname, "output", "images", filename),
    canvas.toBuffer("image/png")
  );

  // 🧾 Output metadata pakai beautify
  const metadata = {
    name: `Parodee #${edition}`,
    description:
      'The NFT collection that proves the world has officially lost it, so we might as well lose it together. Forget deep philosophies or overpromised roadmaps. Here, we’re just selling pixels, cheap jokes, and god-tier sarcasm.\n\nEach NFT in Parodee is a visual meme disguised as serious art, just enough to make people question if it’s a masterpiece or an expensive joke. If you’re looking for utility, congrats! this NFT has exactly one function, to remind you that you just spent money on a funny picture that (probably) does nothing.\n\nThis collection was born out of boredom, a pinch of social revenge, and a noble mission to prove that "absurd sells". So get your wallet ready, brace yourself, and welcome to Parodee',
    image: ipfsUri(filename), // IPFS
    token_id,
    edition,
    attributes: attributes.map((attr) => ({
      trait_type: capitalize(attr.trait_type),
      value: beautify(attr.value),
    })),
  };

  await fs.ensureDir(path.join(__dirname, "output", "metadata"));
  assertNotCancelled();
  await fs.writeJson(
    path.join(__dirname, "output", "metadata", `${edition}.json`),
    metadata,
    { spaces: 2 }
  );

  await checkpoint();
  return metadata;
}

const pLimit = require("p-limit").default;
const limit = pLimit(10);

async function generateAllNFT(startId, count, contextTags = []) {
  if (currentProgress.isGenerating) {
    throw new Error("Generation already running");
  }

  currentProgress.total = count;
  currentProgress.done = 0;
  currentProgress.isGenerating = true;
  currentProgress.isCancelled = false; // reset cancel saat mulai
  currentProgress.startedAt = Date.now();
  currentProgress.lastError = null;

  // --- defs yg dipakai di awal (hindari TDZ) ---
  const customDBPath = path.join(__dirname, "utils", "customTokens.json");
  function readCustomTokens() {
    try {
      const db = JSON.parse(fs.readFileSync(customDBPath, "utf-8"));
      return (db.items || []).filter((x) => x.include);
    } catch {
      return [];
    }
  }

  // pool token_id random utk SEMUA item (custom + random)
  function generateUniqueRandomIds(n, min = 1000, max = 99999) {
    const set = new Set();
    while (set.size < n) {
      set.add(Math.floor(Math.random() * (max - min + 1)) + min);
    }
    return Array.from(set);
  }

  try {
    assertNotCancelled();

    const tokenIds = generateUniqueRandomIds(count);

    // === 1) MASUKKAN CUSTOM 1/1 DULUAN ===
    const customTokens = readCustomTokens();
    const useCount = Math.min(customTokens.length, tokenIds.length);

    await fs.ensureDir(path.join(__dirname, "output", "images"));
    await fs.ensureDir(path.join(__dirname, "output", "metadata"));

    for (let i = 0; i < useCount; i++) {
      await checkpoint();

      const item = customTokens[i];
      const token_id = tokenIds[i]; // token_id random
      const edition = startId + i; // file/metadata pakai EDITION (urut)

      // path sumber (file bisa /custom/images/xxx.png atau .gif)
      const src = path.join(__dirname, item.file.replace(/^\/+/, ""));
      const ext = (path.extname(src) || ".png").toLowerCase();

      // salin ke output/images dgn ekstensi asli
      const outImageName = `${edition}${ext}`;
      const dst = path.join(__dirname, "output", "images", outImageName);

      assertNotCancelled();
      await fs.copy(src, dst);

      // metadata — kalau GIF tambahkan animation_url
      const meta = {
        name: item.name || `Parodee #${edition}`,
        token_id,
        edition,
        image: ipfsUri(outImageName),
        ...(ext === ".gif" ? { animation_url: ipfsUri(outImageName) } : {}),
        ...(item?.description ? { description: String(item.description) } : {}),
        ...(Array.isArray(item?.attributes) && item.attributes.length
          ? {
              attributes: item.attributes.map((a) => ({
                trait_type: String(a.trait_type),
                value: String(a.value),
              })),
            }
          : {}),
      };

      assertNotCancelled();
      await fs.writeJson(
        path.join(__dirname, "output", "metadata", `${edition}.json`),
        meta,
        { spaces: 2 }
      );

      currentProgress.done++; // progress jalan juga untuk custom
    }
    // === END CUSTOM 1/1 ===

    // sisa token_id buat random
    const remainingTokenIds = tokenIds.slice(useCount);

    // === 2) GENERATE RANDOM UNTUK SISANYA ===
    const tasks = [];
    for (let i = 0; i < remainingTokenIds.length; i++) {
      const token_id = remainingTokenIds[i];
      const edition = startId + useCount + i; // lanjut setelah custom
      tasks.push(
        limit(async () => {
          await checkpoint();
          const baseTags = Array.isArray(contextTags) ? [...contextTags] : [];
          await generateOneNFT(token_id, edition, baseTags);
          await checkpoint();
          currentProgress.done++;
        })
      );
    }

    await Promise.all(
      tasks.map((p) =>
        p.catch((err) => {
          if (err?.code !== "CANCELLED") {
            currentProgress.lastError = String(err?.message || err);
          }
          throw err;
        })
      )
    );
  } catch (err) {
    if (err?.code === "CANCELLED") {
      // dibatalkan instan — silent
    } else {
      console.error("Generate error:", err);
    }
  } finally {
    currentProgress.isGenerating = false;
  }
}

function getProgress() {
  return currentProgress;
}

module.exports = {
  generateOneNFT,
  generateAllNFT,
  getProgress,
  cancelGenerate,
};
