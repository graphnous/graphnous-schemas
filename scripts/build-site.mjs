import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "_site");

const schemaDirectories = ["api", "scan", "enhancer"];
const openapiDirectory = "openapi";

// Schemas are published under /schema/ so the site path of each file
// matches its $id (https://graphnous.dev/schema/...)
const SCHEMA_PREFIX = "schema";

async function findFiles(directory, extensions) {
    let entries;
    try {
        entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    }

    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...await findFiles(fullPath, extensions));
        } else if (entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))) {
            files.push(fullPath);
        }
    }

    return files.sort();
}

function toUrlPath(relativePath) {
    return relativePath.split(path.sep).join("/");
}

async function copyInto(source, destination) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
}

function redocly(...args) {
    execFileSync("npx", ["--no-install", "redocly", ...args], { stdio: "inherit" });
}

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

await fs.rm(OUTPUT, { recursive: true, force: true });
await fs.mkdir(OUTPUT, { recursive: true });

// JSON Schemas
const schemaLinks = [];

for (const directory of schemaDirectories) {
    for (const file of await findFiles(path.join(ROOT, directory), [".json"])) {
        const relativePath = path.relative(ROOT, file);
        const sitePath = path.join(SCHEMA_PREFIX, relativePath);

        await copyInto(file, path.join(OUTPUT, sitePath));
        schemaLinks.push(toUrlPath(sitePath));
    }
}

// OpenAPI definitions: the source YAML, a bundled JSON copy and HTML docs
const openapiEntries = [];

for (const file of await findFiles(path.join(ROOT, openapiDirectory), [".yaml", ".yml"])) {
    const relativePath = path.relative(ROOT, file);
    const name = path.basename(file).replace(/\.ya?ml$/, "");
    const siteDirectory = path.join(OUTPUT, openapiDirectory);

    await copyInto(file, path.join(OUTPUT, relativePath));

    redocly("bundle", relativePath, "--ext", "json", "--output", path.join(siteDirectory, `${name}.json`));
    redocly("build-docs", relativePath, "--output", path.join(siteDirectory, `${name}.html`));

    openapiEntries.push({
        name,
        yaml: toUrlPath(relativePath),
        json: `${openapiDirectory}/${name}.json`,
        html: `${openapiDirectory}/${name}.html`
    });
}

// Index page
const listItem = (href, label = href) =>
    `      <li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`;

const index = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Graphnous Schemas</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
      code, a { font-family: ui-monospace, monospace; }
    </style>
  </head>
  <body>
    <h1>Graphnous Schemas</h1>
    <p>Shared JSON Schemas and API contracts for the Graphnous platform.</p>

    <h2>OpenAPI</h2>
    <ul>
${openapiEntries
    .map(({ name, yaml, json, html }) =>
        `      <li>${escapeHtml(name)}: <a href="${html}">docs</a> · <a href="${yaml}">YAML</a> · <a href="${json}">JSON</a></li>`)
    .join("\n")}
    </ul>

    <h2>JSON Schemas</h2>
    <ul>
${schemaLinks.map((link) => listItem(link)).join("\n")}
    </ul>
  </body>
</html>
`;

await fs.writeFile(path.join(OUTPUT, "index.html"), index);

// Serve files as-is, without Jekyll processing
await fs.writeFile(path.join(OUTPUT, ".nojekyll"), "");

console.log(`\nBuilt site with ${schemaLinks.length} schema(s) and ${openapiEntries.length} OpenAPI definition(s) in ${path.relative(ROOT, OUTPUT)}/`);
