# Services

This directory contains independently deployable server-side services. It is
separate from the static PWA modules served by Cloudflare Pages.

## API

`api/` owns its dependencies, Docker build, and source so server-side code is
not mixed into the repository root or browser application.
