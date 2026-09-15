import { stateLabel, provenanceText } from './kpiProvenance.js';

export function OverviewKpiCard(model) {
  const value = model?.value ?? '—';
  const state = model?.state ?? 'unavailable';
  // State badge and provenance (source, observation date, staleness) render
  // adjacent to the value as visible text — not hover tooltips (KAN-213).
  return `<section aria-label="Active Accounts"><h2>Active Accounts</h2><p class="kpi-line"><strong>${value}</strong> <span class="state-badge state-${state}">${stateLabel(model)}</span> <span class="kpi-provenance">${provenanceText(model)}</span></p></section>`;
}
