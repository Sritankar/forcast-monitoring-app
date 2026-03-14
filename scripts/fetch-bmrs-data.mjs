import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const API_BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets";
const DATA_DIR = path.join(process.cwd(), "data");

const JAN_START_MS = Date.parse("2024-01-01T00:00:00Z");
const JAN_END_MS = Date.parse("2024-02-01T00:00:00Z");
const PUBLISH_START_MS = Date.parse("2023-12-30T00:00:00Z");
const PUBLISH_END_MS = Date.parse("2024-02-01T00:00:00Z");
const CHUNK_HOURS = 24 * 6;

function iso(ms) {
  return new Date(ms).toISOString();
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed (${response.status}) for ${url}\n${body.slice(0, 400)}`);
  }
  return response.json();
}

async function fetchActuals() {
  const url =
    `${API_BASE}/FUELHH/stream` +
    `?settlementDateFrom=2024-01-01&settlementDateTo=2024-01-31` +
    `&fuelType=WIND&format=json`;
  const rows = await fetchJson(url);
  if (!Array.isArray(rows)) {
    throw new Error("Unexpected FUELHH response format.");
  }

  return rows
    .map((row) => {
      const startMs = Date.parse(row.startTime);
      const generation = toNumber(row.generation);
      return {
        startMs,
        generation,
      };
    })
    .filter(
      (row) =>
        !Number.isNaN(row.startMs) &&
        row.startMs >= JAN_START_MS &&
        row.startMs < JAN_END_MS &&
        row.generation !== null,
    )
    .sort((a, b) => a.startMs - b.startMs)
    .map((row) => ({
      startTime: new Date(row.startMs).toISOString(),
      generation: row.generation,
    }));
}

async function fetchForecastChunk(publishFromMs, publishToMs) {
  const url =
    `${API_BASE}/WINDFOR` +
    `?publishDateTimeFrom=${encodeURIComponent(iso(publishFromMs))}` +
    `&publishDateTimeTo=${encodeURIComponent(iso(publishToMs))}` +
    `&format=json`;

  const payload = await fetchJson(url);
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error("Unexpected WINDFOR response format.");
  }
  return payload.data;
}

async function fetchForecasts() {
  const rawRows = [];
  let cursorMs = PUBLISH_START_MS;
  while (cursorMs <= PUBLISH_END_MS) {
    const chunkEndMs = Math.min(cursorMs + CHUNK_HOURS * 3_600_000, PUBLISH_END_MS);
    const chunk = await fetchForecastChunk(cursorMs, chunkEndMs);
    rawRows.push(...chunk);
    console.log(
      `[WINDFOR] ${iso(cursorMs)} -> ${iso(chunkEndMs)} | records=${chunk.length}`,
    );
    if (chunkEndMs === PUBLISH_END_MS) {
      break;
    }
    cursorMs = chunkEndMs;
  }

  const deduped = new Map();
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
    if (horizonHours < 0 || horizonHours > 48) {
      continue;
    }
    const key = `${new Date(startMs).toISOString()}|${new Date(publishMs).toISOString()}`;
    if (!deduped.has(key)) {
      deduped.set(key, {
        startTime: new Date(startMs).toISOString(),
        publishTime: new Date(publishMs).toISOString(),
        generation,
        horizonHours: Number(horizonHours.toFixed(2)),
      });
    }
  }

  return [...deduped.values()].sort((a, b) => {
    const targetDiff = Date.parse(a.startTime) - Date.parse(b.startTime);
    if (targetDiff !== 0) {
      return targetDiff;
    }
    return Date.parse(a.publishTime) - Date.parse(b.publishTime);
  });
}

function quantile(sortedValues, p) {
  if (!sortedValues.length) {
    return null;
  }
  const idx = (sortedValues.length - 1) * Math.min(1, Math.max(0, p));
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) {
    return sortedValues[lower];
  }
  const weight = idx - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  console.log("Fetching January 2024 actual wind generation...");
  const actuals = await fetchActuals();
  console.log(`Actual rows kept: ${actuals.length}`);

  console.log("Fetching WINDFOR forecasts published between 2023-12-30 and 2024-02-01...");
  const forecasts = await fetchForecasts();
  console.log(`Forecast rows kept (horizon 0-48h): ${forecasts.length}`);

  const horizonValues = forecasts.map((row) => row.horizonHours).sort((a, b) => a - b);
  const summary = {
    generatedAtUtc: new Date().toISOString(),
    actualRows: actuals.length,
    forecastRows: forecasts.length,
    actualStartUtc: actuals[0]?.startTime ?? null,
    actualEndUtc: actuals[actuals.length - 1]?.startTime ?? null,
    minHorizonHours: horizonValues[0] ?? null,
    p50HorizonHours: quantile(horizonValues, 0.5),
    p99HorizonHours: quantile(horizonValues, 0.99),
    maxHorizonHours: horizonValues[horizonValues.length - 1] ?? null,
  };

  await Promise.all([
    writeFile(
      path.join(DATA_DIR, "actuals_wind_jan_2024.json"),
      `${JSON.stringify(actuals, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(DATA_DIR, "forecasts_wind_jan_2024.json"),
      `${JSON.stringify(forecasts, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(DATA_DIR, "dataset_summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    ),
  ]);

  console.log("Saved:");
  console.log(" - data/actuals_wind_jan_2024.json");
  console.log(" - data/forecasts_wind_jan_2024.json");
  console.log(" - data/dataset_summary.json");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
