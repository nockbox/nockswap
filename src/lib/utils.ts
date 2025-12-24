import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { NOCK_TO_NICKS } from "@/hooks/useWallet";
import { PROTOCOL_FEE_NICKS_PER_NOCK } from "@/lib/constants";

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
 * Apply bridge fee to an amount
 * floor(amountInNicks / 65536) * 195 nicks
 * @param amountNock - The amount in NOCK before fee
 */
export function applyFee(amountNock: number): number {
  // Convert to nicks, calculate fee, convert back to NOCK
  const amountInNicks = Math.floor(amountNock * NOCK_TO_NICKS);
  const feeInNicks =
    Math.floor(amountInNicks / NOCK_TO_NICKS) *
    Number(PROTOCOL_FEE_NICKS_PER_NOCK);
  const amountAfterFeeNicks = amountInNicks - feeInNicks;
  return amountAfterFeeNicks / NOCK_TO_NICKS;
}

/**
 * Reverse bridge fee calculation (get original amount from after-fee amount)
 * @param amountAfterFeeNock - The amount in NOCK after fee was applied
 */
export function reverseFee(amountAfterFeeNock: number): number {
  // Approximate: amountAfterFee ≈ amount - (amount * 195 / 65536)
  // So: amount ≈ amountAfterFee / (1 - 195/65536)
  const feeRatio = Number(PROTOCOL_FEE_NICKS_PER_NOCK) / NOCK_TO_NICKS;
  return amountAfterFeeNock / (1 - feeRatio);
}
