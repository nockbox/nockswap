"use client";

import { skeletonColors } from "@/lib/theme";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  isDarkMode?: boolean;
}

export function Skeleton({
  width = 60,
  height = 15,
  borderRadius = 4,
  isDarkMode = false,
}: SkeletonProps) {
  const colors = isDarkMode ? skeletonColors.dark : skeletonColors.light;

  return (
    <span
      style={{
        display: "inline-block",
        width,
        height,
        borderRadius,
        background: colors.gradient,
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
      }}
    />
  );
}
