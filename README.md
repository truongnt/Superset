# Superset Plugin Scaffold

This repository is a starter project for building a custom Apache Superset chart plugin with TypeScript.

## Main structure

- `src/plugin`: metadata, control panel, query builder, transform props
- `src/HelloWorldChart.tsx`: sample React chart component
- `src/types.ts`: plugin types

## Environment

- Node.js 20.x
- npm 10.x

The current machine does not have `node` or `npm` installed yet, so the scaffold is ready but dependencies have not been installed and the project has not been built.

## Start development

```bash
npm install
npm run build
npm run dev
```

## Link the plugin into a local Superset checkout

From the `superset-frontend` directory in your Superset source tree:

```bash
npm install --save ../../Superset
```

Then open `superset-frontend/src/visualizations/presets/MainPreset.js` and add:

```js
import { HelloWorldChartPlugin } from 'superset-plugin-chart-hello-world';
```

Register the plugin in the `plugins` array:

```js
new HelloWorldChartPlugin().configure({ key: 'hello-world' }),
```

## Suggested next steps

- replace `src/HelloWorldChart.tsx` with a real chart library such as ECharts or AntV
- add more controls in `src/plugin/controlPanel.ts`
- extend `src/plugin/buildQuery.ts` when you need more complex queries
- update `src/plugin/transformProps.ts` to map query results into chart props
