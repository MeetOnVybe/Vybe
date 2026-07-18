import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const sourceFiles = await walk(path.join(root, "src"));
const sourceTexts = [];
for (const file of sourceFiles) {
  const text = await readFile(file, "utf8");
  sourceTexts.push(text);
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${file} must parse`);

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === "useVybeStore" &&
      node.arguments[0]
    ) {
      const selector = node.arguments[0].getText(sourceFile).replace(/\s+/g, " ");
      assert.doesNotMatch(
        selector,
        /\?\?\s*\[|\|\|\s*\[|\.filter\(|\.map\(|\.slice\(/,
        `${file} contains an allocating Zustand selector: ${selector}`,
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}


const sourceText = sourceTexts.join("\n");
const migrationDirectory = path.join(root, "supabase", "migrations");
const migrationSql = (
  await Promise.all(
    (await readdir(migrationDirectory))
      .filter((name) => name.endsWith(".sql"))
      .map((name) => readFile(path.join(migrationDirectory, name), "utf8")),
  )
).join("\n").toLowerCase();
const rpcNames = new Set(
  [...sourceText.matchAll(/\.rpc\(\s*["']([^"']+)["']/g)].map((match) =>
    match[1].toLowerCase(),
  ),
);
for (const rpcName of rpcNames) {
  const escaped = rpcName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    migrationSql,
    new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${escaped}\\s*\\(`),
    `Frontend RPC ${rpcName} must exist in the migration chain`,
  );
}

const invokedFunctions = new Set(
  [...sourceText.matchAll(/invokeAuthenticatedFunction<[^>]*>\(\s*[^,]+,\s*["']([^"']+)["']/g)].map(
    (match) => match[1],
  ),
);
for (const functionName of invokedFunctions) {
  const functionEntry = path.join(root, "supabase", "functions", functionName, "index.ts");
  await readFile(functionEntry, "utf8");
}

const edgePath = path.join(
  root,
  "supabase",
  "functions",
  "moderate-content",
  "index.ts",
);
const edgeSource = await readFile(edgePath, "utf8");
const edgeAst = ts.createSourceFile(
  edgePath,
  edgeSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
assert.equal(edgeAst.parseDiagnostics.length, 0, "Moderation Edge Function must parse");

function checkDuplicateProperties(node) {
  if (ts.isObjectLiteralExpression(node)) {
    const names = new Set();
    for (const property of node.properties) {
      if (
        (ts.isPropertyAssignment(property) ||
          ts.isShorthandPropertyAssignment(property)) &&
        property.name
      ) {
        const name = property.name.getText(edgeAst);
        assert.ok(!names.has(name), `Duplicate Edge Function object property: ${name}`);
        names.add(name);
      }
    }
  }
  ts.forEachChild(node, checkDuplicateProperties);
}
checkDuplicateProperties(edgeAst);

const envExample = await readFile(path.join(root, ".env.example"), "utf8");
assert.doesNotMatch(
  envExample,
  /NEXT_PUBLIC_(?:SUPABASE_SERVICE_ROLE_KEY|LIVEKIT_API_SECRET|OPENAI_API_KEY|VIDEO_MODERATION_AGENT_SECRET)/,
  "Server secrets must never be browser-exposed",
);

console.log(
  `✓ Source contract passed: ${sourceFiles.length} TypeScript files, ${rpcNames.size} frontend RPCs backed by migrations, stable Zustand selectors, deployed Edge Function source, and no public secret variables.`,
);
