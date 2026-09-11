"use client";

import { useState } from "react";
import type { ReliabilityBucket } from "@echonome/shared";

/**
 * A reliability diagram: for each confidence band the trader traded at, how often they were
 * actually right.
 *
 * Reading it: the dashed diagonal is perfect calibration — of the calls made at 70%
 * confidence, 70% came true. A point ABOVE the line means they were righter than they claimed
 * (underconfident); BELOW means overconfident. A trader whose points slope the wrong way is
 * anti-informative at the top end, which is a completely different proposition from one whose
 * points cluster near the middle, and a single Brier score cannot tell those apart at all.
 *
 * Marks are sized by how many calls sit in the bucket, deliberately: a band holding two calls
 * must not look as authoritative as one holding two hundred, and drawing them identically
 * would invite exactly that misreading. The same numbers appear in the table beneath, so the
 * chart is never the only way to get them.
 */

const W = 520;
const H = 300;
const PAD = { top: 16, right: 16, bottom: 40, left: 48 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const x = (v: number) => PAD.left + v * PLOT_W;
const y = (v: number) => PAD.top + (1 - v) * PLOT_H;

/** Bucket midpoint — a bucket labelled 0.7 holds calls from 70% up to 80%. */
const mid = (bucket: number) => bucket + 0.05;

function radius(sampleCount: number, max: number): number {
  if (max <= 0) return 5;
  // Area-proportional, floored at 4px so a single-call bucket is still visible and still
  // clickable, and capped so one huge bucket can't swallow the plot.
  return Math.max(4, Math.min(14, 4 + 10 * Math.sqrt(sampleCount / max)));
}

export function ReliabilityDiagram({ buckets }: { buckets: ReliabilityBucket[] }) {
  const [expanded, setExpanded] = useState(false);

  if (buckets.length === 0) {
    return (
      <div className="border border-rule bg-surface px-5 py-8">
        <h3 className="text-sm font-medium text-ink">No resolved calls to break down yet</h3>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-2">
          This appears once the trader has calls that have actually settled. It is the part
          worth waiting for: it shows whether their confidence means anything, which a single
          score cannot.
        </p>
      </div>
    );
  }

  const previewLimit = Math.max(3, Math.round(buckets.length * 0.3));
  const hasMore = buckets.length > previewLimit;
  const visibleBuckets = expanded || !hasMore ? buckets : buckets.slice(0, previewLimit);

  const maxSample = Math.max(...buckets.map((b) => b.sampleCount));
  const gridlines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border border-rule bg-surface p-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          role="img"
          aria-label="Reliability diagram: stated confidence against how often the trader was right"
          className="block min-w-[420px]"
        >
          {gridlines.map((g) => (
            <g key={g}>
              <line x1={x(0)} y1={y(g)} x2={x(1)} y2={y(g)} stroke="var(--rule)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(g) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">
                {Math.round(g * 100)}%
              </text>
              <text x={x(g)} y={H - PAD.bottom + 18} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
                {Math.round(g * 100)}%
              </text>
            </g>
          ))}

          {/* Perfect calibration. Dashed and recessive: it is a reference, not a series. */}
          <line
            x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)}
            stroke="var(--edge)" strokeWidth={2} strokeDasharray="5 5"
          />
          <text x={x(0.82)} y={y(0.86)} fontSize={11} fill="var(--ink-3)">
            perfectly calibrated
          </text>

          {/* The trader's own line, then the marks on top of it. */}
          <polyline
            points={buckets.map((b) => `${x(mid(b.bucket))},${y(b.observedFrequency)}`).join(" ")}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
          />
          {buckets.map((b) => (
            <circle
              key={b.bucket}
              cx={x(mid(b.bucket))}
              cy={y(b.observedFrequency)}
              r={radius(b.sampleCount, maxSample)}
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth={2}
            >
              <title>
                {`Claimed ${Math.round(b.bucket * 100)}–${Math.round((b.bucket + 0.1) * 100)}% · right ${Math.round(
                  b.observedFrequency * 100
                )}% of ${b.sampleCount} call${b.sampleCount === 1 ? "" : "s"}`}
              </title>
            </circle>
          ))}

          <text x={PAD.left + PLOT_W / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
            confidence the trader expressed
          </text>
          <text
            x={-(PAD.top + PLOT_H / 2)} y={13}
            transform="rotate(-90)" textAnchor="middle" fontSize={11} fill="var(--ink-3)"
          >
            how often they were right
          </text>
        </svg>
      </div>

      <div className="overflow-x-auto border border-rule">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <caption className="sr-only">
            The same reliability breakdown as a table: confidence band, calls made, and how
            often those calls were right
          </caption>
          <thead>
            <tr className="border-b border-rule bg-surface-raised text-left">
              <th scope="col" className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-ink-3">
                They claimed
              </th>
              <th scope="col" className="px-4 py-2.5 text-right text-[10px] font-medium uppercase tracking-wider text-ink-3">
                Calls
              </th>
              <th scope="col" className="px-4 py-2.5 text-right text-[10px] font-medium uppercase tracking-wider text-ink-3">
                Actually right
              </th>
              <th scope="col" className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-ink-3">
                Verdict
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule bg-surface">
            {visibleBuckets.map((b) => {
              const claimed = b.bucket + 0.05;
              const gap = b.observedFrequency - claimed;
              return (
                <tr key={b.bucket}>
                  <td className="px-4 py-2.5 font-mono text-ink-2 tnum">
                    {Math.round(b.bucket * 100)}–{Math.round((b.bucket + 0.1) * 100)}%
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink-2 tnum">{b.sampleCount}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink tnum">
                    {Math.round(b.observedFrequency * 100)}%
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">{verdict(gap, b.sampleCount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center justify-center gap-2 border-t border-rule bg-surface-raised px-4 py-2.5 text-xs font-mono uppercase tracking-wider text-ink-2 transition-colors hover:bg-surface hover:text-ink"
          >
            <span>{expanded ? "Show fewer bands" : `Show full breakdown (${buckets.length} bands)`}</span>
            <svg
              width="10"
              height="6"
              viewBox="0 0 10 6"
              fill="none"
              className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            >
              <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The gap between claim and reality, in words. Thresholds are wide because a bucket of twenty
 * calls carries real sampling noise, and a confident-sounding label on a small sample is worse
 * than no label — so a thin bucket is never given a strong verdict at all.
 */
function verdict(gap: number, sampleCount: number): string {
  if (sampleCount < 10) return "too few calls to judge";
  if (gap > 0.2) return "much righter than they claimed";
  if (gap > 0.08) return "slightly underconfident";
  if (gap < -0.2) return "much wronger than they claimed";
  if (gap < -0.08) return "slightly overconfident";
  return "well calibrated";
}
