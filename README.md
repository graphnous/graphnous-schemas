# Graphnous Schemas

Shared JSON Schemas and API contracts for the Graphnous platform.

## Contents

- API schemas
- Graph scan schemas
- OpenAPI definitions

These schemas are the canonical contracts shared between Graphnous services and clients.
## Published schemas

On every push to `main`, the [Pages workflow](.github/workflows/pages.yml) validates the schemas and publishes them to GitHub Pages:

- JSON Schemas under `/schema/`, matching the path of their `$id` (for example `/schema/scan/scan-result.schema.json`)
- OpenAPI definitions under `/openapi/`, as the source YAML, bundled JSON and rendered HTML docs

Run `npm run build:site` to build the same site into `_site/` locally.

GitHub Pages must be enabled with **Settings → Pages → Source: GitHub Actions**.
