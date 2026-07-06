---
title: Docs site maintenance
description: Run, edit, validate, and build the embedded Astro documentation site that now lives inside the repository root.
order: 11
category: Reference
summary: The docs app is a small static Astro site that consumes shared presentation from `zuedocs`.
---

## Local development

Install dependencies and start Astro:

```bash
npm install
npm run docs:dev
```

Astro serves the docs locally, usually at `http://localhost:4321`.

## Files to edit

The docs site is intentionally small:

```text
src/data/docs.ts
src/content.config.ts
src/pages/index.astro
src/pages/docs/index.astro
src/pages/docs/[...slug].astro
src/content/docs/*.md
```

For most content changes, edit markdown in `src/content/docs` first.

## Validation

Run:

```bash
npm run docs:check
npm run docs:build
```

`docs:check` validates Astro routes and content typing. `docs:build` verifies the static output.

## Output directory

The docs build writes to `docs-dist/`. This is separate from the package `dist/` directory so Astro output never collides with the CLI and library build artifacts.

## Deployment

The site is deployment-ready as static output. A host only needs:

- build command: `npm run docs:build`
- output directory: `docs-dist`

Domain wiring and platform-specific deployment steps stay outside this repository implementation pass.
