# CJS to ESM Migration

## Goal

Convert the entire project from CommonJS to ES modules. All source files use `import`/`export` syntax. `"type": "module"` in `package.json` makes every `.js` file ESM by default.

## Changes

### package.json

Add `"type": "module"`.

### File rename

`.eleventy.js` → `eleventy.config.js`. Eleventy 3.x discovers this name automatically. No script changes needed.

### Files to convert

All 18 files converted in-place — no renames except the config:

| File | Notes |
|---|---|
| `eleventy.config.js` (was `.eleventy.js`) | `require` → `import`, `module.exports = fn` → `export default fn` |
| `src/helpers/utils.js` | `require` → `import`, `exports.x` → `export` |
| `src/helpers/basesPlugin.js` | `require` → `import`, `module.exports` → `export` |
| `src/helpers/constants.js` | `exports.x` → `export const` |
| `src/helpers/filetreeUtils.js` | `exports.x` → named exports |
| `src/helpers/linkUtils.js` | `exports.x` → named exports |
| `src/helpers/userSetup.js` | `exports.x` → named exports |
| `src/helpers/userUtils.js` | `exports.x` → named exports |
| `src/helpers/bases-engine/index.js` | `require` → `import`, `module.exports` → `export` |
| `src/helpers/bases-engine/exprParser.js` | `require` → `import`, `module.exports` → `export` |
| `src/helpers/bases-engine/exprEval.js` | `require` → `import`, `module.exports` → `export` |
| `src/helpers/bases-engine/queryEngine.js` | `require` → `import`, `module.exports` → `export` |
| `src/helpers/bases-engine/views.js` | `module.exports` → named exports |
| `src/site/normalize-favicon.js` | `require` → `import` |
| `src/site/get-theme.js` | `require` → `import` |
| `src/site/_data/dynamics.js` | `require` → `import`, `module.exports` → `export default` |
| `src/site/_data/eleventyComputed.js` | `require` → `import`, `module.exports` → `export default` |
| `src/site/_data/meta.js` | `require` → `import`, `module.exports` → `export default` |

### Mechanics

**Imports:**
- `const x = require("pkg")` → `import x from "pkg"`
- `const { a, b } = require("pkg")` → `import { a, b } from "pkg"`
- Internal imports require explicit `.js` extensions: `import { x } from "./utils.js"`

**Exports:**
- `module.exports = fn` → `export default fn`
- `module.exports = { a, b }` → `export { a, b }` or individual `export`s
- `exports.x = y` → `export { x }` or `export function x` / `export const x`

**Special cases:**
- `src/helpers/__tests__/yamlEscape.test.js` uses `require.resolve()` to load js-yaml as bundled inside gray-matter. Replace with `createRequire`:
  ```js
  import { createRequire } from "node:module";
  const require = createRequire(import.meta.url);
  const jsYaml = require(require.resolve("js-yaml", { paths: [require.resolve("gray-matter")] }));
  ```
- No `__dirname`/`__filename` usage found — no `import.meta.url` workarounds needed elsewhere.

### What does not change

- All file names stay `.js` (except `.eleventy.js` → `eleventy.config.js`)
- Test files in `bases-engine/__tests__/` already use `import` — no changes needed
- Vitest handles ESM natively — no config changes needed
- Nunjucks templates, SCSS, npm scripts — untouched
