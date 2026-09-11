"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeSlash, ArrowRight, ShieldCheck } from "@phosphor-icons/react";

interface CannotItem {
  id: string;
  tag: string;
  title: string;
  desc: string;
  cardStyle: {
    bg: string;
    border: string;
    text: string;
    subText: string;
    tagStyle: string;
  };
}

const CANNOT_ITEMS: CannotItem[] = [
  {
    id: "collateral",
    tag: "Collateral",
    title: "Withdraw your collateral",
    desc: "Only your wallet address has withdrawal authority. We cannot touch your principal under any circumstances.",
    cardStyle: {
      bg: "bg-[#f8f9fa] text-zinc-950",
      border: "border-zinc-300",
      text: "text-zinc-950",
      subText: "text-zinc-600",
      tagStyle: "bg-zinc-200 text-zinc-800",
    },
  },
  {
    id: "outcomes",
    tag: "Outcomes",
    title: "Withdraw your outcome tokens",
    desc: "Resolved positions and settled payout tokens go strictly into your own EchoAccount.",
    cardStyle: {
      bg: "bg-gradient-to-r from-emerald-500 to-green-500 text-white",
      border: "border-emerald-400/40",
      text: "text-white",
      subText: "text-emerald-50",
      tagStyle: "bg-black/20 text-white",
    },
  },
  {
    id: "caps",
    tag: "Caps",
    title: "Raise the caps you set",
    desc: "Your per-order and lifetime budgets are hard-coded constraints. Orders that exceed them revert on chain.",
    cardStyle: {
      bg: "bg-gradient-to-r from-indigo-500 to-purple-600 text-white",
      border: "border-indigo-400/40",
      text: "text-white",
      subText: "text-indigo-100",
      tagStyle: "bg-black/20 text-white",
    },
  },
  {
    id: "expiry",
    tag: "Expiry",
    title: "Extend its own expiry",
    desc: "Authority automatically ceases on your selected expiry block. Only you can sign an extension.",
    cardStyle: {
      bg: "bg-gradient-to-r from-sky-500 to-blue-600 text-white",
      border: "border-sky-400/40",
      text: "text-white",
      subText: "text-sky-100",
      tagStyle: "bg-black/20 text-white",
    },
  },
  {
    id: "series",
    tag: "Series",
    title: "Add a market you did not allow",
    desc: "Echoes only reach pools inside your approved cadence (e.g. 1h BTC). Any other market reverts.",
    cardStyle: {
      bg: "bg-gradient-to-r from-amber-500 to-orange-500 text-white",
      border: "border-amber-400/40",
      text: "text-white",
      subText: "text-amber-100",
      tagStyle: "bg-black/20 text-white",
    },
  },
  {
    id: "pause",
    tag: "Pause",
    title: "Act after you pause the account",
    desc: "One on-chain transaction immediately disables the mirror key on the very next block.",
    cardStyle: {
      bg: "bg-gradient-to-r from-rose-500 to-red-600 text-white",
      border: "border-rose-400/40",
      text: "text-white",
      subText: "text-rose-100",
      tagStyle: "bg-black/20 text-white",
    },
  },
  {
    id: "validity",
    tag: "Validity",
    title: "Act after the expiry date passes",
    desc: "Contracts enforce block timestamp checks natively. Expired authorizations reject calls silently.",
    cardStyle: {
      bg: "bg-gradient-to-r from-teal-500 to-cyan-600 text-white",
      border: "border-teal-400/40",
      text: "text-white",
      subText: "text-teal-100",
      tagStyle: "bg-black/20 text-white",
    },
  },
  {
    id: "revoke",
    tag: "Revocation",
    title: "Act after you revoke the key",
    desc: "Strips the secondary key from the contract permanently with zero residual rights.",
    cardStyle: {
      bg: "bg-gradient-to-r from-zinc-700 to-neutral-800 text-white",
      border: "border-zinc-500/40",
      text: "text-white",
      subText: "text-zinc-300",
      tagStyle: "bg-black/25 text-zinc-200",
    },
  },
];

export function CannotFolder() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isExpanded = isOpen || isHovered;

  return (
    <div className="mt-14 w-full flex flex-col items-center">
      {/* Interactive Wallet Folder Container */}
      <div
        className="relative w-full max-w-[340px] sm:max-w-[440px] md:max-w-[540px] flex flex-col items-center"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Stage for Cards Pan Out */}
        <div
          className={`relative w-full transition-all duration-500 ease-out flex flex-col items-center ${
            isExpanded
              ? "h-[540px] sm:h-[580px] md:h-[620px]"
              : "h-[190px] sm:h-[210px] md:h-[230px]"
          }`}
        >
          {/* Render cards */}
          {CANNOT_ITEMS.map((item, idx) => {
            // When collapsed: cards are tucked inside folder with their top headers peeking out
            // When expanded: cards fan/pan out upward into a stacked visible list
            const collapsedY = -idx * 16 - 28;
            const expandedY = -(CANNOT_ITEMS.length - 1 - idx) * 58 - 36;
            const scale = isExpanded ? 1 : 1 - (CANNOT_ITEMS.length - 1 - idx) * 0.02;

            return (
              <div
                key={item.id}
                style={{
                  transform: `translateY(${isExpanded ? expandedY : collapsedY}px) scale(${scale})`,
                  zIndex: isExpanded ? 30 - idx : idx + 1,
                  transition: "all 480ms cubic-bezier(0.34, 1.4, 0.64, 1)",
                  transitionDelay: isExpanded ? `${idx * 28}ms` : `${(CANNOT_ITEMS.length - idx) * 18}ms`,
                }}
                className={`absolute bottom-0 w-[92%] sm:w-[94%] rounded-2xl p-4 sm:p-5 shadow-lg border ${item.cardStyle.border} ${item.cardStyle.bg} cursor-pointer`}
                onClick={() => setIsOpen((prev) => !prev)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-black/10">
                      CANNOT
                    </span>
                    <span className="font-mono text-[11px] font-semibold tracking-wide">
                      {item.tag}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] opacity-75">
                    0{idx + 1} / 08
                  </span>
                </div>

                <h4 className="mt-2 text-sm sm:text-base font-bold tracking-tight">
                  {item.title}
                </h4>

                <p
                  className={`mt-1 text-xs leading-relaxed transition-opacity duration-300 ${
                    isExpanded ? "opacity-90 block" : "opacity-0 hidden sm:line-clamp-1"
                  } ${item.cardStyle.subText}`}
                >
                  {item.desc}
                </p>
              </div>
            );
          })}

          {/* Green Folder Sleeve Pocket Face (Matches uploaded_media_0_1789113341580.png) */}
          <div
            onClick={() => setIsOpen((prev) => !prev)}
            className="absolute bottom-0 z-40 w-full h-[180px] sm:h-[195px] md:h-[210px] rounded-[30px] sm:rounded-[36px] bg-gradient-to-b from-[#18311d] to-[#0e1d11] border-2 border-[#2b5433] shadow-2xl p-6 sm:p-7 flex flex-col justify-between items-center text-center cursor-pointer select-none transition-transform duration-300 hover:scale-[1.01]"
          >
            {/* Stitched seam effect along the edge */}
            <div className="pointer-events-none absolute inset-2.5 sm:inset-3 rounded-[24px] sm:rounded-[30px] border border-dashed border-emerald-500/25" />

            {/* Folder top pocket cutout notch */}
            <div className="w-16 h-1 rounded-full bg-emerald-950/80 border border-emerald-500/20 mb-1" />

            {/* In Echonome your key cannot... */}
            <div className="relative z-10 my-auto">
              <h3 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white">
                In Echonome your key cannot..
              </h3>
              <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-400/90 font-medium">
                {isExpanded ? "8 constraints revealed" : "8 on-chain restrictions"}
              </p>
            </div>

            {/* Reveal button with Eye icon matching reference */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen((prev) => !prev);
              }}
              className="relative z-10 flex items-center justify-center gap-2 rounded-full bg-[#112315] hover:bg-[#183520] border border-emerald-500/40 px-5 py-2 text-xs font-mono text-emerald-300 transition-all duration-200 shadow-md group"
              aria-label={isExpanded ? "Collapse restrictions" : "Reveal restrictions"}
            >
              {isExpanded ? (
                <EyeSlash size={18} weight="bold" className="text-emerald-400 group-hover:scale-110 transition-transform" />
              ) : (
                <Eye size={18} weight="bold" className="text-emerald-400 group-hover:scale-110 transition-transform" />
              )}
              <span className="font-semibold tracking-wider uppercase text-[10px]">
                {isExpanded ? "Hide" : "Reveal"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Replaced 'see how custody works' with CTA button for the trade feeds */}
      <div className="mt-12 flex flex-col items-center text-center gap-3">
        <Link
          href="/feed"
          className="inline-flex items-center justify-center gap-2.5 rounded-full bg-accent px-8 py-3.5 text-sm font-semibold text-plane transition-all duration-200 hover:brightness-110 hover:scale-[1.02] shadow-xl shadow-accent/15"
        >
          <span>Live trade feed</span>
          <ArrowRight size={16} weight="bold" />
        </Link>
        <p className="text-xs text-ink-3">
          Explore real-time positions, calibration curves, and follower echoes.
        </p>
      </div>
    </div>
  );
}
