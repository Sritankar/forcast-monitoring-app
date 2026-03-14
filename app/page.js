"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const DEFAULT_START = "2024-01-24T08:00";
const DEFAULT_END = "2024-01-25T08:00";
const DEFAULT_HORIZON = 4;

function toUtcIso(datetimeLocal) {
  if (!datetimeLocal) {
    return null;
  }
  return `${datetimeLocal}:00Z`;
}

function formatUtcShort(isoString) {
  const date = new Date(isoString);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

function formatMw(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return `${Math.round(value).toLocaleString("en-GB")} MW`;
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return `${value.toFixed(1)}%`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const row = payload[0].payload;
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid rgba(19, 58, 53, 0.2)",
        borderRadius: 10,
        padding: 10,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{formatUtcShort(label)} UTC</div>
      <div>Actual: {formatMw(row.actualMw)}</div>
      <div>Forecast: {formatMw(row.forecastMw)}</div>
      <div>Abs Error: {formatMw(row.absoluteErrorMw)}</div>
      <div>
        Forecast Publish:{" "}
        {row.forecastPublishTime ? `${formatUtcShort(row.forecastPublishTime)} UTC` : "missing"}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [startInput, setStartInput] = useState(DEFAULT_START);
  const [endInput, setEndInput] = useState(DEFAULT_END);
  const [horizonHours, setHorizonHours] = useState(DEFAULT_HORIZON);
  const [mounted, setMounted] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const summary = result?.meta?.summary;
  const hasSeries = result?.series && result.series.length > 0;

  async function loadSeries() {
    const startIso = toUtcIso(startInput);
    const endIso = toUtcIso(endInput);
    if (!startIso || !endIso) {
      setError("Please provide both start and end times.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        start: startIso,
        end: endIso,
        horizonHours: String(horizonHours),
      });
      const response = await fetch(`/api/monitor?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load chart data.");
      }
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chart data.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    loadSeries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const titleSubtext = useMemo(() => {
    if (!result?.meta?.request) {
      return "January 2024 | Data source: BMRS FUELHH and WINDFOR";
    }
    const { request } = result.meta;
    return `${formatUtcShort(request.startIso)} to ${formatUtcShort(
      request.endIso,
    )} UTC | Horizon ${request.horizonHours}h`;
  }, [result]);

  return (
    <main className="page-shell">
      <section className="app-frame">
        <header className="hero">
          <h1>UK Wind Forecast Monitoring</h1>
          <p>{titleSubtext}</p>
        </header>

        <section className="controls">
          <div className="control">
            <label htmlFor="start-time">Start Time (UTC)</label>
            <input
              id="start-time"
              type="datetime-local"
              step={1800}
              min="2024-01-01T00:00"
              max="2024-01-31T23:30"
              value={startInput}
              onChange={(event) => setStartInput(event.target.value)}
            />
          </div>
          <div className="control">
            <label htmlFor="end-time">End Time (UTC)</label>
            <input
              id="end-time"
              type="datetime-local"
              step={1800}
              min="2024-01-01T00:00"
              max="2024-01-31T23:30"
              value={endInput}
              onChange={(event) => setEndInput(event.target.value)}
            />
          </div>
          <div className="control">
            <label htmlFor="horizon-slider">Forecast Horizon</label>
            <div className="slider-row">
              <input
                id="horizon-slider"
                type="range"
                min={0}
                max={48}
                step={0.5}
                value={horizonHours}
                onChange={(event) => setHorizonHours(Number(event.target.value))}
              />
              <span className="slider-badge">{horizonHours}h</span>
            </div>
          </div>
          <button className="update-btn" onClick={loadSeries} disabled={loading}>
            {loading ? "Loading..." : "Update Chart"}
          </button>
        </section>

        <section className="metrics">
          <article className="metric-card">
            <div className="metric-label">Coverage</div>
            <div className="metric-value">{formatPercent(summary?.coveragePct)}</div>
          </article>
          <article className="metric-card">
            <div className="metric-label">MAE</div>
            <div className="metric-value">{formatMw(summary?.maeMw)}</div>
          </article>
          <article className="metric-card">
            <div className="metric-label">Median Abs Error</div>
            <div className="metric-value">{formatMw(summary?.medianAbsErrorMw)}</div>
          </article>
          <article className="metric-card">
            <div className="metric-label">P99 Abs Error</div>
            <div className="metric-value">{formatMw(summary?.p99AbsErrorMw)}</div>
          </article>
        </section>

        {error ? <div className="status-row error">{error}</div> : null}
        {!error && !loading && !hasSeries ? (
          <div className="status-row">No values available for the selected range.</div>
        ) : null}

        <section className="chart-wrap">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={result?.series ?? []}
                margin={{ top: 12, right: 18, bottom: 40, left: 18 }}
              >
                <CartesianGrid stroke="var(--grid)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="targetTime"
                  tickFormatter={formatUtcShort}
                  minTickGap={30}
                  angle={-20}
                  textAnchor="end"
                  height={70}
                  tick={{ fill: "var(--ink-1)", fontSize: 12 }}
                />
                <YAxis
                  tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                  tick={{ fill: "var(--ink-1)", fontSize: 12 }}
                  label={{
                    value: "Power (MW)",
                    angle: -90,
                    offset: 4,
                    position: "insideLeft",
                    style: { fill: "var(--ink-1)" },
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" height={28} />
                <Line
                  type="monotone"
                  dataKey="actualMw"
                  name="Actual Generation"
                  stroke="#1f6ed4"
                  strokeWidth={2.4}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="forecastMw"
                  name="Forecast Generation"
                  stroke="var(--accent-1)"
                  strokeWidth={2.4}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : null}
        </section>
      </section>
    </main>
  );
}
