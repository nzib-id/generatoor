const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

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

// List all trait folders
app.get("/api/traits", (req, res) => {
  const traitsDir = path.join(__dirname, "layers");
  const folders = fs
    .readdirSync(traitsDir)
    .filter((file) => fs.statSync(path.join(traitsDir, file)).isDirectory());
  res.json({ traits: folders });
});

// Get list of files from specific trait
app.get("/api/layers/:trait", (req, res) => {
  const trait = req.params.trait;
  const folderPath = path.join(__dirname, "layers", trait);

  try {
    const hasSubfolders = fs
      .readdirSync(folderPath)
      .some((name) => fs.statSync(path.join(folderPath, name)).isDirectory());

    let files = [];

    if (hasSubfolders) {
      const subfolders = fs
        .readdirSync(folderPath)
        .filter((name) =>
          fs.statSync(path.join(folderPath, name)).isDirectory()
        );

      subfolders.forEach((sub) => {
        const subPath = path.join(folderPath, sub);
        const subFiles = fs
          .readdirSync(subPath)
          .filter((file) => file.endsWith(".png"))
          .map((file) => `${sub}/${file}`);
        files = files.concat(subFiles);
      });
    } else {
      files = fs
        .readdirSync(folderPath)
        .filter((file) => file.endsWith(".png"));
    }

    res.json({ files });
  } catch (err) {
    res.status(404).json({ error: `Trait folder '${trait}' not found.` });
  }
});

// Save custom layer order
app.post("/api/layer-order", (req, res) => {
  const { order } = req.body;

  if (!Array.isArray(order)) {
    return res.status(400).json({ error: "Invalid format" });
  }

  try {
    fs.writeFileSync(
      path.join(__dirname, "utils", "layerOrder.json"),
      JSON.stringify(order, null, 2)
    );
    res.json({ message: "Layer order saved!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save order" });
  }
});

// Test ping
app.get("/api/ping", (req, res) => {
  res.json({ message: "🧠 Parodee Generator API is running!" });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
