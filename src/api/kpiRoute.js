import { aggregateLiveAccounts } from '../ingest/liveAccounts.js';
import snapshots from '../../data/snapshots/daily.json' with { type: 'json' };

// Active Accounts KPI response. Never labels partial upstream data 'live'
// (KAN-213): state is computed from pull completeness, and degraded responses
// carry snapshot provenance so both UI surfaces can show source, observation
// date, and staleness adjacent to the number.
export function activeAccountsResponse(pulls, now = new Date()) {
  const result = aggregateLiveAccounts(pulls, { snapshots, now });
  return {
    kpi: 'active_accounts',
    value: result.value,
    state: result.state,
    source: result.source,
    observedAt: result.observedAt,
    observationDate: result.observationDate,
    freshness: result.freshness,
    snapshot: result.snapshot,
    upstreams: result.upstreams,
    issues: result.issues,
  };
}
