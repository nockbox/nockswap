import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number, decimals: number = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a number as USD currency
 */
export function formatUSD(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Calculate and format USD value from amount and price
 */
export function calcUSD(amount: number, price: number): string {
  return formatUSD(amount * price);
}

/**
 * Parse a formatted number string (with commas) to a number
 */
export function parseAmount(value: string): number {
  const cleaned = value.replace(/,/g, "");
  return parseFloat(cleaned) || 0;
}

/**
 * Format a number string with thousand separators
 */
export function formatWithCommas(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return "";

  const parts = cleaned.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

export function truncateAddress(address: string, chars: number = 6): string {
  if (!address) return "";
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
