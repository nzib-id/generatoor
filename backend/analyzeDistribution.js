const fs = require("fs");
const path = require("path");

const METADATA_DIR = path.join(__dirname, "output", "metadata");
const RULES_PATH = path.join(__dirname, "utils", "traitrules.json");

const traitCount = {};
const traitWeightMap = JSON.parse(fs.readFileSync(RULES_PATH, "utf-8")).weights;

// 🔁 Baca semua metadata
const files = fs.readdirSync(METADATA_DIR).filter((f) => f.endsWith(".json"));
const totalGenerated = files.length;

// Patch: Simpan context per attribute (misal: trait_type = "Head", value = "male - alien")
// Format: traitKey = trait_type + "__" + context
function parseTrait(attr) {
  // Misal "Male - Alien" atau cuma "Alien"
  const mainType = attr.trait_type.toLowerCase();
  const val = attr.value.toLowerCase();

  // Cek ada context (misal: "male - alien")
  if (val.includes(" - ")) {
    const [context, value] = val.split(" - ").map((x) => x.trim());
    return {
      traitKey: `${mainType}__${context}`,
      value,
      displayType: mainType,
      displayContext: context,
    };
  } else {
    return {
      traitKey: `${mainType}__`,
      value: val,
      displayType: mainType,
      displayContext: "",
    };
  }
}

for (const file of files) {
  const data = JSON.parse(
    fs.readFileSync(path.join(METADATA_DIR, file), "utf-8")
  );
  for (const attr of data.attributes) {
    const { traitKey, value } = parseTrait(attr);

    if (!traitCount[traitKey]) traitCount[traitKey] = {};
    if (!traitCount[traitKey][value]) traitCount[traitKey][value] = 0;

    traitCount[traitKey][value]++;
  }
}

// 🔍 Print hasil
for (const traitKey in traitCount) {
  const [displayType, displayContext] = traitKey.split("__");
  let title = `🧠 Trait: ${displayType}`;
  if (displayContext) title += ` [${displayContext}]`;
  console.log(`\n${title}`);

  const weights = traitWeightMap?.[traitKey] || {};
  const totalTraitWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  for (const value in traitCount[traitKey]) {
    const actual = traitCount[traitKey][value];

    // Cari weight, **case-insensitive**
    let rawWeight = Object.keys(weights).find((w) => w.toLowerCase() === value);
    const weight = rawWeight ? weights[rawWeight] : 0;

    if (weight === 0 || totalTraitWeight === 0) {
      console.log(`  - ${value}: ${actual}x (no weight set)`);
      continue;
    }

    const expected = (totalGenerated * weight) / totalTraitWeight;
    const errorPercent = Math.abs((actual - expected) / expected) * 100;

    console.log(
      `  - ${value}: ${actual}x (expected ~${expected.toFixed(
        2
      )}), error = ${errorPercent.toFixed(2)}%`
    );
  }
}
