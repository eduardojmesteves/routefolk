# routefolk — GPX geometry backfill package

This package contains local-only maintenance tooling for backfilling cached GPX geometry on older `gpx_tracks` rows.

The files in `tools/` and `docs/` are intended for local/admin use. They should stay ignored by Git if your production repository is meant to remain static-app-only.

## What this package adds

- `tools/backfill-gpx-geometry.mjs`
- `docs/GPX_GEOMETRY_BACKFILL.md`
- `docs/README.md`
- `docs/FILES_MANIFEST.json`

No app runtime files are changed by this package.

## Git recommendation

Do not commit this local maintenance package unless you explicitly decide to keep admin tooling in the repo.

If committed anyway:

```bash
git commit -m "chore(gpx): add cached geometry backfill tooling"
```
