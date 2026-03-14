import { NextResponse } from "next/server";
import { buildSeries, DATA_BOUNDS } from "@/lib/monitoring";

const DEFAULT_START = "2024-01-24T08:00:00Z";
const DEFAULT_END = "2024-01-25T08:00:00Z";
const DEFAULT_HORIZON_HOURS = 4;

function parseIsoDate(value, fallbackIso) {
  const input = value && value.length ? value : fallbackIso;
  return Date.parse(input);
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const startMs = parseIsoDate(searchParams.get("start"), DEFAULT_START);
    const endMs = parseIsoDate(searchParams.get("end"), DEFAULT_END);
    const horizonHours = toNumber(searchParams.get("horizonHours"), DEFAULT_HORIZON_HOURS);

    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      return NextResponse.json(
        {
          error:
            "Invalid datetime value. Use ISO UTC format, for example 2024-01-24T08:00:00Z.",
        },
        { status: 400 },
      );
    }

    if (startMs > endMs) {
      return NextResponse.json(
        { error: "start must be earlier than or equal to end." },
        { status: 400 },
      );
    }

    if (
      horizonHours < DATA_BOUNDS.horizonMinHours ||
      horizonHours > DATA_BOUNDS.horizonMaxHours
    ) {
      return NextResponse.json(
        {
          error: `horizonHours must be between ${DATA_BOUNDS.horizonMinHours} and ${DATA_BOUNDS.horizonMaxHours}.`,
        },
        { status: 400 },
      );
    }

    const { series, summary } = buildSeries({ startMs, endMs, horizonHours });

    return NextResponse.json({
      meta: {
        request: {
          startIso: new Date(startMs).toISOString(),
          endIso: new Date(endMs).toISOString(),
          horizonHours,
        },
        dataBounds: DATA_BOUNDS,
        summary,
      },
      series,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error." },
      { status: 500 },
    );
  }
}
