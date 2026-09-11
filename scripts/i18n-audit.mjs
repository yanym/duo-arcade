import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const clientRoot = join(root, "apps/client");
const localizationFile = readFileSync(join(clientRoot, "src/i18n/index.ts"), "utf8");
const localizationSource = localizationFile.split("const DYNAMIC_TRANSLATIONS")[0];
const translations = new Map();

for (const match of localizationSource.matchAll(/"((?:\\.|[^"\\])*)"\s*:\s*"((?:\\.|[^"\\])*)"/g)) {
  const key = JSON.parse(`"${match[1]}"`);
  const value = JSON.parse(`"${match[2]}"`);
  assert.equal(translations.has(key), false, `duplicate English translation key: ${key}`);
  translations.set(key, value);
}

const dynamicPatterns = new Set();
for (const match of localizationFile.matchAll(/\[\s*\/((?:\\.|[^/])+)\/[dgimsuvy]*\s*,/g)) {
  assert.equal(dynamicPatterns.has(match[1]), false, `duplicate dynamic English translation pattern: /${match[1]}/`);
  dynamicPatterns.add(match[1]);
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "i18n" ? [] : sourceFiles(path);
    return entry.isFile() && /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : [];
  });
}

const intentionalAutonyms = new Set(["中文"]);
const missing = [];
let checked = 0;
for (const file of [...sourceFiles(join(clientRoot, "app")), ...sourceFiles(join(clientRoot, "src"))]) {
  const source = readFileSync(file, "utf8");
  for (const regex of [/"((?:\\.|[^"\\])*)"/g, /'((?:\\.|[^'\\])*)'/g]) {
    for (const match of source.matchAll(regex)) {
      const value = regex.source.startsWith('"') ? JSON.parse(match[0]) : match[1];
      if (!/[一-龥]/.test(value) || intentionalAutonyms.has(value)) continue;
      checked += 1;
      const translated = translations.get(value);
      if (translated === undefined || /[一-龥]/.test(translated)) missing.push({ file, value });
    }
  }
  // JSX text is not quoted, and may be split around expressions such as
  // <Text>第 {round} 轮</Text>. Parse it so template literals and source code
  // surrounding JSX cannot be mistaken for visible copy.
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxText(node)) {
      const value = node.text.trim();
      if (/[一-龥]/.test(value) && !intentionalAutonyms.has(value)) {
        checked += 1;
        const translated = translations.get(value);
        if (translated === undefined || /[一-龥]/.test(translated)) missing.push({ file, value });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

assert.deepEqual(missing, [], `untranslated static client strings:\n${missing.map(({ file, value }) => `${file}: ${value}`).join("\n")}`);
console.log(JSON.stringify({ ok: true, checkedStaticStrings: checked, englishEntries: translations.size, dynamicPatterns: dynamicPatterns.size }));
