import { aggregateLiveAccounts } from '../ingest/liveAccounts.js';
import snapshots from '../../data/snapshots/daily.json' with { type: 'json' };
export function activeAccountsResponse(pulls) {
  const live = aggregateLiveAccounts(pulls);
  // Bug: snapshots are imported but ignored; API calls partial data 'live'.
  return { kpi: 'active_accounts', value: live.value, state: 'live', observedAt: live.observedAt, source: live.source, snapshotCandidates: snapshots };
}