const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const productsDir = path.join(root, "content", "products");
const outputDir = path.join(root, "data");

function parseValue(raw) {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  try { return JSON.parse(value); } catch { return value; }
}

function parseFrontmatter(text) {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const index = line.indexOf(":");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1);
    result[key] = parseValue(value);
  }
  return result;
}

const products = fs.readdirSync(productsDir)
  .filter(file => file.endsWith(".md"))
  .map(file => parseFrontmatter(fs.readFileSync(path.join(productsDir, file), "utf8")))
  .filter(product => product.published !== false)
  .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "products.json"), JSON.stringify(products, null, 2));
console.log(`Built ${products.length} products.`);
