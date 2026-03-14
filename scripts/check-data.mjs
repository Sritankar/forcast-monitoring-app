import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

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

async function readJson(fileName) {
  const fullPath = path.join(DATA_DIR, fileName);
  const content = await fs.readFile(fullPath, "utf8");
  return JSON.parse(content);
}

async function main() {
  const [actuals, forecasts] = await Promise.all([
    readJson("actuals_wind_jan_2024.json"),
    readJson("forecasts_wind_jan_2024.json"),
  ]);

  const horizon = forecasts.map((row) => Number(row.horizonHours)).sort((a, b) => a - b);
  console.log("Actual rows:", actuals.length);
  console.log("Forecast rows:", forecasts.length);
  console.log(
    "Actual UTC range:",
    actuals[0]?.startTime ?? "n/a",
    "->",
    actuals[actuals.length - 1]?.startTime ?? "n/a",
  );
  console.log("Horizon min/max:", horizon[0] ?? "n/a", "/", horizon[horizon.length - 1] ?? "n/a");
  console.log("Horizon p50:", quantile(horizon, 0.5));
  console.log("Horizon p99:", quantile(horizon, 0.99));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
