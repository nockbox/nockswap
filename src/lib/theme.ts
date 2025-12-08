export interface SwapCardTheme {
  cardBg: string;
  cardBorder: string;
  sectionBg: string;
  inputBg: string;
  textPrimary: string;
  maxButtonBorder: string;
  swapButtonBg: string;
  swapButtonIcon: string;
  networkBadgeBorder: string;
  error: string;
  errorGlow: string;
}

export function getSwapCardTheme(isDarkMode: boolean): SwapCardTheme {
  return {
    cardBg: isDarkMode ? "#101010" : "#fff",
    cardBorder: isDarkMode ? "#171717" : "#ededed",
    sectionBg: isDarkMode ? "#171717" : "#f6f5f1",
    inputBg: isDarkMode ? "#000" : "#fff",
    textPrimary: isDarkMode ? "#fff" : "#000",
    maxButtonBorder: isDarkMode ? "#222" : "#e4e3dd",
    swapButtonBg: isDarkMode ? "#fff" : "#000",
    swapButtonIcon: isDarkMode ? "#000" : "#fff",
    networkBadgeBorder: isDarkMode ? "#171717" : "#f6f5f1",
    error: "#ff4e54",
    errorGlow: "rgba(255, 78, 84, 0.25)",
  };
}

// Skeleton colors for loading states
export const skeletonColors = {
  light: {
    gradient: "linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)",
  },
  dark: {
    gradient: "linear-gradient(90deg, #333 25%, #444 50%, #333 75%)",
  },
};
