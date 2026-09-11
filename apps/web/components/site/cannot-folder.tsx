"use client";

import { useState } from "react";
import Link from "next/link";

interface CannotCard {
  id: string;
  tag: string;
  title: string;
  desc: string;
  cardTheme: {
    bg: string;
    border: string;
    text: string;
    subText: string;
    badgeBg: string;
    badgeText: string;
    chipColor: string;
  };
}

const CANNOT_CARDS: CannotCard[] = [
  {
    id: "collateral",
    tag: "RESTRICTION 01",
    title: "Withdraw your collateral",
    desc: "Only your wallet address has withdrawal authority. We cannot touch your principal under any circumstance.",
    cardTheme: {
      bg: "bg-gradient-to-br from-[#1a1b24] via-[#12131a] to-[#0a0a0f]",
      border: "border-purple-500/30 hover:border-purple-400/60",
      text: "text-white",
      subText: "text-zinc-300",
      badgeBg: "bg-purple-500/15 border border-purple-400/30",
      badgeText: "text-purple-300",
      chipColor: "#a855f7",
    },
  },
  {
    id: "outcomes",
    tag: "RESTRICTION 02",
    title: "Withdraw your outcome tokens",
    desc: "Resolved positions and settled payout tokens go strictly into your own EchoAccount. No middleman custody.",
    cardTheme: {
      bg: "bg-gradient-to-br from-[#102217] via-[#0b1810] to-[#060e0a]",
      border: "border-emerald-500/30 hover:border-emerald-400/60",
      text: "text-white",
      subText: "text-emerald-100/80",
      badgeBg: "bg-emerald-500/15 border border-emerald-400/30",
      badgeText: "text-emerald-300",
      chipColor: "#34d399",
    },
  },
  {
    id: "caps",
    tag: "RESTRICTION 03",
    title: "Raise the caps you set",
    desc: "Your per-order and lifetime budgets are immutable bytecode limits. Any oversized trade reverts on chain.",
    cardTheme: {
      bg: "bg-gradient-to-br from-[#241710] via-[#1a100a] to-[#0f0905]",
      border: "border-amber-500/30 hover:border-amber-400/60",
      text: "text-white",
      subText: "text-amber-100/80",
      badgeBg: "bg-amber-500/15 border border-amber-400/30",
      badgeText: "text-amber-300",
      chipColor: "#fbbf24",
    },
  },
  {
    id: "expiry",
    tag: "RESTRICTION 04",
    title: "Extend its own expiry",
    desc: "Authority automatically ceases on your selected expiry block. Only your cryptographic signature can renew it.",
    cardTheme: {
      bg: "bg-gradient-to-br from-[#101b2a] via-[#0a111b] to-[#05080f]",
      border: "border-sky-500/30 hover:border-sky-400/60",
      text: "text-white",
      subText: "text-sky-100/80",
      badgeBg: "bg-sky-500/15 border border-sky-400/30",
      badgeText: "text-sky-300",
      chipColor: "#38bdf8",
    },
  },
  {
    id: "series",
    tag: "RESTRICTION 05",
    title: "Add a market you did not allow",
    desc: "Echoes only execute into pools inside your approved cadence (e.g. 1h BTC). Any unapproved market call fails.",
    cardTheme: {
      bg: "bg-gradient-to-br from-[#261019] via-[#1a0a10] to-[#0f0509]",
      border: "border-rose-500/30 hover:border-rose-400/60",
      text: "text-white",
      subText: "text-rose-100/80",
      badgeBg: "bg-rose-500/15 border border-rose-400/30",
      badgeText: "text-rose-300",
      chipColor: "#fb7185",
    },
  },
  {
    id: "pause",
    tag: "RESTRICTION 06",
    title: "Act after you pause the account",
    desc: "One single on-chain transaction immediately freezes all copy-trading rights on the very next block.",
    cardTheme: {
      bg: "bg-gradient-to-br from-[#241a10] via-[#181109] to-[#0e0904]",
      border: "border-orange-500/30 hover:border-orange-400/60",
      text: "text-white",
      subText: "text-orange-100/80",
      badgeBg: "bg-orange-500/15 border border-orange-400/30",
      badgeText: "text-orange-300",
      chipColor: "#fb923c",
    },
  },
  {
    id: "validity",
    tag: "RESTRICTION 07",
    title: "Act after the expiry date passes",
    desc: "The smart contract validates block timestamps natively. Expired permissions reject execution instantly.",
    cardTheme: {
      bg: "bg-gradient-to-br from-[#0c2222] via-[#071616] to-[#030d0d]",
      border: "border-teal-500/30 hover:border-teal-400/60",
      text: "text-white",
      subText: "text-teal-100/80",
      badgeBg: "bg-teal-500/15 border border-teal-400/30",
      badgeText: "text-teal-300",
      chipColor: "#2dd4bf",
    },
  },
  {
    id: "revoke",
    tag: "RESTRICTION 08",
    title: "Act after you revoke the key",
    desc: "Permanently strips our execution key from your contract with zero residual permissions and zero fee.",
    cardTheme: {
      bg: "bg-gradient-to-br from-[#1c1c1f] via-[#141416] to-[#0c0c0d]",
      border: "border-zinc-500/30 hover:border-zinc-400/60",
      text: "text-white",
      subText: "text-zinc-300",
      badgeBg: "bg-zinc-500/15 border border-zinc-400/30",
      badgeText: "text-zinc-300",
      chipColor: "#a1a1aa",
    },
  },
];

export function CannotFolder() {
  const [isHovered, setIsHovered] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isFolderHovered, setIsFolderHovered] = useState(false);

  // Both hover and click supported: clicking locks the view open so users are never stuck!
  const isRevealed = isLocked || isHovered;

  const toggleLock = () => {
    setIsLocked((prev) => !prev);
  };

  return (
    <div className="mt-14 w-full flex flex-col items-center">
      {/* ── ON TOP: The 2x4 Grid of Cards that Flings OUT of the Folder ── */}
      <div
        className={`w-full max-w-5xl transition-all duration-700 ease-[cubic-bezier(0.34,1.4,0.64,1)] ${
          isRevealed
            ? "opacity-100 translate-y-0 scale-100 max-h-[2600px] mb-12 pointer-events-auto"
            : "opacity-0 translate-y-24 scale-95 max-h-0 overflow-hidden pointer-events-none mb-0"
        }`}
      >
        <div className="text-center mb-7">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-xs font-sans font-semibold mb-2">
            <span>Cards flung out from EchoAccount folder</span>
            {isLocked && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200">Locked View</span>}
          </div>
          <h4 className="font-sans text-2xl sm:text-3xl font-bold text-white tracking-tight">
            All 8 on-chain restrictions deployed above
          </h4>
          <p className="font-sans text-xs sm:text-sm text-zinc-400 mt-1.5">
            Click the folder below to pin or tuck the cards back in anytime.
          </p>
        </div>

        {/* 2x4 Grid of Realistically Sized Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 px-4">
          {CANNOT_CARDS.map((card, idx) => (
            <div
              key={card.id}
              style={{
                aspectRatio: "1.65 / 1",
                transitionDelay: `${idx * 40}ms`,
              }}
              className={`rounded-2xl p-5 sm:p-6 flex flex-col justify-between shadow-2xl border ${card.cardTheme.border} ${card.cardTheme.bg} transition-all duration-300 hover:scale-[1.02] hover:shadow-cyan-500/10 relative overflow-hidden`}
            >
              {/* Subtle background card watermark */}
              <div className="pointer-events-none absolute -right-6 -bottom-6 opacity-5 font-sans font-black text-7xl text-white select-none">
                0{idx + 1}
              </div>

              {/* Card Header: CANNOT pill & Echonome Chip illustration */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-sans text-[11px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-md bg-white/10 text-white">
                    CANNOT
                  </span>
                  <span
                    className={`font-sans text-[11px] font-semibold px-2.5 py-1 rounded-md ${card.cardTheme.badgeBg} ${card.cardTheme.badgeText}`}
                  >
                    {card.tag}
                  </span>
                </div>

                {/* Echonome Illustrated Security Chip */}
                <svg viewBox="0 0 32 24" fill="none" className="w-8 h-6 opacity-85">
                  <rect
                    x="1"
                    y="1"
                    width="30"
                    height="22"
                    rx="4"
                    fill="#1e2029"
                    stroke={card.cardTheme.chipColor}
                    strokeWidth="1.2"
                  />
                  <line
                    x1="1"
                    y1="8"
                    x2="31"
                    y2="8"
                    stroke={card.cardTheme.chipColor}
                    strokeWidth="0.8"
                    opacity="0.6"
                  />
                  <line
                    x1="1"
                    y1="16"
                    x2="31"
                    y2="16"
                    stroke={card.cardTheme.chipColor}
                    strokeWidth="0.8"
                    opacity="0.6"
                  />
                  <line
                    x1="11"
                    y1="8"
                    x2="11"
                    y2="16"
                    stroke={card.cardTheme.chipColor}
                    strokeWidth="0.8"
                    opacity="0.6"
                  />
                  <line
                    x1="21"
                    y1="8"
                    x2="21"
                    y2="16"
                    stroke={card.cardTheme.chipColor}
                    strokeWidth="0.8"
                    opacity="0.6"
                  />
                </svg>
              </div>

              {/* Card Title & Desc in General Sans */}
              <div className="my-auto pt-2">
                <h5 className={`font-sans text-lg sm:text-xl font-bold tracking-tight ${card.cardTheme.text}`}>
                  {card.title}
                </h5>
                <p className={`font-sans mt-2 text-xs sm:text-sm leading-relaxed ${card.cardTheme.subText}`}>
                  {card.desc}
                </p>
              </div>

              {/* Card Footer: Echonome On-Chain certification */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] font-sans text-zinc-400">
                <span className="flex items-center gap-1.5 font-medium">
                  {/* Small shield illustration */}
                  <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 text-accent">
                    <path
                      d="M8 1.5L2.5 3.5V7.5C2.5 11 5 13.8 8 14.5C11 13.8 13.5 11 13.5 7.5V3.5L8 1.5Z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <path d="M6 7.5L7.5 9L10.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  <span>EchoAccount · Bytecode Enforced</span>
                </span>
                <span className="font-sans text-[10px] tracking-widest text-zinc-500 font-bold uppercase">
                  ECHONOME
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── AT THE BOTTOM: The Leather Folder Pocket ── */}
      <div
        className="relative w-full max-w-[340px] sm:max-w-[420px] md:max-w-[480px] flex flex-col items-center select-none"
        onMouseEnter={() => setIsFolderHovered(true)}
        onMouseLeave={() => setIsFolderHovered(false)}
      >
        {/* Animated Squiggle Thread decoration across the folder top when folder is hovered */}
        <div
          className={`absolute -top-6 inset-x-4 h-8 flex items-center justify-center pointer-events-none transition-all duration-500 ${
            isFolderHovered ? "opacity-100 scale-105" : "opacity-0 scale-95"
          }`}
        >
          <svg
            viewBox="0 0 320 28"
            fill="none"
            className="w-full h-full text-accent"
          >
            <path
              d="M10 14 Q 30 4, 50 14 T 90 14 T 130 14 T 170 14 T 210 14 T 250 14 T 290 14 T 310 14"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeDasharray="6 4"
              className={isFolderHovered ? "animate-[dash_1.5s_linear_infinite]" : ""}
            />
          </svg>
        </div>

        {/* The Leather Folder Card Pocket */}
        <div
          onClick={toggleLock}
          className={`relative w-full h-[320px] sm:h-[350px] md:h-[370px] rounded-[36px] sm:rounded-[42px] bg-gradient-to-b from-[#183420] via-[#122818] to-[#0a160d] border-2 border-[#2b5834] shadow-[0_28px_60px_-15px_rgba(0,0,0,0.85)] p-6 sm:p-8 flex flex-col justify-between items-center text-center overflow-hidden transition-all duration-300 cursor-pointer ${
            isRevealed ? "shadow-[0_0_50px_rgba(16,185,129,0.2)] border-emerald-500/60" : "hover:border-[#387044]"
          }`}
        >
          {/* Outer Saddle Stitched Seam */}
          <div className="pointer-events-none absolute inset-3 sm:inset-3.5 rounded-[30px] sm:rounded-[36px] border-2 border-dashed border-emerald-500/20" />

          {/* Pocket Mouth Curved Cutout Scoop */}
          <div className="absolute top-0 inset-x-8 h-8 flex justify-center z-30">
            <svg
              viewBox="0 0 200 30"
              fill="none"
              preserveAspectRatio="none"
              className="w-48 sm:w-56 h-7 text-[#0a160d]"
            >
              <path
                d="M 0 0 C 40 28, 160 28, 200 0 Z"
                fill="currentColor"
                stroke="#2b5834"
                strokeWidth="1.5"
              />
            </svg>
          </div>

          {/* 
            POUCH INTERIOR:
            When NOT revealed: Cards are tucked in (Echonome branded, NOT PayPal!).
            When REVEALED: The cards fling UPWARDS out of the folder, and the folder is visibly EMPTY!
          */}
          <div className="relative z-10 w-full pt-4 flex flex-col items-center">
            {/* Tucked state: 3 Echonome branded cards */}
            <div
              className={`relative w-full h-16 flex justify-center items-end transition-all duration-500 ease-out ${
                isRevealed
                  ? "opacity-0 -translate-y-24 scale-75 pointer-events-none"
                  : "opacity-100 translate-y-0 scale-100"
              }`}
            >
              {/* Card 3 (Purple Echonome Series) */}
              <div className="absolute bottom-6 w-[82%] h-10 rounded-t-xl bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] border-t border-x border-purple-300/60 shadow-md flex items-center justify-between px-4 text-[11px] font-sans font-semibold text-white">
                <span className="font-bold tracking-wider">ECHONOME</span>
                <span>Series Allowlist</span>
              </div>
              {/* Card 2 (Green Echonome Cap) */}
              <div className="absolute bottom-3 w-[88%] h-10 rounded-t-xl bg-gradient-to-r from-[#059669] to-[#10b981] border-t border-x border-emerald-300/60 shadow-lg flex items-center justify-between px-4 text-[11px] font-sans font-semibold text-white">
                <span className="font-bold tracking-wider">ECHONOME</span>
                <span>$50 Max Committal</span>
              </div>
              {/* Card 1 (Obsidian Echonome EchoAccount) */}
              <div className="absolute bottom-0 w-[94%] h-10 rounded-t-xl bg-gradient-to-r from-[#27272a] via-[#18181b] to-[#09090b] border-t border-x border-zinc-500 shadow-xl flex items-center justify-between px-4 text-[11px] font-sans font-semibold text-white">
                <span className="font-bold tracking-wider text-accent">ECHONOME</span>
                <span>Sole Custody</span>
              </div>
            </div>

            {/* Empty state: Visibly empty pouch interior when cards are flung out */}
            <div
              className={`absolute inset-x-0 top-6 flex flex-col items-center justify-center transition-all duration-500 ease-out ${
                isRevealed
                  ? "opacity-100 translate-y-0 scale-100"
                  : "opacity-0 translate-y-6 scale-90 pointer-events-none"
              }`}
            >
              <div className="w-48 py-2 px-3 rounded-lg bg-emerald-950/60 border border-dashed border-emerald-500/30 text-center">
                <p className="font-sans text-[11px] font-bold text-emerald-400 uppercase tracking-widest">
                  Pouch Empty
                </p>
                <p className="font-sans text-[10px] text-emerald-200/70 mt-0.5">
                  8 cards flung out above
                </p>
              </div>
            </div>
          </div>

          {/* Center Headline */}
          <div className="relative z-10 my-auto px-2">
            <h3 className="font-sans text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
              In Echonome your key cannot..
            </h3>
            <p className="font-sans mt-2 text-xs sm:text-sm text-emerald-300/85 font-medium">
              {isRevealed
                ? "Cards flung out above — click to tuck cards back in"
                : "Hover or click to fling cards out of the folder"}
            </p>
          </div>

          {/* Reveal Button with Custom Illustrated Eye (Hover & Click supported!) */}
          <div className="relative z-20 pb-1">
            <button
              type="button"
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              onClick={(e) => {
                e.stopPropagation();
                toggleLock();
              }}
              className={`flex items-center justify-center gap-2.5 rounded-full border px-6 py-2.5 text-xs font-sans font-semibold tracking-wide transition-all duration-200 shadow-lg cursor-pointer ${
                isLocked
                  ? "bg-emerald-500 text-black border-emerald-400 shadow-emerald-500/30"
                  : "bg-[#102414] hover:bg-[#183820] text-emerald-300 border-emerald-400/40"
              }`}
              aria-label={isRevealed ? "Tuck restrictions into folder" : "Fling restrictions out"}
            >
              {/* Custom SVG Eye Illustration */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className={`w-4 h-4 transition-transform ${isLocked ? "text-black" : "text-emerald-400"}`}
              >
                <path
                  d="M2 12C3.8 7.5 7.5 4.5 12 4.5C16.5 4.5 20.2 7.5 22 12C20.2 16.5 16.5 19.5 12 19.5C7.5 19.5 3.8 16.5 2 12Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
              </svg>
              <span>
                {isLocked ? "Pinned open · Click to close" : isRevealed ? "Click to lock open" : "Hover or click to reveal"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* CTA Button for Trade Feeds (No stock icons, clean vector arrow) */}
      <div className="mt-14 flex flex-col items-center text-center gap-3">
        <Link
          href="/feed"
          className="inline-flex items-center justify-center gap-3 rounded-full bg-accent px-9 py-4 text-sm font-sans font-bold text-plane transition-all duration-200 hover:brightness-110 hover:scale-[1.02] shadow-xl shadow-accent/15 group"
        >
          <span>Explore live trade feed</span>
          {/* Custom Illustrated Arrow */}
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="w-4 h-4 text-plane transition-transform group-hover:translate-x-1"
          >
            <path
              d="M3 8H13M13 8L8.5 3.5M13 8L8.5 12.5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <p className="font-sans text-xs text-ink-3">
          Observe live forecaster fills, historical calibration, and on-chain echoes with zero delay.
        </p>
      </div>
    </div>
  );
}
