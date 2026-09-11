"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Lock, ShieldCheck, ArrowRight, CaretRight, CaretLeft } from "@phosphor-icons/react";

interface LimitCard {
  id: string;
  tag: string;
  badge: string;
  name: string;
  metric: string;
  metricSub: string;
  body: string;
  footerTag: string;
  theme: {
    bg: string;
    border: string;
    text: string;
    subText: string;
    pillBg: string;
    pillText: string;
    artAccent?: string;
  };
}

const LIMIT_CARDS: LimitCard[] = [
  {
    id: "cap",
    tag: "LIMIT · 01",
    badge: "Hard Stop",
    name: "Per-order cap",
    metric: "$50 USDC",
    metricSub: "Max per individual echo",
    body: "The most a single echo can ever commit, regardless of whether the trader you copy wagers $500 or $50,000.",
    footerTag: "EchoAccount.sol · checked on-chain",
    theme: {
      bg: "bg-gradient-to-br from-zinc-900 via-neutral-950 to-black",
      border: "border-zinc-700/70",
      text: "text-white",
      subText: "text-zinc-400",
      pillBg: "bg-white/10 border border-white/20",
      pillText: "text-zinc-200",
      artAccent: "metallic",
    },
  },
  {
    id: "budget",
    tag: "LIMIT · 02",
    badge: "Ceiling",
    name: "Lifetime budget",
    metric: "$1,000 USDC",
    metricSub: "Total collateral ceiling",
    body: "The maximum collateral your account will commit in total across every echo it ever executes before requiring your top-up.",
    footerTag: "Collateral lock · reverts on overflow",
    theme: {
      bg: "bg-gradient-to-br from-red-600 via-rose-600 to-red-700",
      border: "border-red-400/40",
      text: "text-white",
      subText: "text-red-100",
      pillBg: "bg-white/20 border border-white/30",
      pillText: "text-white",
      artAccent: "geometric",
    },
  },
  {
    id: "expiry",
    tag: "LIMIT · 03",
    badge: "Self-Destruct",
    name: "Expiry date",
    metric: "30 Days",
    metricSub: "Authority lapses automatically",
    body: "The timestamp our key lapses. Execution authority expires automatically on chain unless you explicitly renew it.",
    footerTag: "Timestamp expiry · block.timestamp",
    theme: {
      bg: "bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500",
      border: "border-yellow-300/60",
      text: "text-zinc-950",
      subText: "text-zinc-800",
      pillBg: "bg-black/15 border border-black/20",
      pillText: "text-zinc-900",
      artAccent: "schwarz",
    },
  },
  {
    id: "pause",
    tag: "LIMIT · 04",
    badge: "Instant Freeze",
    name: "Pause switch",
    metric: "1 Block",
    metricSub: "Instant halt without delay",
    body: "Immediate on-chain halt. Takes effect on the very next block without requiring any interaction or approval from our servers.",
    footerTag: "Emergency pause · sole custody",
    theme: {
      bg: "bg-gradient-to-br from-emerald-800 via-teal-900 to-emerald-950",
      border: "border-emerald-500/40",
      text: "text-emerald-50",
      subText: "text-emerald-200/80",
      pillBg: "bg-emerald-500/20 border border-emerald-400/30",
      pillText: "text-emerald-200",
      artAccent: "pattern",
    },
  },
  {
    id: "series",
    tag: "LIMIT · 05",
    badge: "Cadence Allowlist",
    name: "Series approval",
    metric: "Hourly BTC & ETH",
    metricSub: "Strict cadence boundary",
    body: "You authorise an asset series once. Future windows roll over automatically while trades on unapproved markets revert on chain.",
    footerTag: "Series allowlist · immutable filter",
    theme: {
      bg: "bg-gradient-to-br from-indigo-600 via-purple-700 to-violet-900",
      border: "border-indigo-400/40",
      text: "text-white",
      subText: "text-purple-200",
      pillBg: "bg-white/15 border border-white/25",
      pillText: "text-purple-100",
      artAccent: "violet",
    },
  },
  {
    id: "revoke",
    tag: "LIMIT · 06",
    badge: "Burn Key",
    name: "Revoke key",
    metric: "100% Retained",
    metricSub: "Permanent authority strip",
    body: "Permanently strips our execution key from your contract. Your funds remain in your custody because we never hold them.",
    footerTag: "Permanent revocation · zero residue",
    theme: {
      bg: "bg-gradient-to-br from-cyan-950 via-sky-950 to-zinc-950",
      border: "border-cyan-500/50",
      text: "text-cyan-50",
      subText: "text-cyan-200/80",
      pillBg: "bg-cyan-500/20 border border-cyan-400/30",
      pillText: "text-cyan-300",
      artAccent: "sonar",
    },
  },
];

export function LimitsStackedCards() {
  const [order, setOrder] = useState<number[]>([0, 1, 2, 3, 4, 5]);
  const [shufflingCard, setShufflingCard] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const isTransitioning = useRef(false);

  const shuffleNext = useCallback(() => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;

    const currentFront = order[0];
    setShufflingCard(currentFront);

    // Step 1: Top card slides up and begins moving behind
    setTimeout(() => {
      setOrder((prev) => [...prev.slice(1), prev[0]]);
      setShufflingCard(null);

      // Cooldown before next transition can be triggered
      setTimeout(() => {
        isTransitioning.current = false;
      }, 400);
    }, 380);
  }, [order]);

  const shufflePrev = useCallback(() => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;

    setOrder((prev) => [prev[prev.length - 1], ...prev.slice(0, prev.length - 1)]);
    setTimeout(() => {
      isTransitioning.current = false;
    }, 400);
  }, []);

  // Auto-shuffle cycle every 3.8s when not hovered
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      shuffleNext();
    }, 3800);

    return () => clearInterval(interval);
  }, [isPaused, shuffleNext]);

  const activeCard = LIMIT_CARDS[order[0]];

  return (
    <div
      className="relative flex flex-col items-center justify-center w-full py-6 select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Visual stage for stacked cards */}
      <div className="relative w-full max-w-[340px] sm:max-w-[420px] md:max-w-[460px] h-[370px] sm:h-[410px] md:h-[440px] flex items-end justify-center">
        {order.map((cardIndex, stackPos) => {
          const card = LIMIT_CARDS[cardIndex];
          const isFront = stackPos === 0;
          const isLeaving = shufflingCard === cardIndex;

          // How far back in the stack this card sits (0 = front, 1 = behind, 2 = further behind, etc.)
          // Cards are stepped vertically upwards so their headers peek out nicely
          const yOffset = isLeaving ? -90 : -stackPos * 24;
          const scale = isLeaving ? 1.04 : 1 - stackPos * 0.045;
          const zIndex = isLeaving ? 60 : 50 - stackPos * 10;
          const opacity = isLeaving ? 0.95 : Math.max(0.4, 1 - stackPos * 0.14);
          const rotation = isLeaving ? 2 : (stackPos % 2 === 1 ? 0.8 : -0.8) * Math.min(stackPos, 3);

          return (
            <div
              key={card.id}
              onClick={() => {
                if (isFront) {
                  shuffleNext();
                } else {
                  // Bring this clicked card to front
                  const clickedIdxInOrder = order.indexOf(cardIndex);
                  if (clickedIdxInOrder > 0) {
                    setOrder((prev) => [
                      ...prev.slice(clickedIdxInOrder),
                      ...prev.slice(0, clickedIdxInOrder),
                    ]);
                  }
                }
              }}
              style={{
                transform: `translateY(${yOffset}px) scale(${scale}) rotate(${rotation}deg)`,
                zIndex,
                opacity,
                transition: isLeaving
                  ? "transform 360ms cubic-bezier(0.4, 0, 0.2, 1), opacity 360ms ease"
                  : "all 480ms cubic-bezier(0.25, 1, 0.5, 1)",
              }}
              className={`absolute bottom-0 w-full h-[300px] sm:h-[330px] md:h-[350px] rounded-[26px] p-6 sm:p-7 shadow-2xl cursor-pointer ${card.theme.bg} border ${card.theme.border} overflow-hidden backdrop-blur-md transition-shadow hover:shadow-cyan-500/10`}
            >
              {/* Card visual badge / metallic texture accent */}
              {card.theme.artAccent === "metallic" && (
                <div className="pointer-events-none absolute -right-8 -top-8 w-44 h-44 rounded-full bg-gradient-to-br from-zinc-100/20 via-zinc-400/10 to-transparent blur-xl" />
              )}
              {card.theme.artAccent === "geometric" && (
                <div className="pointer-events-none absolute -right-12 -top-12 w-48 h-48 opacity-20">
                  <svg viewBox="0 0 100 100" className="w-full h-full fill-white">
                    <path d="M50 0 L100 50 L50 100 L0 50 Z" />
                  </svg>
                </div>
              )}
              {card.theme.artAccent === "schwarz" && (
                <div className="pointer-events-none absolute right-6 top-6 text-zinc-950/15 font-black text-4xl tracking-tighter uppercase font-mono">
                  LOCK
                </div>
              )}
              {card.theme.artAccent === "pattern" && (
                <div className="pointer-events-none absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:14px_14px]" />
              )}

              {/* Card top bar: Tag and Pill */}
              <div className="relative z-10 flex items-center justify-between">
                <span className={`font-mono text-[11px] uppercase tracking-[0.2em] font-semibold ${card.theme.pillText}`}>
                  {card.tag}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-mono uppercase tracking-wider font-semibold ${card.theme.pillBg} ${card.theme.pillText}`}
                >
                  {card.badge}
                </span>
              </div>

              {/* Card Title & Metric */}
              <div className="relative z-10 mt-5 sm:mt-6">
                <h3 className={`text-xl sm:text-2xl font-bold tracking-tight ${card.theme.text}`}>
                  {card.name}
                </h3>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-2xl sm:text-3xl font-mono font-bold tracking-tight ${card.theme.text}`}>
                    {card.metric}
                  </span>
                  <span className={`text-xs font-mono ${card.theme.subText}`}>
                    · {card.metricSub}
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <p className={`relative z-10 mt-3 sm:mt-4 text-xs sm:text-sm leading-relaxed ${card.theme.subText}`}>
                {card.body}
              </p>

              {/* Card bottom footer */}
              <div className={`relative z-10 mt-5 pt-3 border-t ${card.theme.border} flex items-center justify-between`}>
                <span className={`font-mono text-[10px] tracking-wider uppercase ${card.theme.subText} flex items-center gap-1.5`}>
                  <ShieldCheck size={14} weight="bold" />
                  {card.footerTag}
                </span>
                {isFront && (
                  <span className={`text-[11px] font-mono flex items-center gap-1 font-medium ${card.theme.text} opacity-80`}>
                    Tap to shuffle &rarr;
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Control bar below stack */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-between w-full max-w-[340px] sm:max-w-[420px] md:max-w-[460px] gap-4 px-2">
        <div className="flex items-center gap-2">
          {LIMIT_CARDS.map((c, i) => {
            const isActive = order[0] === i;
            return (
              <button
                key={c.id}
                onClick={() => {
                  const targetIdx = order.indexOf(i);
                  if (targetIdx > 0) {
                    setOrder((prev) => [...prev.slice(targetIdx), ...prev.slice(0, targetIdx)]);
                  }
                }}
                className={`h-2 rounded-full transition-all duration-300 ${
                  isActive ? "w-8 bg-accent" : "w-2 bg-rule hover:bg-edge"
                }`}
                aria-label={`Jump to ${c.name}`}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-ink-3">
            {String(order[0] + 1).padStart(2, "0")} / {String(LIMIT_CARDS.length).padStart(2, "0")} · {activeCard.name}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={shufflePrev}
              className="p-1.5 rounded-full border border-rule hover:bg-surface transition-colors text-ink-2 hover:text-ink"
              aria-label="Previous card"
            >
              <CaretLeft size={16} weight="bold" />
            </button>
            <button
              onClick={shuffleNext}
              className="p-1.5 rounded-full border border-rule hover:bg-surface transition-colors text-ink-2 hover:text-ink"
              aria-label="Next card"
            >
              <CaretRight size={16} weight="bold" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
