"use client";

import { useState } from "react";
import Link from "next/link";
import type { LeaderboardEntry, ReliabilityBucket } from "@/lib/queries";
import { traderName } from "@/lib/trader-names";
import { TraderAvatar } from "./trader-avatar";

/**
 * The three-card row that opens the dark act, built to the proportions in
 * `design/references/web3-wgmi.jpeg`.
 *
 * The reference gives each card a saturated art panel roughly square at the top, then a
 * centred name, then a small centred metric line beneath it. Its metric is a price in ETH.
 * Ours is edge in cents per dollar staked, which is the number a follower is actually
 * choosing on.
 *
 * The art panel holds a reliability curve rather than a character. It is the same data the
 * trader's own profile plots, drawn large and stripped of its axes, because at this size it
 * works as a shape you can compare across three cards at a glance and the precise reading
 * belongs on the profile page.
 */

const TONES = [
  { panel: "bg-tile-vermillion", ink: "#0a0a0a", grid: "rgba(10,10,10,0.16)" },
  { panel: "bg-tile-gradient", ink: "#ffffff", grid: "rgba(255,255,255,0.22)" },
  { panel: "bg-tile-ink", ink: "#ffffff", grid: "rgba(255,255,255,0.14)" },
] as const;

const RANGES = [
  { id: "all", label: "All time" },
  { id: "30d", label: "30 days" },
  { id: "7d", label: "7 days" },
] as const;

/**
 * The curve, without axes.
 *
 * The dashed diagonal is perfect calibration: of the calls made at 70 percent, 70 came true.
 * A line bowing below it is a trader claiming more than they deliver. Marks scale with sample
 * count for the same reason they do on the profile page, so a band holding four calls cannot
 * look as settled as one holding four hundred.
 */
function CalibrationShape({
  buckets,
  ink,
  grid,
}: {
  buckets: ReliabilityBucket[];
  ink: string;
  grid: string;
}) {
  const pts = [...buckets]
    .filter((b) => b.sampleCount > 0)
    .sort((a, b) => a.bucket - b.bucket)
    .map((b) => ({
      x: (b.bucket + 0.05) * 100,
      y: 100 - b.observedFrequency * 100,
      n: b.sampleCount,
    }));

  const maxN = pts.reduce((m, p) => Math.max(m, p.n), 0);

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Calibration curve">
      {[25, 50, 75].map((v) => (
        <g key={v} stroke={grid} strokeWidth="0.4">
          <line x1={v} y1="0" x2={v} y2="100" />
          <line x1="0" y1={v} x2="100" y2={v} />
        </g>
      ))}
      <line x1="0" y1="100" x2="100" y2="0" stroke={ink} strokeWidth="0.7" strokeDasharray="3 3" opacity="0.45" />

      {pts.length > 1 && (
        <polyline
          points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={ink}
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {pts.map((p) => (
        <circle
          key={p.x}
          cx={p.x}
          cy={p.y}
          r={maxN > 0 ? 1.4 + 3 * Math.sqrt(p.n / maxN) : 2}
          fill={ink}
        />
      ))}
    </svg>
  );
}

function edgeLabel(entry: LeaderboardEntry): string {
  if (entry.edge === null) return "Not yet scored";
  const cents = entry.edge * 100;
  return `${cents >= 0 ? "+" : ""}${cents.toFixed(1)}c per $1`;
}

export function TopTraders({ traders }: { traders: LeaderboardEntry[] }) {
  const [range, setRange] = useState<string>(RANGES[0].id);
  const top = traders.slice(0, 3);

  if (top.length === 0) return null;

  return (
    <section className="relative py-20 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-6 sm:px-10">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Top calibrated</h2>

          {/*
            The reference puts a small white pill dropdown immediately beside the section
            title. It is a real <select> under a styled shell rather than a custom menu, so it
            keeps keyboard behaviour and the platform's own picker on a phone.
          */}
          <div className="relative">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              aria-label="Time range"
              className="appearance-none rounded-full bg-white py-2 pl-4 pr-10 text-[13px] font-medium text-tile-ink outline-none"
            >
              {RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {traderName(r.label)}
                </option>
              ))}
            </select>
            <span
              aria-hidden
              className="pointer-events-none absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-tile-ink"
            >
              <svg width="9" height="6" viewBox="0 0 9 6" fill="none">
                <path d="M1 1l3.5 3.5L8 1" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </span>
          </div>
        </div>

        {/*
          Ranking is computed once, over the full record, and the control above does not
          re-slice it yet. Saying so here rather than shipping a control that silently does
          nothing: the range needs per-window scores the worker does not compute today.
        */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {top.map((entry, i) => {
            const tone = TONES[i % TONES.length];
            return (
              <Link
                key={entry.id}
                href={`/traders/${entry.id}`}
                className="group rounded-[22px] border border-rule bg-surface p-2.5 transition-colors hover:border-edge"
              >
                <div className={`relative aspect-square overflow-hidden rounded-2xl p-5 ${tone.panel}`}>
                  <CalibrationShape
                    buckets={entry.reliability}
                    ink={tone.ink}
                    grid={tone.grid}
                  />
                  {entry.isSeed && (
                    <span
                      className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                      style={{ color: tone.ink, background: tone.grid }}
                    >
                      Ours
                    </span>
                  )}
                </div>

                <div className="px-2 pb-3 pt-4 text-center flex flex-col items-center">
                  <div className="flex items-center justify-center gap-2">
                    <TraderAvatar address={entry.address} name={traderName(entry.label)} size={28} />
                    <p className="text-lg font-semibold tracking-tight">
                      {traderName(entry.label)}
                    </p>
                  </div>
                  <p className="mt-1.5 flex items-center justify-center gap-1.5 font-mono text-[11px] tabular-nums text-ink-3">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 rotate-45 rounded-[1px] bg-accent"
                    />
                    {edgeLabel(entry)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
