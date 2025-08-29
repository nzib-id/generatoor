const fs = require("fs");
const path = require("path");

const metaDir = path.join(__dirname, "output", "metadata");

function buildKey(attrs) {
  // bikin signature stabil: trait_type=value|...
  // sort biar urutannya konsisten
  return attrs
    .map((a) => `${a.trait_type}=${a.value}`)
    .sort()
    .join("|");
}

(async () => {
  const files = fs.readdirSync(metaDir).filter((f) => f.endsWith(".json"));
  const seen = new Map(); // key -> token_id pertama
  const duplicates = [];

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(metaDir, file), "utf-8"));
    const tokenId = data.token_id;
    const key = buildKey(data.attributes);

    if (seen.has(key)) {
      duplicates.push({
        token_id: tokenId,
        duplicateOf: seen.get(key),
        key,
      });
    } else {
      seen.set(key, tokenId);
    }
  }

  if (duplicates.length === 0) {
    console.log("✅ Tidak ada duplikat.");
  } else {
    console.log(`❌ Ketemu ${duplicates.length} duplikat:\n`);
    duplicates.forEach((d) =>
      console.log(`Token #${d.token_id} duplikat dengan #${d.duplicateOf}`)
    );
  }
})();
