# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is **not** the Apache Superset core codebase — it's a collection of custom Apache Superset chart plugins built for the ECDS Vietnam project, meant to be dropped into a separate Superset source checkout. There are four production plugins plus one scaffold:

- `ecds-html-widget/` — embeds custom HTML/JS in an iframe, bound to dataset rows (`ecds_html_widget`)
- `ecds-point-map/` — lat/lng bubble or pie markers with timelapse (`ecds_point_map`)
- `ecds-region-map/` — choropleth map with GeoJSON boundaries, hierarchical drilldown (`ecds_region_map`) — the most complex plugin; read `ecds-region-map/NOTES.md` before touching it
- `ecds-data-table/` — filterable/sortable data table with heatmap and Excel export (`ecds_data_table`)
- `plugin/` — the stock Superset "Hello World" scaffold, kept as a build-tooling reference only (real babel build with `lib`/`esm` output), not a production plugin

Each of the four production plugins is an independent npm package (own `package.json`, no shared build). Their own `npm run build` script literally does nothing (`echo 'Built by Superset frontend webpack'`) — **these plugins are only ever built as part of a Superset frontend webpack build**, not standalone. `main`/`module`/`types` all point at `src/index.ts` directly (no `lib`/`esm` output like the scaffold in `plugin/` produces).

## Development workflow

There is no local build/test/lint tooling in this repo for the production plugins — they compile only inside a Superset frontend checkout. Workflow:

1. From the target plugin's directory, no build is runnable standalone; instead link it into a Superset checkout:
   ```bash
   # from superset-frontend/ in the Superset source tree
   npm install --save ../../<plugin-directory>
   ```
2. Register the plugin in `superset-frontend/src/visualizations/presets/MainPreset.js`:
   ```js
   import { EcdsRegionMapPlugin } from 'superset-plugin-chart-ecds-region-map';
   new EcdsRegionMapPlugin().configure({ key: 'ecds_region_map' }),
   ```
3. Build/run Superset's own frontend dev server or Docker build. Per `ecds-region-map/NOTES.md`: when plugin source changes and Superset runs via Docker, rebuild with `docker compose build --no-cache superset` — a normal `--build` will keep the stale layer cache.

Requirements noted in `README.md`: Node.js 20.x, npm 10.x. `.npmrc` sets `legacy-peer-deps=true`.

The `plugin/` scaffold is the exception — it has a real standalone build (`npm run build`, `npm run dev` for babel watch mode, `npm run clean`) since it's just the template, not shipped.

## Architecture shared across all four plugins

Every plugin follows the same file layout (see `DEV_NOTES.md` for the full rationale):

```
src/
  index.ts                 # exports the plugin class
  <ComponentName>.tsx       # React component that renders the chart
  types.ts                  # TS interfaces (props, form data)
  plugin/
    index.ts               # ChartPlugin registration (metadata, thumbnail, key)
    buildQuery.ts           # builds the SQL query context sent to the Superset backend
    controlPanel.tsx        # control panel config (the left-side settings UI)
    transformProps.ts       # ChartProps -> component props
```

`ecds-point-map` and `ecds-region-map` additionally have `plugin/DatasetColumnSelect.tsx`, a shared control for picking a column from a secondary dataset.

### Non-obvious rules that cause silent bugs (from `DEV_NOTES.md`)

These are load-bearing — violating them causes controls to silently disappear or values to silently vanish, with no error:

- **Built-in controls** (`metrics`, `groupby`, `adhoc_filters`, etc.) must be customized with `override:`, never `config:`. Using `config:` on a built-in control means Superset won't recognize it and it won't render.
- **Any control with a `visibility` toggle needs `resetOnHide: false`**, or Superset wipes its value whenever it's hidden (e.g. toggling raw ↔ aggregate query mode).
- The built-in `metrics` control has a required validator by default — set `validators: []` in its `override` when metrics are optional (e.g. raw-record mode).
- **`formDataOverrides` must call `getStandardizedControls().popAllMetrics()` / `.popAllColumns()`** rather than just returning `formData` unchanged — otherwise the Superset pipeline strips all custom fields (color pickers, heatmap settings, page size, etc.) out of `formData` entirely.
- **In `transformProps.ts`, read custom control values from `chartProps.rawFormData`, not `chartProps.formData`.** `formData` has already been through `formDataOverrides`/schema stripping; `rawFormData` is the untouched original. Only `metrics`/`groupby` should come from `formData` (since those go through `getStandardizedControls()`).
- **Superset passes `formData` into `transformProps` in camelCase**, not the snake_case used in the DB/config (`extra_form_data` → `extraFormData`, `region_id_column` → `regionIdColumn`, etc.). Always check camelCase first with snake_case as fallback: `fd.extraFormData ?? fd.extra_form_data`.
- Datetime columns come back from Superset as epoch milliseconds. Detect temporal columns via `coltypes[i] === GenericDataType.Temporal` (from `queriesData[0]`) and format with `getTimeFormatter(TimeFormats.DATABASE_DATETIME)` before handing rows to the component.
- Cell background colors must be set on `<td>` directly, not `<tr>` — `background-color` on `<tr>` doesn't reliably cascade in Superset's Ant Design + CSS-reset context. When combining with heatmap coloring, stash the heatmap color in a `data-heat-bg` attribute so `onMouseLeave` can restore it instead of the plain row color.
- `ColorPickerControl` returns an `{ r, g, b, a }` object, not a hex/CSS string — convert with a small `toRgba()` helper, and read it from `rawFormData`.

See the "Checklist khi tạo plugin mới" at the bottom of `DEV_NOTES.md` before adding a new plugin or a new control.

## ecds-region-map specifics

This plugin is architecturally distinct enough to warrant reading `ecds-region-map/NOTES.md` in full before making changes. Summary:

- **Two datasources**: the primary chart dataset (metric values, queried normally via `buildQuery`) and a secondary map dataset (GeoJSON boundaries + admin hierarchy), fetched once in full via `SupersetClient` (not raw `fetch`, so guest tokens work in embedded dashboards) and then filtered entirely client-side.
- **`MapUnit`** ties the two datasources together: `id` (UUID, used for parent/child drill links via `parent_id`) vs. `code` (province/commune code, used to join against the primary dataset's metric rows) are distinct fields — conflating them is a recurring source of bugs (see the "Bugs đã fix" section in NOTES.md).
- Drilldown state (`drillId`, `drillCode`, `shouldShowAllCommunes`) is driven by 3 `useEffect`s that auto-drill based on active filters, across 7 documented filtering scenarios (no filter / one province / 2+ provinces / one commune / communes within one province / communes across multiple provinces). `lastAutodrillRef` prevents auto-drill from fighting a manual "Back" click.
- Projection is a hand-rolled simple Mercator implementation — deliberately no D3/Leaflet dependency.
- Row limits: 10,000 for the primary datasource query, up to 200,000 for the map dataset fetch.

## Repo-root housekeeping

- `Superset_v1_stable.rar` is a checked-in stable-build archive — leave it alone unless a task explicitly concerns it.
- `assets/` holds README screenshots/gifs; `html_widget_examples/` holds example HTML snippets for the HTML widget plugin.
- `.claude/settings.local.json` currently only pre-allows a few `git` subcommands — nothing else configured.
