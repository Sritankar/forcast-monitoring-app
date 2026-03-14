import fs from "node:fs";
import path from "node:path";

const JAN_START_MS = Date.parse("2024-01-01T00:00:00Z");
const JAN_END_MS = Date.parse("2024-02-01T00:00:00Z");
const HORIZON_MIN_HOURS = 0;
const HORIZON_MAX_HOURS = 48;

const ACTUALS_PATH = path.join(process.cwd(), "data", "actuals_wind_jan_2024.json");
const FORECASTS_PATH = path.join(process.cwd(), "data", "forecasts_wind_jan_2024.json");

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing dataset file: ${path.basename(filePath)}. Run "npm run fetch:data" first.`,
    );
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeActuals(rawRows) {
  const rows = [];
  for (const row of rawRows) {
    const startMs = Date.parse(row.startTime);
    const generation = toNumber(row.generation);
    if (Number.isNaN(startMs) || generation === null) {
      continue;
    }
    if (startMs < JAN_START_MS || startMs >= JAN_END_MS) {
      continue;
    }
    rows.push({
      startMs,
      startTime: new Date(startMs).toISOString(),
      generation,
    });
  }
  rows.sort((a, b) => a.startMs - b.startMs);
  return rows;
}

function normalizeForecasts(rawRows) {
  const byTarget = new Map();
  for (const row of rawRows) {
    const startMs = Date.parse(row.startTime);
    const publishMs = Date.parse(row.publishTime);
    const generation = toNumber(row.generation);
    if (Number.isNaN(startMs) || Number.isNaN(publishMs) || generation === null) {
      continue;
    }
    if (startMs < JAN_START_MS || startMs >= JAN_END_MS) {
      continue;
    }
    const horizonHours = (startMs - publishMs) / 3_600_000;
    if (horizonHours < HORIZON_MIN_HOURS || horizonHours > HORIZON_MAX_HOURS) {
      continue;
    }
    if (!byTarget.has(startMs)) {
      byTarget.set(startMs, []);
    }
    byTarget.get(startMs).push({
      publishMs,
      publishTime: new Date(publishMs).toISOString(),
      generation,
      horizonHours,
    });
  }

  for (const [, rows] of byTarget) {
    rows.sort((a, b) => a.publishMs - b.publishMs);
  }
  return byTarget;
}

function findLatestAtOrBefore(rows, cutoffMs) {
  let low = 0;
  let high = rows.length - 1;
  let best = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (rows[mid].publishMs <= cutoffMs) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best === -1 ? null : rows[best];
}

function quantile(sortedValues, p) {
  if (!sortedValues.length) {
    return null;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }
  const clamped = Math.max(0, Math.min(1, p));
  const idx = (sortedValues.length - 1) * clamped;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) {
    return sortedValues[lower];
  }
  const weight = idx - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

const actuals = normalizeActuals(readJsonFile(ACTUALS_PATH));
const forecastsByTarget = normalizeForecasts(readJsonFile(FORECASTS_PATH));

export const DATA_BOUNDS = {
  januaryStartIso: new Date(JAN_START_MS).toISOString(),
  januaryEndIsoExclusive: new Date(JAN_END_MS).toISOString(),
  horizonMinHours: HORIZON_MIN_HOURS,
  horizonMaxHours: HORIZON_MAX_HOURS,
};

export function buildSeries({ startMs, endMs, horizonHours }) {
  const clampedStartMs = Math.max(startMs, JAN_START_MS);
  const clampedEndMs = Math.min(endMs, JAN_END_MS - 1);

  const series = [];
  for (const actual of actuals) {
    if (actual.startMs < clampedStartMs || actual.startMs > clampedEndMs) {
      continue;
    }
    const forecastsForTarget = forecastsByTarget.get(actual.startMs) ?? [];
    const cutoffMs = actual.startMs - horizonHours * 3_600_000;
    const selected = findLatestAtOrBefore(forecastsForTarget, cutoffMs);
    const forecastMw = selected ? selected.generation : null;
    const absErrorMw = selected ? Math.abs(actual.generation - selected.generation) : null;

    series.push({
      targetTime: actual.startTime,
      actualMw: actual.generation,
      forecastMw,
      forecastPublishTime: selected ? selected.publishTime : null,
      absoluteErrorMw: absErrorMw,
    });
  }

  const available = series.filter((row) => row.forecastMw !== null);
  const absErrors = available.map((row) => row.absoluteErrorMw).sort((a, b) => a - b);
  const maeMw =
    absErrors.length === 0 ? null : absErrors.reduce((sum, value) => sum + value, 0) / absErrors.length;

  return {
    series,
    summary: {
      totalTargets: series.length,
      availableForecasts: available.length,
      coveragePct:
        series.length === 0 ? null : (available.length / series.length) * 100,
      maeMw,
      medianAbsErrorMw: quantile(absErrors, 0.5),
      p99AbsErrorMw: quantile(absErrors, 0.99),
    },
  };
}
