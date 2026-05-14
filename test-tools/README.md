# routefolk test tools

Local-only test helpers.

These tools are intended for development sanity checks before applying a ZIP or committing changes. They do not replace manual testing.

## Commands

From the project root:

```bash
node test-tools/check-esm-syntax.mjs
node test-tools/check-stage-form.mjs
```

## What they check

- `check-esm-syntax.mjs` checks syntax for key JavaScript modules.
- `check-stage-form.mjs` imports the stage form and renders a sample edit form, catching missing helper imports such as `attr()` and `boolAttr()`.

Keep this folder local unless you decide to make test tooling part of the public repo.
