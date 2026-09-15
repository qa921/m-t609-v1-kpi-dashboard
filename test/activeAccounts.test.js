// Fixture-driven tests for the Active Accounts state model (KAN-212).
// Cases mirror fixtures/kpi-source-cases.json C01-C20, plus API-level
// regression coverage for KAN-213 (partial data must never return as 'live').
// Run with: npm test (node --test)

import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregateLiveAccounts } from '../src/ingest/liveAccounts.js';
import { activeAccountsResponse } from '../src/api/kpiRoute.js';

const NOW = new Date('2026-09-15T06:00:00Z');

const SNAPSHOTS = [
  { id: 'snap-2026-09-14-complete', observationDate: '2026-09-14', value: 12480, complete: true, sources: ['crm', 'billing', 'identity'], generatedAt: '2026-09-15T00:12:00Z' },
  { id: 'snap-2026-09-13-complete', observationDate: '2026-09-13', value: 12411, complete: true, sources: ['crm', 'billing', 'identity'], generatedAt: '2026-09-14T00:10:00Z' },
  { id: 'snap-2026-09-12-partial', observationDate: '2026-09-12', value: 11990, complete: false, sources: ['crm', 'billing'], generatedAt: '2026-09-13T00:11:00Z' },
  { id: 'snap-2026-08-20-complete', observationDate: '2026-08-20', value: 11200, complete: true, sources: ['crm', 'billing', 'identity'], generatedAt: '2026-08-21T00:08:00Z' },
];

const ok = (upstream, count, observationDate = '2026-09-15') => ({ upstream, count, connected: true, observationDate });
const bad = (upstream, status) => ({ upstream, status, connected: status !== 'disconnected' });
const FULL_PULLS = () => [ok('crm', 4200), ok('billing', 4100), ok('identity', 4180)];
const run = (pulls, snapshots = SNAPSHOTS) => aggregateLiveAccounts(pulls, { snapshots, now: NOW });

test('C01 complete: all three upstreams usable -> live sum', () => {
  const r = run(FULL_PULLS());
  assert.equal(r.state, 'live');
  assert.equal(r.value, 12480);
  assert.equal(r.source, 'live');
});

test('C02 complete-deduped: identical duplicate pull counted once', () => {
  const r = run([...FULL_PULLS(), ok('crm', 4200)]);
  assert.equal(r.state, 'live');
  assert.equal(r.value, 12480);
  assert.ok(r.issues.some((i) => i.type === 'deduplicated'));
});

test('C03 missing-identity: disconnected upstream -> degraded to latest complete snapshot', () => {
  const r = run([ok('crm', 4200), ok('billing', 4100), bad('identity', 'disconnected')]);
  assert.equal(r.state, 'degraded');
  assert.equal(r.value, 12480);
  assert.equal(r.snapshot.id, 'snap-2026-09-14-complete');
});

test('C04 partial-crm: partial pull is not summed -> degraded snapshot', () => {
  const r = run([{ ...ok('crm', 3900), status: 'partial' }, ok('billing', 4100), ok('identity', 4180)]);
  assert.equal(r.state, 'degraded');
  assert.equal(r.snapshot.id, 'snap-2026-09-14-complete');
});

test('C05 billing-timeout -> degraded snapshot', () => {
  const r = run([ok('crm', 4200), bad('billing', 'timeout'), ok('identity', 4180)]);
  assert.equal(r.state, 'degraded');
  assert.equal(r.snapshot.id, 'snap-2026-09-14-complete');
});

test('C06 identity-stale -> degraded snapshot', () => {
  const r = run([ok('crm', 4200), ok('billing', 4100), bad('identity', 'stale')]);
  assert.equal(r.state, 'degraded');
  assert.equal(r.snapshot.id, 'snap-2026-09-14-complete');
});

test('C07 all-disconnected -> degraded snapshot', () => {
  const r = run([bad('crm', 'disconnected'), bad('billing', 'disconnected'), bad('identity', 'disconnected')]);
  assert.equal(r.state, 'degraded');
  assert.equal(r.snapshot.id, 'snap-2026-09-14-complete');
});

test('C08 conflicting-count: same upstream disagrees -> degraded snapshot', () => {
  const r = run([ok('crm', 4200), ok('billing', 4100), ok('billing', 4400), ok('identity', 4180)]);
  assert.equal(r.state, 'degraded');
  assert.equal(r.snapshot.id, 'snap-2026-09-14-complete');
  assert.ok(r.issues.some((i) => i.type === 'conflict' && i.upstream === 'billing'));
});

test('C09 partial-with-newer-incomplete-snapshot: incomplete snapshot skipped', () => {
  const r = run([{ upstream: 'crm', status: 'partial', connected: true }, ok('billing', 4100), ok('identity', 4180)]);
  assert.equal(r.state, 'degraded');
  assert.equal(r.snapshot.id, 'snap-2026-09-14-complete');
  assert.notEqual(r.snapshot.id, 'snap-2026-09-12-partial');
});

test('C10 no-snapshot: all disconnected and no history -> unavailable', () => {
  const r = run([bad('crm', 'disconnected'), bad('billing', 'disconnected'), bad('identity', 'disconnected')], []);
  assert.equal(r.state, 'unavailable');
  assert.equal(r.value, null);
  assert.equal(r.source, null);
});

test('C11 only-incomplete-snapshot -> unavailable', () => {
  const r = run([bad('crm', 'timeout')], [SNAPSHOTS[2]]);
  assert.equal(r.state, 'unavailable');
  assert.equal(r.value, null);
});

test('C12 only-stale-snapshot: older than KPI_SNAPSHOT_MAX_AGE_DAYS -> unavailable', () => {
  const r = run([bad('billing', 'timeout'), ok('crm', 4200), ok('identity', 4180)], [SNAPSHOTS[3]]);
  assert.equal(r.state, 'unavailable');
  assert.equal(r.value, null);
});

test('C13 complete-zero: observed zero is live, not treated as missing', () => {
  const r = run([ok('crm', 0), ok('billing', 0), ok('identity', 0)]);
  assert.equal(r.state, 'live');
  assert.equal(r.value, 0);
});

test('C14 duplicate-identity: identical duplicate deduped -> live', () => {
  const r = run([...FULL_PULLS(), ok('identity', 4180)]);
  assert.equal(r.state, 'live');
  assert.equal(r.value, 12480);
});

test('C15 schema-error: malformed billing pull -> degraded snapshot', () => {
  const r = run([ok('crm', 4200), { upstream: 'billing', connected: true, count: '4100' }, ok('identity', 4180)]);
  assert.equal(r.state, 'degraded');
  assert.equal(r.snapshot.id, 'snap-2026-09-14-complete');
});

test('C16 late-response -> degraded snapshot', () => {
  const r = run([bad('crm', 'late'), ok('billing', 4100), ok('identity', 4180)]);
  assert.equal(r.state, 'degraded');
  assert.equal(r.snapshot.id, 'snap-2026-09-14-complete');
});

test('C17 conflicting-observation-date -> degraded snapshot', () => {
  const r = run([ok('crm', 4200, '2026-09-15'), ok('billing', 4100, '2026-09-14'), ok('identity', 4180, '2026-09-15')]);
  assert.equal(r.state, 'degraded');
  assert.equal(r.snapshot.id, 'snap-2026-09-14-complete');
});

test('C18 snapshot-missing-date: undated snapshot is unsuitable -> unavailable', () => {
  const undated = [{ id: 'snap-undated', value: 12480, complete: true, sources: ['crm', 'billing', 'identity'] }];
  const r = run([bad('crm', 'timeout'), bad('billing', 'timeout'), bad('identity', 'timeout')], undated);
  assert.equal(r.state, 'unavailable');
});

test('C19 snapshot-incomplete-sources: snapshot missing a required upstream -> unavailable', () => {
  const noIdentity = [{ id: 'snap-no-identity', observationDate: '2026-09-14', value: 8300, complete: true, sources: ['crm', 'billing'] }];
  const r = run([bad('crm', 'timeout'), bad('billing', 'timeout'), bad('identity', 'timeout')], noIdentity);
  assert.equal(r.state, 'unavailable');
});

test('C20 live-complete-old-observation: stays live with explicit stale freshness warning', () => {
  const r = run([ok('crm', 4200, '2026-09-10'), ok('billing', 4100, '2026-09-10'), ok('identity', 4180, '2026-09-10')]);
  assert.equal(r.state, 'live');
  assert.equal(r.freshness.status, 'stale');
  assert.equal(r.freshness.ageDays, 5);
});

test('API contract: degraded response carries snapshot provenance for both views', () => {
  const res = activeAccountsResponse([ok('crm', 4200), ok('billing', 4100), bad('identity', 'disconnected')], NOW);
  assert.equal(res.kpi, 'active_accounts');
  assert.equal(res.state, 'degraded');
  assert.equal(res.source, 'snapshot');
  assert.equal(res.snapshot.observationDate, '2026-09-14');
  assert.equal(res.freshness.status, 'stale');
});

test('API contract: KAN-213 regression - partial data never returns as live', () => {
  const live = activeAccountsResponse(FULL_PULLS(), NOW);
  assert.equal(live.state, 'live');
  assert.equal(live.value, 12480);
  const partial = activeAccountsResponse([ok('crm', 4200), ok('billing', 4100)], NOW);
  assert.notEqual(partial.state, 'live');
});
