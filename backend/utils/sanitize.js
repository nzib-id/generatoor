function sanitize(name) {
  return name
    .toLowerCase()
    .replace(/[’‘“”]/g, "'") // smart quotes → normal quote
    .replace(/[^a-z0-9 _'-]/g, "") // hapus karakter aneh
    .replace(/\s+/g, "_") // spasi → _
    .replace(/_+/g, "_"); // multiple _ jadi satu
}

function beautify(name) {
  return sanitize(name)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase()); // kapitalisasi tiap kata
}

module.exports = {
  sanitize,
  beautify,
};
