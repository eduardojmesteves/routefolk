# PWA Release Checklist

Run this before every deployment that changes shell assets.

## 1. Update shell assets
- Add any new JS/CSS files to sw.js SHELL_ASSETS

## 2. Bump the cache
- Change the CACHE constant in sw.js to a new version string
- Format: `routefolk-shell-vNNN-description`

## 3. Run static tests
```
npm run test:static
```

## 4. Run unit tests
```
npm run test:unit
```

## 5. Run E2E smoke tests
```
npm run test:e2e
```

## 6. Test app refresh
- Open app in browser
- Check DevTools > Application > Service Workers
- Confirm new SW version is active

## 7. Test installed PWA update
- Install the app (Add to Home Screen)
- Deploy a change
- Reopen — confirm the update prompt appears and the app refreshes

## 8. Test offline shell
- DevTools > Network > Offline
- Reload — confirm the app shell still loads

## Tools
- `node tools/generate-sw-assets.js` — check for cache drift before a release
