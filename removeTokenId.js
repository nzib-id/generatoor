const fs = require("fs");
const path = require("path");

const metadataDir = path.join(__dirname, "backend", "output", "metadata"); // ganti sesuai lokasi folder metadata

fs.readdirSync(metadataDir).forEach((file) => {
  if (!file.endsWith(".json")) return; // cuma file JSON

  const filePath = path.join(metadataDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  // hapus token_id kalau ada
  if ("token_id" in data) {
    delete data.token_id;
    console.log(`Hapus token_id di ${file}`);
  }

  // save ulang
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
});

console.log("✅ Semua token_id sudah dihapus.");
