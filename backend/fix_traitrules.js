// fix_traitrules.js
const fs = require("fs");
const path = require("path");
const { sanitize } = require("./utils/sanitize");
const filePath = path.join(__dirname, "utils", "traitrules.json");

const rules = JSON.parse(fs.readFileSync(filePath, "utf-8"));

const fix = (ruleList = []) =>
  ruleList.map((rule) => ({
    trait: sanitize(rule.trait),
    value: sanitize(rule.value),
    exclude_with: rule.exclude_with?.map((r) => ({
      trait: sanitize(r.trait),
      value: sanitize(r.value),
    })),
    require_with: rule.require_with?.map((r) => ({
      trait: sanitize(r.trait),
      value: sanitize(r.value),
    })),
    always_with: rule.always_with?.map((r) => ({
      trait: sanitize(r.trait),
      value: sanitize(r.value),
    })),
  }));

rules.specific = fix(rules.specific);

fs.writeFileSync(filePath, JSON.stringify(rules, null, 2));
console.log("✅ traitRules.json sanitized!");
