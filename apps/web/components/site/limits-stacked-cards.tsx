"use client";

import { useEffect, useState, useRef, useCallback } from "react";

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
  };
  renderIllustration: () => React.ReactNode;
}

const LIMIT_CARDS: LimitCard[] = [
  {
    id: "cap",
    tag: "LIMIT 01",
    badge: "Hard Stop",
    name: "Per-order cap",
    metric: "$50 USDC",
    metricSub: "Max per individual echo",
    body: "The most a single echo can commit, regardless of whether the trader you follow decides to wager $500 or $50,000.",
    footerTag: "EchoAccount.sol · Bytecode Verified",
    theme: {
      bg: "bg-gradient-to-br from-[#121214] via-[#09090b] to-[#040405]",
      border: "border-zinc-700/80 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)]",
      text: "text-white",
      subText: "text-zinc-300",
      pillBg: "bg-white/10 border border-white/20",
      pillText: "text-zinc-200",
    },
    // Liquid Chrome 3D Fluid Art (mirrors riCO chrome sculpture in uploaded_media_1789113831311.png)
    renderIllustration: () => (
      <div className="w-full h-24 my-2 flex items-center justify-between relative px-2">
        <span className="font-sans text-[11px] uppercase tracking-widest text-zinc-500 font-bold">
          riCO
        </span>
        <div className="relative w-40 h-20 flex items-center justify-center">
          <svg viewBox="0 0 160 80" fill="none" className="w-full h-full drop-shadow-[0_10px_20px_rgba(255,255,255,0.15)]">
            <defs>
              <linearGradient id="chromeGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="25%" stopColor="#71717a" />
                <stop offset="45%" stopColor="#18181b" />
                <stop offset="65%" stopColor="#e4e4e7" />
                <stop offset="85%" stopColor="#a1a1aa" />
                <stop offset="100%" stopColor="#27272a" />
              </linearGradient>
              <linearGradient id="chromeGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.6" />
              </linearGradient>
            </defs>
            {/* Liquid chrome biomorphic body */}
            <path
              d="M30 40 C 25 15, 60 10, 80 25 C 105 10, 140 20, 135 45 C 130 65, 95 75, 75 58 C 55 70, 25 60, 30 40 Z"
              fill="url(#chromeGrad1)"
            />
            {/* Liquid chrome specular crests */}
            <path
              d="M45 35 C 55 22, 85 24, 100 32 C 120 28, 125 40, 118 48 C 105 40, 75 35, 55 46 C 45 44, 42 38, 45 35 Z"
              fill="url(#chromeGrad2)"
              opacity="0.9"
            />
            <ellipse cx="68" cy="30" rx="14" ry="4" fill="#ffffff" opacity="0.8" />
            <ellipse cx="108" cy="42" rx="10" ry="3" fill="#ffffff" opacity="0.75" />
          </svg>
        </div>
        <span className="font-sans text-[11px] uppercase tracking-widest text-zinc-500 font-bold">
          YR/25
        </span>
      </div>
    ),
  },
  {
    id: "budget",
    tag: "LIMIT 02",
    badge: "Ceiling",
    name: "Lifetime budget",
    metric: "$1,000 USDC",
    metricSub: "Total collateral ceiling",
    body: "The cumulative maximum collateral committed across every echo. Once reached, trading halts until you replenish.",
    footerTag: "Smart Account Ceiling · Enforced on EVM",
    theme: {
      bg: "bg-gradient-to-br from-[#e11d48] via-[#be123c] to-[#9f1239]",
      border: "border-rose-400/50 shadow-[0_25px_60px_-15px_rgba(225,29,72,0.4)]",
      text: "text-white",
      subText: "text-rose-100",
      pillBg: "bg-white/20 border border-white/30",
      pillText: "text-white",
    },
    // Fluid Abstract White Emblem (mirrors the red card emblem in uploaded_media_1789113831311.png)
    renderIllustration: () => (
      <div className="w-full h-24 my-2 flex items-center justify-center relative">
        <svg viewBox="0 0 120 70" fill="none" className="w-32 h-18 drop-shadow-[0_8px_16px_rgba(0,0,0,0.3)]">
          <path
            d="M20 45 C 10 30, 25 15, 45 20 C 60 25, 70 15, 85 18 C 105 22, 110 42, 95 55 C 80 62, 65 52, 50 56 C 35 60, 25 55, 20 45 Z"
            fill="#ffffff"
          />
          <ellipse cx="62" cy="38" rx="16" ry="7" fill="#be123c" />
        </svg>
      </div>
    ),
  },
  {
    id: "expiry",
    tag: "LIMIT 03",
    badge: "Self-Destruct",
    name: "Expiry date",
    metric: "30 Days",
    metricSub: "Authority lapses automatically",
    body: "The exact timestamp our execution key dies. Authority lapses automatically on chain unless deliberately renewed.",
    footerTag: "Timestamp Lock · block.timestamp",
    theme: {
      bg: "bg-gradient-to-br from-[#facc15] via-[#eab308] to-[#ca8a04]",
      border: "border-yellow-200/60 shadow-[0_25px_60px_-15px_rgba(234,179,8,0.4)]",
      text: "text-zinc-950",
      subText: "text-zinc-900/90",
      pillBg: "bg-black/15 border border-black/25",
      pillText: "text-zinc-950",
    },
    // Schwarz Minimalist Geometric Art (mirrors Schwarz card in uploaded_media_1789113831311.png)
    renderIllustration: () => (
      <div className="w-full h-24 my-2 flex flex-col items-center justify-center relative">
        <span className="font-sans text-3xl sm:text-4xl font-black tracking-tight text-zinc-950">
          Schwarz
        </span>
        <div className="w-24 h-1 bg-zinc-950 mt-1.5 rounded-full" />
      </div>
    ),
  },
  {
    id: "pause",
    tag: "LIMIT 04",
    badge: "Instant Freeze",
    name: "Pause switch",
    metric: "1 Block",
    metricSub: "Zero-latency circuit breaker",
    body: "Immediate on-chain halt. Takes effect on the very next block without asking our servers or waiting for permissions.",
    footerTag: "Atomic Circuit Breaker · 1 Transaction",
    theme: {
      bg: "bg-gradient-to-br from-[#064e3b] via-[#065f46] to-[#022c22]",
      border: "border-emerald-400/50 shadow-[0_25px_60px_-15px_rgba(5,150,105,0.35)]",
      text: "text-emerald-50",
      subText: "text-emerald-100/90",
      pillBg: "bg-emerald-400/20 border border-emerald-300/30",
      pillText: "text-emerald-200",
    },
    // Isometric Security Grid Graphic (mirrors green pattern card in uploaded_media_1789113831311.png)
    renderIllustration: () => (
      <div className="w-full h-24 my-2 flex items-center justify-center relative">
        <svg viewBox="0 0 140 70" fill="none" className="w-36 h-18 opacity-85">
          <path d="M70 10 L120 35 L70 60 L20 35 Z" stroke="#34d399" strokeWidth="1.6" fill="#065f46" />
          <path d="M70 20 L105 35 L70 50 L35 35 Z" stroke="#6ee7b7" strokeWidth="1.2" fill="#047857" />
          <line x1="70" y1="20" x2="70" y2="50" stroke="#a7f3d0" strokeWidth="1.5" />
          <line x1="35" y1="35" x2="105" y2="35" stroke="#a7f3d0" strokeWidth="1.5" />
        </svg>
      </div>
    ),
  },
  {
    id: "series",
    tag: "LIMIT 05",
    badge: "Cadence Guard",
    name: "Series approval",
    metric: "BTC & ETH",
    metricSub: "Hourly windows cadence",
    body: "Authorise specific series cadence once. New windows roll over automatically while unapproved markets revert on chain.",
    footerTag: "Series Allowlist · Strict Boundary",
    theme: {
      bg: "bg-gradient-to-br from-[#4f46e5] via-[#4338ca] to-[#312e81]",
      border: "border-indigo-400/50 shadow-[0_25px_60px_-15px_rgba(79,70,229,0.35)]",
      text: "text-white",
      subText: "text-indigo-100",
      pillBg: "bg-white/20 border border-white/30",
      pillText: "text-white",
    },
    // Fluid Lavender Ribbon Wave Illustration
    renderIllustration: () => (
      <div className="w-full h-24 my-2 flex items-center justify-center relative">
        <svg viewBox="0 0 140 70" fill="none" className="w-36 h-18">
          <path
            d="M10 45 C 30 15, 60 55, 90 25 C 110 5, 130 35, 135 45"
            stroke="#a5b4fc"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M15 52 C 35 22, 65 62, 95 32 C 115 12, 132 38, 137 50"
            stroke="#c7d2fe"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            opacity="0.7"
          />
        </svg>
      </div>
    ),
  },
  {
    id: "revoke",
    tag: "LIMIT 06",
    badge: "Burn Key",
    name: "Revoke key",
    metric: "Permanent",
    metricSub: "Instant authority strip",
    body: "Irrevocably strips our execution key from your contract. Your funds remain in your custody because we never hold them.",
    footerTag: "Permanent Revocation · Zero Residue",
    theme: {
      bg: "bg-gradient-to-br from-[#083344] via-[#0e4860] to-[#041a24]",
      border: "border-cyan-400/50 shadow-[0_25px_60px_-15px_rgba(6,182,212,0.35)]",
      text: "text-cyan-50",
      subText: "text-cyan-100/90",
      pillBg: "bg-cyan-400/20 border border-cyan-300/30",
      pillText: "text-cyan-200",
    },
    // Quantum Orbital Ring Illustration
    renderIllustration: () => (
      <div className="w-full h-24 my-2 flex items-center justify-center relative">
        <svg viewBox="0 0 120 70" fill="none" className="w-32 h-18">
          <ellipse cx="60" cy="35" rx="45" ry="18" stroke="#22d3ee" strokeWidth="1.6" strokeDasharray="6 3" />
          <ellipse cx="60" cy="35" rx="28" ry="28" stroke="#67e8f9" strokeWidth="1.4" opacity="0.8" />
          <circle cx="60" cy="35" r="7" fill="#67e8f9" />
          <circle cx="95" cy="40" r="3" fill="#ffffff" />
        </svg>
      </div>
    ),
  },
];

export function LimitsStackedCards() {
  const [order, setOrder] = useState<number[]>([0, 1, 2, 3, 4, 5]);
  const [shufflingCard, setShufflingCard] = useState<number | null>(null);
  const isTransitioning = useRef(false);

  // Snappy "POP" shuffle: lifts up dramatically with overshoot, drops behind, and settles
  const shuffleNext = useCallback(() => {
    if (isTransitioning.current) return;
    isTransitioning.current = true;

    const currentFront = order[0];
    setShufflingCard(currentFront);

    // Pop phase: top card springs up and outwards
    setTimeout(() => {
      setOrder((prev) => [...prev.slice(1), prev[0]]);
      setShufflingCard(null);

      setTimeout(() => {
        isTransitioning.current = false;
      }, 350);
    }, 420);
  }, [order]);

  // Continuously shuffles on its own (auto-cycles every 3.2 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      shuffleNext();
    }, 3200);

    return () => clearInterval(timer);
  }, [shuffleNext]);

  return (
    <div className="relative flex flex-col items-center justify-center w-full py-8 select-none">
      {/* Visual stage for stacked cards */}
      <div
        onClick={shuffleNext}
        className="relative w-full max-w-[340px] sm:max-w-[420px] md:max-w-[460px] h-[390px] sm:h-[430px] md:h-[460px] flex items-end justify-center cursor-pointer group"
      >
        {order.map((cardIndex, stackPos) => {
          const card = LIMIT_CARDS[cardIndex];
          const isFront = stackPos === 0;
          const isPopping = shufflingCard === cardIndex;

          // Stepped vertical card stack geometry:
          // Cards step upwards and scale slightly down so their headers peek through cleanly
          const yOffset = isPopping ? -130 : -stackPos * 26;
          const scale = isPopping ? 1.08 : 1 - stackPos * 0.04;
          const zIndex = isPopping ? 70 : 50 - stackPos * 8;
          const opacity = isPopping ? 0.95 : Math.max(0.4, 1 - stackPos * 0.12);
          const rotation = isPopping ? -4 : (stackPos % 2 === 1 ? 1 : -1) * Math.min(stackPos * 0.8, 2.5);

          return (
            <div
              key={card.id}
              style={{
                transform: `translateY(${yOffset}px) scale(${scale}) rotate(${rotation}deg)`,
                zIndex,
                opacity,
                transition: isPopping
                  ? "transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 420ms ease"
                  : "transform 500ms cubic-bezier(0.25, 1, 0.5, 1), opacity 500ms ease",
              }}
              className={`absolute bottom-0 w-full h-[320px] sm:h-[350px] md:h-[370px] rounded-[30px] p-6 sm:p-7 flex flex-col justify-between ${card.theme.bg} border ${card.theme.border} backdrop-blur-md overflow-hidden`}
            >
              {/* Card Top Header: Tag and Badge Pill */}
              <div className="relative z-10 flex items-center justify-between">
                <span className="font-sans text-xs uppercase tracking-widest font-bold text-white/80">
                  {card.tag}
                </span>
                <span
                  className={`font-sans rounded-full px-3 py-1 text-[11px] font-bold tracking-wider uppercase ${card.theme.pillBg} ${card.theme.pillText}`}
                >
                  {card.badge}
                </span>
              </div>

              {/* Bespoke Illustration for this Card (No generic icons!) */}
              <div className="relative z-10 my-auto">
                {card.renderIllustration()}
              </div>

              {/* Card Content in pure General Sans */}
              <div className="relative z-10">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className={`font-sans text-xl sm:text-2xl font-bold tracking-tight ${card.theme.text}`}>
                    {card.name}
                  </h3>
                  <span className={`font-sans text-base sm:text-lg font-bold ${card.theme.text}`}>
                    {card.metric}
                  </span>
                </div>

                <p className={`font-sans mt-2 text-xs sm:text-sm leading-relaxed ${card.theme.subText}`}>
                  {card.body}
                </p>
              </div>

              {/* Card Bottom Security Badge in General Sans */}
              <div className="relative z-10 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-sans font-semibold opacity-75">
                <span>{card.footerTag}</span>
                {isFront && <span className="opacity-90">Tap to pop &rarr;</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
