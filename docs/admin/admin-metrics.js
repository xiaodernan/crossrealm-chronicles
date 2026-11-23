const HUMAN_ADJACENT_TYPES = new Set(['boss_kill', 'canon_open']);
const PROBE_TYPES = new Set(['loadtest', 'stress-probe', 'smoke']);
const DAY_MS = 86400000;

const count = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const dayNumber = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return null;
  const n = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(n) ? n : null;
};

function summarizeAdminRollup(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('telemetry snapshot missing');
  if (snapshot.enabled === false && snapshot.real !== true) throw new Error('telemetry backend disabled');
  const totals = {};
  for (const [type, value] of Object.entries(snapshot.totals ?? {})) totals[type] = count(value);
  const grouped = {};
  for (const [type, value] of Object.entries(totals)) {
    const bucket = HUMAN_ADJACENT_TYPES.has(type) ? 'humanAdjacent' : PROBE_TYPES.has(type) ? 'probe' : 'other';
    grouped[bucket] = (grouped[bucket] ?? 0) + value;
  }
  const byDay = new Map();
  for (const row of snapshot.byDayAndType ?? []) {
    const time = dayNumber(row?.day);
    if (time === null || typeof row?.type !== 'string') continue;
    const day = byDay.get(time) ?? { day: row.day, total: 0, humanAdjacent: 0, probe: 0 };
    const value = count(row.count);
    day.total += value;
    if (HUMAN_ADJACENT_TYPES.has(row.type)) day.humanAdjacent += value;
    if (PROBE_TYPES.has(row.type)) day.probe += value;
    byDay.set(time, day);
  }
  const daily = [...byDay.entries()].sort(([a], [b]) => a - b).map(([, day]) => day);
  const latest = daily.at(-1);
  const previous = daily.at(-2);
  const elapsedDays = latest && previous ? (dayNumber(latest.day) - dayNumber(previous.day)) / DAY_MS : null;
  const delta = latest && previous ? latest.humanAdjacent - previous.humanAdjacent : null;
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const rowsTotal = daily.reduce((sum, day) => sum + day.total, 0);
  if (total !== rowsTotal) throw new Error('telemetry totals do not reconcile with daily rows');
  return {
    real: snapshot.real === true || snapshot.enabled === true,
    mode: snapshot.real === true && snapshot.enabled !== true ? 'snapshot' : 'live',
    generatedAt: snapshot.generated ?? null,
    windowDays: count(snapshot.windowDays ?? snapshot.days),
    total,
    totals,
    grouped: { humanAdjacent: grouped.humanAdjacent ?? 0, probe: grouped.probe ?? 0, other: grouped.other ?? 0 },
    daily,
    observedDays: daily.length,
    trend: {
      metric: 'humanAdjacentEventCount',
      fromDay: previous?.day ?? null,
      toDay: latest?.day ?? null,
      elapsedDays,
      previous: previous?.humanAdjacent ?? null,
      current: latest?.humanAdjacent ?? null,
      delta,
      percent: previous && previous.humanAdjacent > 0 && delta !== null ? delta / previous.humanAdjacent : null,
      forecast: null,
    },
    retention: {
      eligible: false,
      reasons: ['user-identity-missing', 'session-cohort-missing'],
      minimumDistinctUsers: 200,
      minimumWindowDays: 14,
    },
  };
}

globalThis.summarizeAdminRollup = summarizeAdminRollup;
