# Nonverbal IQ

A static, mobile-first IQ test built only from shapes and patterns. Each round has 16 freshly generated
puzzles (progressive matrices, figure series, odd one out) and a 10-minute clock, and ends with an
estimated IQ and a worked solution for every puzzle.

```bash
npm install
npm run dev      # local dev server
npm test         # generator + scoring tests
npm run build    # static build in dist/
```

## Deploying to GitHub Pages

Push to `main` on GitHub, then under **Settings → Pages** set **Source** to **GitHub Actions**.
`.github/workflows/deploy.yml` tests, builds and publishes `dist/`. The Vite `base` is relative, so the
site works from any `https://<user>.github.io/<repo>/` path.

## How it works

- `src/gen/matrix.ts` builds Raven-style 3×3 matrices from rule types (constant, progression, distribute-three,
  arithmetic, XOR/OR/AND/subtract, rotate) on shape, fill, number and position. It rejects puzzles whose rows
  or columns can be read in two ways, and builds the eight options as an I-RAVEN attribute-bisection tree,
  so no feature-frequency shortcut works.
- `src/gen/figural.ts` builds line-overlay matrices (add, subtract, XOR, intersect) and orientation matrices
  (rotation and mirroring).
- `src/gen/series.ts` and `src/gen/odd.ts` build Culture-Fair-style series and classification items.
- `src/gen/round.ts` builds a round deterministically from a seed. Bump `GEN_VERSION` when changing generators.
- `src/scoring.ts` estimates ability with a 3PL IRT model (EAP, normal prior) and maps it to IQ = 100 + 15θ.

Item difficulties come from rule complexity, not from a norm sample, so the score is an estimate.
To calibrate properly, collect anonymous response data and fit the item parameters.
