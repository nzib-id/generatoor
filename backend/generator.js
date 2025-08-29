const fs = require("fs-extra");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const sharp = require("sharp");
const pLimitMod = require("p-limit");

const { beautify, sanitize } = require("./utils/sanitize");

const IPFS_IMAGE_CID = process.env.IPFS_IMAGE_CID || "CID";
const ipfsUri = (filename) => `ipfs://${IPFS_IMAGE_CID}/${filename}`;

// === ukuran komposisi & output (PIXEL ART) ===
const BASE_W = 36,
  BASE_H = 36; // ukuran kanvas sesuai aset pixel
const DEFAULT_OUT = 1080; // default output 1080x1080

function resolveOutSize(opts = {}) {
  const w = Number(opts.outWidth) || DEFAULT_OUT;
  const h = Number(opts.outHeight) || DEFAULT_OUT;
  return { OUT_W: Math.max(1, w | 0), OUT_H: Math.max(1, h | 0) };
}

// Tuning sharp
sharp.cache({ memory: 200, files: 50, items: 200 });
sharp.concurrency(
  Math.max(1, Math.min(8, Number(process.env.SHARP_THREADS) || 4))
);

const MAX_IMG_CACHE = Number(process.env.IMG_CACHE_MAX || 200);
const imageCache = new Map(); // key: absPath -> Promise<Image>

async function loadImageCached(absPath) {
  if (imageCache.has(absPath)) return imageCache.get(absPath);
  const p = loadImage(absPath);
  imageCache.set(absPath, p);
  if (imageCache.size > MAX_IMG_CACHE) {
    const lruKey = imageCache.keys().next().value;
    imageCache.delete(lruKey);
  }
  return p;
}

function readDrawOrder() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, "utils", "layerorder.json"), "utf-8")
    );
  } catch {
    return [];
  }
}

// ==== CANCEL / PROGRESS STATE ====
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
function getProgress() {
  return currentProgress;
}
function assertNotCancelled() {
  if (currentProgress.isCancelled) {
    const e = new Error("CANCELLED");
    e.code = "CANCELLED";
    throw e;
  }
}
async function checkpoint() {
  assertNotCancelled();
}

// Utils
const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

// 🔁 Ambil semua PNG dari folder + subfolder
async function getAllPngFilesRecursively(dir) {
  let results = [];
  if (!(await fs.pathExists(dir))) return results;
  const list = await fs.readdir(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      const sub = await getAllPngFilesRecursively(filePath);
      results = results.concat(sub);
    } else if (file.endsWith(".png")) {
      results.push(filePath);
    }
  }
  return results;
}

// Index semua PNG sekali, dikelompokkan per trait
async function buildFileIndex(layersDir, drawOrder) {
  const index = new Map(); // trait -> [{ path, valueSan, contextSan }]
  for (const trait of drawOrder) {
    const traitDir = path.join(layersDir, trait);
    if (!(await fs.pathExists(traitDir))) {
      index.set(trait, []);
      continue;
    }
    const allPngFiles = await getAllPngFilesRecursively(traitDir);
    const items = allPngFiles.map((filePath) => {
      const valueRaw = path.parse(path.basename(filePath)).name;
      const valueSan = sanitize(valueRaw);

      const relative = path.relative(path.join(layersDir, trait), filePath);
      const dirName = path.dirname(relative);
      const contextRaw = dirName === "." ? "" : dirName;
      const contextSan = sanitize(contextRaw);

      return {
        filename: path.basename(filePath),
        value: valueSan,
        path: filePath,
        context: contextSan,
        contextRaw,
        contextType: sanitize(trait),
      };
    });
    index.set(trait, items);
  }
  return index;
}

// Helper buat ambil key context untuk weights
function getWeightKey(type, context) {
  return `${sanitize(type)}__${sanitize(context || "")}`;
}

// 🔎 Ambil hanya file trait yang boleh ditampilin sesuai showTo
async function loadValidTraits(
  trait,
  contextTags = [],
  traitRules,
  selfHasContext = false,
  fileIndex // Map<trait, items[]>
) {
  const weightsMap = traitRules?.weights || {};
  const showToMap = traitRules?.showTo || {};
  const items = (fileIndex && fileIndex.get(trait)) || [];

  const enableCtx = !!traitRules?.global?.enableDynamicContext;

  // Normalisasi contextTags sekali agar perbandingan konsisten
  const ctxSet = new Set(
    Array.isArray(contextTags) ? contextTags.map(sanitize) : []
  );

  return items
    .map((it) => {
      const valueSan = it.value;
      const contextSan = it.context;

      const weightKey = getWeightKey(trait, contextSan);
      const weightByValue = weightsMap[weightKey] || {};
      const weight = (weightByValue[valueSan] ?? 1) || 1;

      return {
        filename: path.basename(it.path),
        value: valueSan,
        weight,
        path: it.path,
        context: contextSan,
        contextRaw: it.contextRaw,
        contextType: sanitize(trait),
      };
    })
    .filter((opt) => {
      const optSegments = String(opt.context || "")
        .split("/")
        .map(sanitize)
        .filter(Boolean);

      // --- SHOWTO: sanitize key trait & value saat lookup
      const traitKey = sanitize(trait);
      const showToForTrait = showToMap?.[traitKey] || {};
      const allowedForValue = showToForTrait[sanitize(opt.value)];
      const hasShowTo =
        Array.isArray(allowedForValue) && allowedForValue.length > 0;

      // === SHOWTO SELALU KUAT ===
      if (hasShowTo) {
        if (ctxSet.size === 0) return false;
        // minimal ada 1 ctx yang cocok
        return allowedForValue.some((ctx) => ctxSet.has(sanitize(ctx)));
      }

      // === Context dynamic (hanya aktif saat enableCtx==true)
      if (!enableCtx) return true;

      const hasCtxFilter = ctxSet.size > 0;

      // 2) Kalau trait sumber context, izinkan opsi ber-context saat contextTags belum kebentuk
      if (selfHasContext && optSegments.length > 0 && !hasCtxFilter) {
        return true;
      }

      // 3) Normal (mode context ON)
      if (!hasCtxFilter) return true;
      return (
        optSegments.length === 0 || optSegments.every((seg) => ctxSet.has(seg))
      );
    });
}

function weightedRandom(options) {
  const total = options.reduce((sum, o) => sum + (o.weight || 1), 0);
  if (total <= 0) return options[Math.floor(Math.random() * options.length)];
  let rand = Math.random() * total;
  for (const option of options) {
    rand -= option.weight || 1;
    if (rand <= 0) return option;
  }
  return options[options.length - 1];
}

// Dynamic context helpers
function hasContext(pathStr) {
  return !!String(pathStr || "").trim();
}

async function traitHasContextOptions(trait, traitRules, fileIndex) {
  const items = (fileIndex && fileIndex.get(trait)) || [];
  return items.some((o) => hasContext(o.context));
}

async function traitContextDepth(trait, traitRules, fileIndex) {
  const items = (fileIndex && fileIndex.get(trait)) || [];
  let minDepth = Infinity;
  for (const o of items) {
    if (!hasContext(o.context)) continue;
    const depth = String(o.context).split("/").filter(Boolean).length;
    if (depth < minDepth) minDepth = depth;
  }
  return minDepth === Infinity ? 0 : minDepth;
}

// helper buat normalisasi "ctx - value" -> {trait, value}
function _normAttrPair(a) {
  const t = sanitize(a.trait_type);
  const raw = String(a.value ?? "");
  const parts = raw.split(" - ");
  const v = parts.length >= 2 ? parts.slice(1).join(" - ") : raw;
  return { trait: t, value: sanitize(v) };
}

/**
 * build map { tagName: [subtag1, subtag2, ...] } dari rules.tags vs attributes
 */
function _resolveTagsMap(traitRules, attributes) {
  const tagsNode = traitRules && traitRules.tags ? traitRules.tags : {};
  const pairs = new Set(
    attributes.map((a) => {
      const { trait, value } = _normAttrPair(a);
      return `${trait}::${value}`;
    })
  );

  const result = {};
  for (const [tag, node] of Object.entries(tagsNode)) {
    const subs = node?.subtags || {};
    for (const [sub, items] of Object.entries(subs)) {
      const hit = (items || []).some((it) => {
        const key = `${sanitize(it.trait_type)}::${sanitize(it.value)}`;
        return pairs.has(key);
      });
      if (hit) {
        if (!result[tag]) result[tag] = [];
        if (!result[tag].includes(sub)) result[tag].push(sub);
      }
    }
  }
  return result;
}

// === TAG RULE ENGINE (gaya Bueno) ================================
// Key string konsisten untuk lookup cepat
function _mkKey(traitSan, valueSan) {
  return `${sanitize(traitSan)}::${sanitize(valueSan)}`;
}

// Kumpulkan semua value unik untuk suatu trait dari fileIndex
function _allValuesForTrait(fileIndex, traitSan) {
  const out = new Set();
  for (const [tName, items] of fileIndex.entries()) {
    if (sanitize(tName) !== sanitize(traitSan)) continue;
    for (const it of items) out.add(sanitize(it.value));
  }
  return out;
}

/**
 * buildTagIndex(traitRules, fileIndex)
 * - Menurunkan index tag sekali, gaya Bueno:
 *   - groups: { [group]: { tags: { [subtag]: Set("trait::value") }, completeByTrait: Set(trait) } }
 *   - item2Groups: Map("trait::value" -> Array<{group, tag}>)
 *   - completeGroupsByTrait: Map(trait -> Set(group)) untuk cek cepat apakah trait ini "lengkap" di suatu grup.
 */
function buildTagIndex(traitRules, fileIndex) {
  const tagsNode = traitRules?.tags || {};
  const tagIndex = {
    groups: {},
    item2Groups: new Map(),
    completeGroupsByTrait: new Map(),
  };

  for (const [group, node] of Object.entries(tagsNode)) {
    const subs = node?.subtags || {};
    const tagsMap = {};
    const coverage = {}; // traitSan -> Set(value)

    for (const [subtag, items] of Object.entries(subs)) {
      const set = new Set();
      for (const it of items || []) {
        const tSan = sanitize(it.trait_type);
        const vSan = sanitize(it.value);
        const key = _mkKey(tSan, vSan);
        set.add(key);

        if (!coverage[tSan]) coverage[tSan] = new Set();
        coverage[tSan].add(vSan);

        const arr = tagIndex.item2Groups.get(key) || [];
        arr.push({ group, tag: subtag });
        tagIndex.item2Groups.set(key, arr);
      }
      tagsMap[subtag] = set;
    }

    const completeByTrait = new Set();
    for (const traitSan of Object.keys(coverage)) {
      const covered = coverage[traitSan];
      const allVals = _allValuesForTrait(fileIndex, traitSan);
      if (allVals.size > 0 && covered.size === allVals.size) {
        completeByTrait.add(traitSan);

        // catat trait -> group lengkap
        const s = tagIndex.completeGroupsByTrait.get(traitSan) || new Set();
        s.add(group);
        tagIndex.completeGroupsByTrait.set(traitSan, s);
      }
    }

    tagIndex.groups[group] = { tags: tagsMap, completeByTrait };
  }

  return tagIndex;
}

// Ambil (group,tag) yang nempel ke (trait,value) dalam O(1)
function _tagsForChoice(tagIndex, traitSan, valueSan) {
  return tagIndex.item2Groups.get(_mkKey(traitSan, valueSan)) || [];
}

/**
 * filterByTagRules(options, traitSan, tagIndex, activeTagChoice)
 * - Kalau suatu trait "lengkap" di sebuah group, dan group itu sudah "terkunci" ke subtag X,
 *   maka hanya opsi yang juga bertag X yang boleh lewat (efek eksklusif/cannots).
 * - Kalau belum lengkap atau belum terkunci -> lolos (fail-open ala Bueno).
 */
function filterByTagRules(options, traitSan, tagIndex, activeTagChoice) {
  const completeGroups = tagIndex.completeGroupsByTrait.get(sanitize(traitSan));
  if (!completeGroups || completeGroups.size === 0) return options; // nggak diatur => lolos cepat

  const out = [];
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const vSan = sanitize(opt.value);
    const hits = tagIndex.item2Groups.get(_mkKey(traitSan, vSan));
    if (!hits || hits.length === 0) {
      out.push(opt);
      continue;
    }

    let ok = true;
    for (let j = 0; j < hits.length && ok; j++) {
      const { group, tag } = hits[j];
      if (!completeGroups.has(group)) continue; // grup ini belum eksklusif untuk trait ini
      const forced = activeTagChoice[group]; // sudah terkunci?
      if (forced && forced !== tag) ok = false; // bentrok dengan kunci → tolak
    }
    if (ok) out.push(opt);
  }
  return out;
}
// ================================================================

// === DUPLICATE PREVENTION =====================================
// Build key stabil dari pilihan trait (urut sesuai drawOrder), contoh:
// "Background=Hell|Skin=Hell - Male|Outfit=Ragnarok|Head=Greed|Face=Slanderer"
function buildComboKey(chosenByTrait, drawOrder) {
  const parts = [];
  for (const t of drawOrder) {
    const tSan = sanitize(t);
    const picked = chosenByTrait[tSan];
    if (!picked) {
      parts.push(`${tSan}=`);
      continue;
    }
    const v = picked.context
      ? `${sanitize(picked.context)} - ${sanitize(picked.value)}`
      : sanitize(picked.value);
    parts.push(`${tSan}=${v}`);
  }
  return parts.join("|");
}

// 🚀 Generate 1 NFT (TOKEN_ID ONLY)
async function generateOneNFT(
  token_id,
  contextTags = [],
  traitRules,
  fileIndex,
  opts = {}
) {
  await checkpoint();

  const enableCtx = !!traitRules?.global?.enableDynamicContext;

  const maxRerolls = Math.max(
    1,
    Number(opts.maxRerolls || process.env.MAX_REROLLS || 200)
  );
  const seenCombos = opts.seenCombos instanceof Set ? opts.seenCombos : null; // optional

  // kanvas kecil (pixel base)
  const canvas = createCanvas(BASE_W, BASE_H);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // Tag Rule Engine state (tetap)
  const tagIndex =
    (opts && opts.tagIndex) || buildTagIndex(traitRules, fileIndex);

  // DRAW ORDER (gambar: reverse)
  const drawOrder = readDrawOrder().slice().reverse();

  // siapkan urutan seleksi (tetap)
  const rulesList = Array.isArray(traitRules?.specific)
    ? traitRules.specific
    : [];

  let selectOrder = [];
  let traitsThatHaveContext = new Set();

  if (enableCtx) {
    const withDepth = [];
    const withoutContext = [];

    for (const t of drawOrder) {
      await checkpoint();
      if (await traitHasContextOptions(t, traitRules, fileIndex)) {
        const depth = await traitContextDepth(t, traitRules, fileIndex);
        withDepth.push({ trait: t, depth });
      } else {
        withoutContext.push(t);
      }
    }
    withDepth.sort((a, b) => a.depth - b.depth);
    selectOrder = [...withDepth.map((x) => x.trait), ...withoutContext];
    traitsThatHaveContext = new Set(withDepth.map((x) => sanitize(x.trait)));
  } else {
    selectOrder = [...drawOrder];
    traitsThatHaveContext = new Set();
  }

  // === NEW: coba beberapa kali sampai dapat kombinasi unik
  for (let attempt = 1; attempt <= maxRerolls; attempt++) {
    await checkpoint();

    ctx.clearRect(0, 0, BASE_W, BASE_H);

    const attributes = [];
    const chosenByTrait = {};
    const selectedAttributes = [];
    const activeTagChoice = {}; // { [group]: "SubtagTerpilih" }

    function parseAttr(a) {
      const t = sanitize(a.trait_type);
      const raw = String(a.value ?? "");
      const s = sanitize(raw);
      const parts = s.split(" - ");
      if (parts.length >= 2) {
        return {
          trait: t,
          value: parts.slice(1).join(" - "),
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

    // === PASS 1: seleksi pilihan per trait (tanpa menggambar dulu)
    for (const trait of selectOrder) {
      await checkpoint();

      const traitSan = sanitize(trait);
      const selfHasContext = traitsThatHaveContext.has(traitSan);

      let validOptions = await loadValidTraits(
        trait,
        contextTags,
        traitRules,
        selfHasContext,
        fileIndex
      );

      // Tag Rule Engine filter (tetap)
      const tagFiltered = filterByTagRules(
        validOptions,
        traitSan,
        tagIndex,
        activeTagChoice
      );
      const optionsToUse = tagFiltered.length > 0 ? tagFiltered : validOptions;

      await checkpoint();

      const totalWeight = optionsToUse.reduce(
        (sum, o) => sum + (o.weight || 1),
        0
      );
      if (totalWeight <= 0 || validOptions.length === 0) {
        // ngak bisa pilih trait ini, skip (sama seperti sebelumnya)
        continue;
      }

      let tries = 0;
      let picked = null;

      while (tries < 10) {
        await checkpoint();
        const cand = weightedRandom(optionsToUse);
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

          // exclude_with (arah 1)
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

          // require_with (arah 1) — kuat & adil
          if (samePrimary && Array.isArray(ruleRaw.require_with)) {
            const conflict = ruleRaw.require_with.some((reqRaw) => {
              const req = normRule(reqRaw);
              const found = selectedAttributes.find((a) => {
                const A = parseAttr(a);
                return (
                  A.trait === req.trait &&
                  (!req.context || req.context === A.context)
                );
              });
              if (!found) return false;
              const f = parseAttr(found);
              return f.value !== req.value;
            });
            if (conflict) return true;
          }

          // exclude_with (arah 2)
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

          // require_with (arah 2)
          if (matchedAttr && Array.isArray(ruleRaw.require_with)) {
            const allowed = ruleRaw.require_with.some((reqRaw) => {
              const req = normRule(reqRaw);
              return (
                req.trait === candNorm.trait &&
                req.value === candNorm.value &&
                (!req.context || req.context === candNorm.context)
              );
            });
            if (!allowed) return true;
          }

          return false;
        });

        if (violates) continue;

        picked = cand;

        // Tambah contextTags kalau enable & trait punya context
        if (enableCtx && selfHasContext && picked.context) {
          const segs = String(picked.context)
            .split("/")
            .map(sanitize)
            .filter(Boolean);
          for (const seg of segs) {
            if (!contextTags.includes(seg)) contextTags.push(seg);
          }
        }

        // catat pilihan
        chosenByTrait[traitSan] = picked;

        // kunci grup tag bila trait ini lengkap
        const hitsAfterPick = _tagsForChoice(
          tagIndex,
          traitSan,
          sanitize(picked.value)
        );
        for (const { group, tag } of hitsAfterPick) {
          const def = tagIndex.groups[group];
          if (!activeTagChoice[group] && def.completeByTrait.has(traitSan)) {
            activeTagChoice[group] = tag;
          }
        }

        selectedAttributes.push({
          trait_type: traitSan,
          value: picked.context
            ? `${sanitize(picked.context)} - ${sanitize(picked.value)}`
            : sanitize(picked.value),
        });

        break;
      }

      if (!picked) {
        // gagal pilih trait ini → skip
        continue;
      }
    } // end for selectOrder

    // === NEW: cek duplicate sebelum gambar
    const comboKey = buildComboKey(chosenByTrait, drawOrder);
    if (seenCombos && seenCombos.has(comboKey)) {
      // dupe → reroll kalau masih ada jatah
      if (attempt === maxRerolls) {
        const e = new Error(
          `UNIQUE_EXHAUSTED: kombinasi unik habis / mentok setelah ${maxRerolls} percobaan`
        );
        e.code = "UNIQUE_EXHAUSTED";
        throw e;
      }
      // reset contextTags dinamis untuk percobaan berikutnya
      // (biar gak "terkunci" dari attempt sebelumnya)
      contextTags = Array.isArray(opts.contextTagsBase)
        ? [...opts.contextTagsBase]
        : [];
      continue;
    }
    if (seenCombos) seenCombos.add(comboKey);

    // === PASS 2: gambar & tulis file (sama seperti sebelumnya)
    for (const trait of drawOrder) {
      await checkpoint();
      const traitSan = sanitize(trait);
      const picked = chosenByTrait[traitSan];
      if (!picked) continue;

      const img = await loadImageCached(picked.path);
      await checkpoint();
      const ctx2d = canvas.getContext("2d");
      ctx2d.imageSmoothingEnabled = false;
      ctx2d.drawImage(img, 0, 0, BASE_W, BASE_H);

      attributes.push({
        trait_type: traitSan,
        value: picked.context
          ? `${sanitize(picked.context)} - ${sanitize(picked.value)}`
          : sanitize(picked.value),
      });
    }

    // Tags map dan metadata (tetap)
    const tagsMap = _resolveTagsMap(traitRules, attributes);
    const filename = `${token_id}.png`;
    await fs.ensureDir(path.join(__dirname, "output", "images"));

    const smallPng = canvas.toBuffer("image/png");
    const { OUT_W, OUT_H } = resolveOutSize(opts);
    const bigPng = await sharp(smallPng)
      .resize(OUT_W, OUT_H, { kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();

    await fs.writeFile(
      path.join(__dirname, "output", "images", filename),
      bigPng
    );

    // Helper: pecah "ctx - value" -> { ctx, val }
    function splitCtxVal(raw) {
      const s = String(raw ?? "");
      const parts = s.split(" - ");
      if (parts.length >= 2) {
        return { ctx: parts[0], val: parts.slice(1).join(" - ") };
      }
      return { ctx: "", val: s };
    }

    // Bangun attributes versi "marketplace-friendly":
    const metaAttrs = [];
    const seenContexts = new Set(); // hindari duplikat Context

    for (const attr of attributes) {
      const t = capitalize(attr.trait_type);
      const { ctx, val } = splitCtxVal(attr.value);

      // Trait asli tanpa prefix context
      metaAttrs.push({
        trait_type: t,
        value: beautify(val),
      });

      // Tambah Context (sekali per nilai unik)
      if (ctx) {
        const prettyCtx = beautify(ctx.replace(/\//g, " / "));
        if (!seenContexts.has(prettyCtx)) {
          seenContexts.add(prettyCtx);
          metaAttrs.push({
            trait_type: "Type",
            value: prettyCtx,
          });
        }
      }
    }

    // Tambahkan tag group/subtag (tetap)
    for (const [tag, subs] of Object.entries(tagsMap)) {
      for (const sub of subs) {
        metaAttrs.push({ trait_type: capitalize(tag), value: beautify(sub) });
      }
    }

    const metadata = {
      name: `Parodee #${token_id}`,
      description:
        'The NFT collection that proves the world has officially lost it, so we might as well lose it together. Forget deep philosophies or overpromised roadmaps. Here, we’re just selling pixels, cheap jokes, and god-tier sarcasm.\n\nEach NFT in Parodee is a visual meme disguised as serious art, just enough to make people question if it’s a masterpiece or an expensive joke. If you’re looking for utility, congrats! this NFT has exactly one function, to remind you that you just spent money on a funny picture that (probably) does nothing.\n\nThis collection was born out of boredom, a pinch of social revenge, and a noble mission to prove that "absurd sells". So get your wallet ready, brace yourself, and welcome to Parodee',
      image: ipfsUri(filename),
      token_id,
      attributes: metaAttrs,
    };

    await fs.ensureDir(path.join(__dirname, "output", "metadata"));
    await fs.writeJson(
      path.join(__dirname, "output", "metadata", `${token_id}.json`),
      metadata,
      { spaces: 2 }
    );

    await checkpoint();
    return metadata; // ← sukses & unik, selesai
  } // end attempts loop
}

// 🚀 Bulk generate (token_id = startId..startId+count-1) — NO edition, NO random IDs
const pLimit = pLimitMod.default || pLimitMod;

async function generateAllNFT(startId, count, contextTags = [], opts = {}) {
  if (currentProgress.isGenerating)
    throw new Error("Generation already running");

  currentProgress.total = count;
  currentProgress.done = 0;
  currentProgress.isGenerating = true;
  currentProgress.isCancelled = false;
  currentProgress.startedAt = Date.now();
  currentProgress.lastError = null;

  // helper custom tokens
  const customDBPath = path.join(__dirname, "utils", "customTokens.json");
  function readCustomTokens() {
    try {
      const db = JSON.parse(fs.readFileSync(customDBPath, "utf-8"));
      return (db.items || []).filter((x) => x.include);
    } catch {
      return [];
    }
  }

  try {
    assertNotCancelled();

    const drawOrder = readDrawOrder();
    const traitRules = fs.existsSync(
      path.join(__dirname, "utils", "traitrules.json")
    )
      ? JSON.parse(
          fs.readFileSync(
            path.join(__dirname, "utils", "traitrules.json"),
            "utf-8"
          )
        )
      : {};
    const fileIndex = await buildFileIndex(
      path.join(__dirname, "layers"),
      drawOrder
    );

    await fs.ensureDir(path.join(__dirname, "output", "images"));
    await fs.ensureDir(path.join(__dirname, "output", "metadata"));
    await fs.emptyDir(path.join(__dirname, "output", "images"));
    await fs.emptyDir(path.join(__dirname, "output", "metadata"));

    const concurrency = Math.max(1, Number(process.env.GEN_CONCURRENCY) || 5);
    const limit = pLimit(concurrency);

    // === NEW: state anti-duplicate untuk sesi ini ===
    const seenCombos = new Set();
    const maxRerolls = Math.max(1, Number(process.env.MAX_REROLLS || 200));
    const contextTagsBase = Array.isArray(contextTags) ? [...contextTags] : [];
    const tagIndex = buildTagIndex(traitRules, fileIndex);

    // === 1) MASUKKAN CUSTOM 1/1 DULUAN (pakai token_id urut) ===
    const customTokens = readCustomTokens();
    const useCount = Math.min(customTokens.length, count);
    for (let i = 0; i < useCount; i++) {
      await checkpoint();

      const item = customTokens[i];
      const token_id = startId + i; // SEKUENSIAL

      const src = path.join(__dirname, item.file.replace(/^\/+/, ""));
      const ext = (path.extname(src) || ".png").toLowerCase();

      // salin ke output/images pakai token_id
      const outImageName = `${token_id}${ext}`;
      const dst = path.join(__dirname, "output", "images", outImageName);

      await fs.copy(src, dst);

      // metadata — kalau GIF tambahkan animation_url
      const meta = {
        name: item.name || `Parodee #${token_id}`,
        token_id,
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

      await fs.writeJson(
        path.join(__dirname, "output", "metadata", `${token_id}.json`),
        meta,
        { spaces: 2 }
      );

      currentProgress.done++;
    }
    // === END CUSTOM 1/1 ===

    // === 2) GENERATE RANDOM UNTUK SISANYA (sekuensial token_id) ===
    const tasks = [];
    for (let i = useCount; i < count; i++) {
      const token_id = startId + i; // 1..N lanjut setelah custom
      tasks.push(
        limit(async () => {
          await checkpoint();
          const baseTags = Array.isArray(contextTagsBase)
            ? [...contextTagsBase]
            : [];
          await generateOneNFT(token_id, baseTags, traitRules, fileIndex, {
            ...opts,
            seenCombos,
            maxRerolls,
            contextTagsBase,
            tagIndex,
          });
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
    if (err?.code !== "CANCELLED") {
      console.error("Generate error:", err);
      currentProgress.lastError = String(err?.message || err);
    }
  } finally {
    currentProgress.isGenerating = false;
  }
}

module.exports = {
  generateOneNFT,
  generateAllNFT,
  getProgress,
  cancelGenerate,
  buildFileIndex,
  readDrawOrder,
  buildTagIndex,
};
