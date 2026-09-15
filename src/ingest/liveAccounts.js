export function aggregateLiveAccounts(pulls) {
  // Current defect: sum whatever returned; no completeness contract or dedupe.
  return { value: pulls.filter(p => p.connected).reduce((n,p) => n + p.count, 0), source: 'live', observedAt: new Date().toISOString(), upstreams: pulls };
}
export const requiredUpstreams = ['crm','billing','identity'];