export function OverviewKpiCard(model) {
  return `<section aria-label="Active Accounts"><h2>Active Accounts</h2><strong>${model.value ?? '—'}</strong><span class="live-dot">Live</span></section>`;
}
// Existing UI only implies freshness via hover tooltip; source/date are not adjacent.