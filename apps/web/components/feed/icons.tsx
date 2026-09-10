"use client";

import {
  Heart,
  TrendUp,
  TrendDown,
  Repeat,
  ShareNetwork,
  DotsThree,
  ChatCircle,
  BookmarkSimple,
} from "@phosphor-icons/react";

export function HeartIcon({
  filled = false,
  className = "w-5 h-5",
  size = 20,
}: {
  filled?: boolean;
  className?: string;
  size?: number;
}) {
  return (
    <Heart
      size={size}
      weight={filled ? "fill" : "regular"}
      className={className}
    />
  );
}

export function CommentIcon({
  className = "w-5 h-5",
  size = 20,
}: {
  className?: string;
  size?: number;
}) {
  return <ChatCircle size={size} weight="regular" className={className} />;
}

export function ShareIcon({
  className = "w-5 h-5",
  size = 20,
}: {
  className?: string;
  size?: number;
}) {
  return <ShareNetwork size={size} weight="regular" className={className} />;
}

export function EchoIcon({
  className = "w-5 h-5",
  size = 20,
  weight = "regular",
}: {
  className?: string;
  size?: number;
  weight?: "regular" | "bold";
}) {
  return <Repeat size={size} weight={weight} className={className} />;
}

export function BookmarkIcon({
  filled = false,
  className = "w-5 h-5",
  size = 20,
}: {
  filled?: boolean;
  className?: string;
  size?: number;
}) {
  return (
    <BookmarkSimple
      size={size}
      weight={filled ? "fill" : "regular"}
      className={className}
    />
  );
}

export function DotsIcon({
  className = "w-5 h-5",
  size = 20,
}: {
  className?: string;
  size?: number;
}) {
  return <DotsThree size={size} weight="bold" className={className} />;
}

export function TrendUpIcon({
  className = "w-4 h-4",
  size = 18,
  weight = "bold",
}: {
  className?: string;
  size?: number;
  weight?: "regular" | "bold" | "fill";
}) {
  return <TrendUp size={size} weight={weight} className={className} />;
}

export function TrendDownIcon({
  className = "w-4 h-4",
  size = 18,
  weight = "bold",
}: {
  className?: string;
  size?: number;
  weight?: "regular" | "bold" | "fill";
}) {
  return <TrendDown size={size} weight={weight} className={className} />;
}

export {
  Heart,
  TrendUp,
  TrendDown,
  Repeat,
  ShareNetwork,
  DotsThree,
  ChatCircle,
  BookmarkSimple,
};

