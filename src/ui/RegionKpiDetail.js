import { stateLabel, provenanceText } from './kpiProvenance.js';

export function RegionKpiDetail(model, region) {
  const value = model?.value ?? 'Unavailable';
  const state = model?.state ?? 'unavailable';
  // Same adjacent provenance as the overview card: state badge, snapshot id or
  // live source, observation date, and staleness next to the number.
  return `<article><h1>${region} Active Accounts</h1><p class="kpi-line"><output>${value}</output> <span class="state-badge state-${state}">${stateLabel(model)}</span> <span class="kpi-provenance">${provenanceText(model)}</span></p></article>`;
}
