# FMCG Plant EMS

An energy management system (EMS) for **FMCG Manufacturing Plant – Maharashtra**, built with React, TypeScript and Vite.

> **All data is simulated.** The app generates 2 years of plant data (2 Nov 2024 to 1 Nov 2026) in the browser from a fixed seed, so every load shows the same numbers. It has no connection to PLCs, SCADA, meters or any backend.

## What's inside

- Login with a profile dropdown. Each profile only sees its own modules:
  - **Plant Head:** everything, with full edit and admin rights.
  - **Energy Manager:** every module except Administration.
  - **Utility Manager:** Utilities, plus alerts for utilities only.
  - **Production Manager:** production lines, Energy vs Production, Benchmarking, Energy Intelligence, plus alerts for production only.
  - **Maintenance Lead:** alerts, production and utility drill-downs, electrical, meters, assets and data quality.
  - **Sustainability Head:** carbon, targets, projects and reports.
  - **CFO:** energy cost, targets, projects and reports.
  - **System Administrator:** administration, meters, assets, data quality and integration.

  Access rules are in `PERSONAS` in `src/store.tsx` (`pages`, `dept`, `alertDepts`, `canEdit`, `canAdmin`).
- A one-row header with a calendar date-range picker (with presets), department, shift, product category and SKU filters, a notification bell, full screen, refresh and the profile menu.
- Dashboards:
  - Executive and plant overview, energy hierarchy and departments.
  - Production lines, with drill-down from plant to line to machine.
  - Utilities, electrical infrastructure, buildings and distribution hubs.
  - Energy Intelligence (analytics, insights and losses), and alerts with a notification bell.
  - Cost, carbon, targets and baselines, improvement projects and reports.
  - Meter master, asset master, data quality and energy balance, integration and admin.
- Collapsible sidebar, an app-only full-screen mode, a dark blue theme, phone-friendly layout, and CSV export on tables.
- Settings changed in the app (tariffs, emission factors, targets, alert status, projects) are saved in the browser's local storage. **Administration → Reset demo configuration** clears them (System Administrator and Energy Manager personas).

## Requirements

- Node.js 18.18 or newer. Node 20 is recommended, and an `.nvmrc` is included.
- npm 9 or newer.

## Run locally

```bash
npm ci          # install the exact versions from package-lock.json
npm run dev     # start the dev server at http://localhost:5173
```

## Build

```bash
npm run build     # type-check, then build into dist/
npm run preview   # serve dist/ at http://localhost:4173 to check the build
```

`dist/` holds just two files: `index.html`, with all JavaScript and CSS inlined, and `favicon.svg`. Any static web host can serve them. You can also **double-click `dist/index.html` to open it straight from disk** in Chrome, Edge, Firefox or Safari, with no server needed.

The JavaScript is inlined because browsers block separate script files on pages opened from disk (`file://`). That is why a normal Vite build shows a blank page when opened that way.

The app uses hash routes (`#/exec`, `#/intelligence/insights` and so on) and relative asset paths (`base: './'`). Because of this, it works from a domain root, from a sub-folder such as `https://example.com/ems/`, and from GitHub Pages, without server rewrite rules. The configs below still include an `index.html` fallback, to be safe.

## Deploy

| Target | Files used | How |
|---|---|---|
| Any static host (S3, Azure Static Web Apps, IIS, Apache, a shared server) | `dist/` | Run `npm run build`, then upload the **contents** of `dist/`. |
| Docker / nginx | `Dockerfile`, `nginx.conf`, `docker-compose.yml` | Run `docker compose up -d --build`, then open http://localhost:8080. |
| Vercel | `vercel.json` | Import the repo in Vercel. The settings are picked up automatically. Or run `npx vercel --prod`. |
| Netlify | `netlify.toml` | Import the repo in Netlify, or run `npx netlify deploy --prod --dir dist` after `npm run build`. |
| GitHub Pages | `.github/workflows/deploy-pages.yml` | Push to `main`. In the repo, open **Settings → Pages → Source** and choose **GitHub Actions**. |
| No server at all | `dist/index.html` | Run `npm run build`, then open the file directly, or copy or email it. |

### Docker without compose

```bash
docker build -t fmcg-plant-ems .
docker run -d -p 8080:80 --name fmcg-plant-ems fmcg-plant-ems
```

The image builds the app in a Node 20 stage, then serves it from `nginx:1.27-alpine`. The nginx setup has gzip, and `no-cache` on `index.html`, so new releases show up right away.

### Continuous integration

`.github/workflows/ci.yml` installs, type-checks and builds the app on every pull request.

## Project structure

```
index.html                 App shell (fonts, favicon, root element)
public/favicon.svg         Icon, copied as-is into the build
src/
  main.tsx                 Entry point
  App.tsx                  Layout, routes, sidebar collapse and full screen
  store.tsx                Personas, filters, settings and the hash router
  styles.css               Dark navy theme and responsive layout
  components/
    Shell.tsx              Top bar, calendar picker, notifications and sidebar
    ui.tsx                 Panels, KPI cards, tables with CSV export, charts and modal
  data/
    assets.ts              Plant register: lines, machines, SKUs, utilities, transformers, DGs and solar
    sim.ts                 Deterministic 2-year simulation (daily data, with hourly and shift detail on demand)
    engine.ts              Aggregation, cost (ToD tariff, demand, PF, DG, solar), carbon, baselines and EnPI
    meters.ts              Meter master, register readings and reconciliation of the meter hierarchy
    insights.ts            Rule-based insights, alert generation and default projects
    rng.ts                 Seeded random number generator
  pages/                   One file per area (Executive, Plant, Production, Utilities, Infra,
                           Intelligence, Analytics, Finance, Config, Login)
```

## Changing the data

- Plant layout, lines, machines and ratings: `src/data/assets.ts`.
- The simulation period, seed and simulated events (an oven SEC ramp, a compressor and chiller drop in efficiency, an APFC fault, a meter outage, the Diwali shutdown, a VFD project and others): `src/data/sim.ts`.
- Default tariffs, emission factors and targets: `DEFAULT_CONFIG` in `src/data/engine.ts`. Users with edit rights can also change these in the app.

To connect real data later, replace the arrays that `sim.ts` exports with data loaded from your historian or meter API. Keep the same shapes, and the engines and pages will work unchanged.

## Notes

- Fonts load from Google Fonts. If the network is offline, the app falls back to system fonts.
- The production bundle is about 870 KB (about 250 KB gzipped), because the charts and the simulation run in the browser.
- Browser support: current Chrome, Edge, Firefox and Safari.
