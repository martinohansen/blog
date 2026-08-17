import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";

const VERSION_TOKEN = "__ASSET_VERSION__";
const [templatePath, outputPath, assetVersion] = process.argv.slice(2);

if (!templatePath || !outputPath || !assetVersion) {
  throw new Error(
    "Usage: render-versioned-html.mjs TEMPLATE OUTPUT COMMIT_SHA",
  );
}

if (!/^[0-9a-f]{7,64}$/i.test(assetVersion)) {
  throw new Error(`Invalid commit SHA: ${assetVersion}`);
}

const template = readFileSync(templatePath, "utf8");
if (!template.includes(VERSION_TOKEN)) {
  throw new Error(`${templatePath} does not contain ${VERSION_TOKEN}`);
}

const rendered = template.replaceAll(VERSION_TOKEN, assetVersion);
const temporaryPath = `${outputPath}.${process.pid}.tmp`;

try {
  writeFileSync(temporaryPath, rendered);
  renameSync(temporaryPath, outputPath);
} finally {
  if (existsSync(temporaryPath)) {
    rmSync(temporaryPath);
  }
}

console.log(`Generated ${outputPath} for commit ${assetVersion}`);
