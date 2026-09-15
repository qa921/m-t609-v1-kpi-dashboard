export function RegionKpiDetail(model, region) {
  return `<article><h1>${region} Active Accounts</h1><output>${model.value ?? 'Unavailable'}</output><small title="${model.observedAt || ''}">Current</small></article>`;
}
// Existing detail page hides provenance in title text and labels every response Current.