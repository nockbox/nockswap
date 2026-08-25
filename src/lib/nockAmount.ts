import {
  NICKS_PER_NOCK,
  PROTOCOL_FEE_NICKS_PER_NOCK,
  bridgeFeeNicksCeil,
  bridgeFeeNicksFloor,
} from "./constants";

export const NOCK_TOKEN_BASE_UNITS_PER_NOCK = 10_000_000_000_000_000n;
export const NOCK_TOKEN_BASE_UNITS_PER_NICK = 152_587_890_625n;

export type NockAmountErrorCode =
  | "invalid_amount"
  | "amount_not_positive"
  | "unsupported_precision";

export class NockAmountError extends Error {
  readonly code: NockAmountErrorCode;

  constructor(code: NockAmountErrorCode, message: string) {
    super(message);
    this.name = "NockAmountError";
    this.code = code;
  }
}

export interface ExactNockAmount {
  /** Canonical decimal NOCK string used in the confirmation UI. */
  canonical: string;
  /** Exact Nockchain amount. */
  nicks: bigint;
  /** Exact Base token amount passed to the withdrawal codec. */
  baseUnits: bigint;
}

function canonicalDecimalFromBaseUnits(baseUnits: bigint): string {
  const whole = baseUnits / NOCK_TOKEN_BASE_UNITS_PER_NOCK;
  const fraction = baseUnits % NOCK_TOKEN_BASE_UNITS_PER_NOCK;
  if (fraction === 0n) {
    return whole.toString();
  }
  const fractionText = fraction
    .toString()
    .padStart(16, "0")
    .replace(/0+$/, "");
  return `${whole}.${fractionText}`;
}

function normalizeDecimalInput(value: string): string {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(normalized)) {
    throw new NockAmountError(
      "invalid_amount",
      "Enter a positive NOCK amount using digits and one decimal point."
    );
  }
  return normalized;
}

export function parseExactNockAmount(value: string): ExactNockAmount {
  const normalized = normalizeDecimalInput(value);
  const [wholeText, rawFraction = ""] = normalized.split(".");
  const fractionText = rawFraction.replace(/0+$/, "");
  if (fractionText.length > 16) {
    throw new NockAmountError(
      "unsupported_precision",
      "This amount has more precision than the Base NOCK token supports."
    );
  }

  const baseUnits =
    BigInt(wholeText) * NOCK_TOKEN_BASE_UNITS_PER_NOCK +
    BigInt(fractionText.padEnd(16, "0") || "0");
  if (baseUnits <= 0n) {
    throw new NockAmountError(
      "amount_not_positive",
      "Enter a NOCK amount greater than zero."
    );
  }
  if (baseUnits % NOCK_TOKEN_BASE_UNITS_PER_NICK !== 0n) {
    throw new NockAmountError(
      "unsupported_precision",
      "Use an amount representable in whole nicks (increments of 0.0000152587890625 NOCK)."
    );
  }

  const nicks = baseUnits / NOCK_TOKEN_BASE_UNITS_PER_NICK;
  return {
    canonical: canonicalDecimalFromBaseUnits(baseUnits),
    nicks,
    baseUnits,
  };
}

export function exactNockAmountFromNicks(nicks: bigint): ExactNockAmount {
  if (nicks <= 0n) {
    throw new NockAmountError(
      "amount_not_positive",
      "Enter a NOCK amount greater than zero."
    );
  }
  const baseUnits = nicks * NOCK_TOKEN_BASE_UNITS_PER_NICK;
  return {
    canonical: canonicalDecimalFromBaseUnits(baseUnits),
    nicks,
    baseUnits,
  };
}

export function formatNockDecimal(value: string): string {
  const [whole, fraction] = value.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${groupedWhole}.${fraction}` : groupedWhole;
}

export function formatNicksAsNock(nicks: bigint): string {
  if (nicks === 0n) return "0";
  const sign = nicks < 0n ? "-" : "";
  const absolute = nicks < 0n ? -nicks : nicks;
  const amount = exactNockAmountFromNicks(absolute);
  return `${sign}${formatNockDecimal(amount.canonical)}`;
}

export function amountAfterBridgeFee(
  amount: ExactNockAmount,
  rounding: "floor" | "ceil"
): ExactNockAmount {
  const fee =
    rounding === "ceil"
      ? bridgeFeeNicksCeil(amount.nicks)
      : bridgeFeeNicksFloor(amount.nicks);
  return exactNockAmountFromNicks(amount.nicks - fee);
}

export function grossNicksForNetAmount(netNicks: bigint): bigint {
  if (netNicks <= 0n) return 0n;

  // Fee changes only when another whole NOCK starts. At most one adjustment is
  // needed after the proportional upper-bound estimate.
  let gross =
    (netNicks * NICKS_PER_NOCK +
      (NICKS_PER_NOCK - PROTOCOL_FEE_NICKS_PER_NOCK - 1n)) /
    (NICKS_PER_NOCK - PROTOCOL_FEE_NICKS_PER_NOCK);
  while (gross - bridgeFeeNicksCeil(gross) < netNicks) {
    gross += 1n;
  }
  while (
    gross > 1n &&
    gross - 1n - bridgeFeeNicksCeil(gross - 1n) >= netNicks
  ) {
    gross -= 1n;
  }
  return gross;
}

function parseUnsignedDecimalRatio(value: string): {
  numerator: bigint;
  denominator: bigint;
} | null {
  const normalized = value.trim();
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  return {
    numerator: BigInt(`${whole}${fraction}`),
    denominator,
  };
}

/** Approximate display only. Transaction amounts never use this price. */
export function formatApproximateUsd(
  amountNicks: bigint,
  usdPrice: string
): string {
  const price = parseUnsignedDecimalRatio(usdPrice);
  if (!price || price.numerator === 0n || amountNicks <= 0n) return "$0.00";
  const denominator = NICKS_PER_NOCK * price.denominator;
  const centsNumerator = amountNicks * price.numerator * 100n;
  const cents = (centsNumerator + denominator / 2n) / denominator;
  const dollars = cents / 100n;
  const remainder = (cents % 100n).toString().padStart(2, "0");
  return `$${formatNockDecimal(dollars.toString())}.${remainder}`;
}
