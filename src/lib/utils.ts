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
 * Calculate NOCK amount from USD value and price
 */
export function calcNOCK(usdAmount: number, price: number): number {
  if (price === 0) return 0;
  return usdAmount / price;
}

/**
 * Format NOCK amount with commas
 */
export function formatNOCK(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
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

/**
 * Apply bridge fee to an amount (subtract fee)
 * @param amount - The amount before fee
 * @param feeBps - Fee in basis points (default 50 = 0.5%)
 */
export function applyFee(amount: number, feeBps: number = 50): number {
  return amount * (1 - feeBps / 10000);
}

/**
 * Reverse bridge fee calculation (get original amount from after-fee amount)
 * @param amount - The amount after fee was applied
 * @param feeBps - Fee in basis points (default 50 = 0.5%)
 */
export function reverseFee(amount: number, feeBps: number = 50): number {
  return amount / (1 - feeBps / 10000);
}
