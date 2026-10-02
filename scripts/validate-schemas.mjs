import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = process.cwd();

const schemaDirectories = [
    path.join(ROOT, "api"),
    path.join(ROOT, "scan"),
    path.join(ROOT, "enhancer")
];

// The schemas are written against JSON Schema draft 2020-12
const ajv = new Ajv2020({
    strict: true,
    // Allows oneOf branches that only list required properties declared
    // elsewhere, as the enhancer manifest does to demand exactly one operator
    strictRequired: false,
    // Allows types such as ["string", "number", "boolean"]
    allowUnionTypes: true,
    allErrors: true
});

addFormats(ajv);

async function findJsonFiles(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...await findJsonFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
            files.push(fullPath)
        }
    }

    return files;
}

const files = [];

for (const directory of schemaDirectories) {
    try {
        files.push(...await findJsonFiles(directory));
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }
}

if (files.length === 0) {
    console.log("No JSON schemas found.");
    process.exit(0);
}

let failed = false;

// Schemas without an $id are known by the URL their path gives them, so
// relative references between files resolve
const BASE_URI = "https://graphnous.dev/schema/";

function reportFailure(relativePath, error) {
    failed = true;

    console.error(`✗ ${relativePath}`);

    if (error instanceof SyntaxError) {
        console.error(`  Invalid JSON: ${error.message}`);
    } else {
        console.error(`  ${error.message}`);
    }

    if (error.errors) {
        for (const validationError of error.errors) {
            console.error(
                `  ${validationError.instancePath || "/"}: ${validationError.message}`
            );
        }
    }
}

// Register every schema first, so each can refer to the others
const schemas = [];

for (const file of files) {
    const relativePath = path.relative(ROOT, file);

    try {
        const schema = JSON.parse(await fs.readFile(file, "utf8"));
        const id = schema.$id ?? new URL(relativePath.split(path.sep).join("/"), BASE_URI).href;

        ajv.addSchema(schema, schema.$id ? undefined : id);
        schemas.push({ relativePath, id });
    } catch (error) {
        reportFailure(relativePath, error);
    }
}

for (const { relativePath, id } of schemas) {
    try {
        ajv.getSchema(id);

        console.log(`✓ ${relativePath}`);
    } catch (error) {
        reportFailure(relativePath, error);
    }
}

if (failed) {
    console.error("\nSchema validation failed.");
    process.exit(1);
}

console.log(`\nValidated ${files.length} schema(s).`);