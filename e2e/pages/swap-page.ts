import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { TestWalletFixture } from "../fixtures/test-wallet";

export type SwapDirection = "nock_to_base" | "base_to_nock";
export type WithdrawalUiState =
  | "submitted"
  | "receipt"
  | "pending"
  | "delayed"
  | "confirmed"
  | "support";

export interface SwapFormSnapshot {
  direction: SwapDirection;
  amount: string;
  destination: string;
  quote: string;
  primaryAction: string;
  primaryActionDisabled: boolean;
  amountError: string | null;
}

export interface WithdrawalReferences {
  base: string | null;
  nockchain: string | null;
  destination: string | null;
  transaction: string | null;
}

export interface BrowserObservedWithdrawal {
  calldata: string;
  submittedTransactionHash: string;
  transactionHash: string;
  blockNumber: string;
  blockHash: string;
  logIndex: number;
  baseEventId: string;
  nockTransactionId: string;
  nockBlockId: string;
  historyStates: string[];
}

export class SwapPage {
  readonly page: Page;
  readonly card: Locator;
  readonly amount: Locator;
  readonly destination: Locator;
  readonly quote: Locator;
  readonly directionToggle: Locator;
  readonly primaryAction: Locator;
  readonly resultCard: Locator;
  readonly confirmAction: Locator;
  readonly cancelAction: Locator;
  readonly lifecycleState: Locator;

  constructor(page: Page, private readonly testWallet?: TestWalletFixture) {
    this.page = page;
    this.card = page.getByTestId("swap-card");
    this.amount = page.getByRole("textbox", { name: "Amount to send" });
    this.destination = page.getByTestId("swap-destination");
    this.quote = page.getByRole("textbox", {
      name: "Amount received after bridge fee",
    });
    this.directionToggle = page.getByRole("button", {
      name: /Switch to (Base to Nockchain|Nockchain to Base)/,
    });
    this.primaryAction = page.getByTestId("swap-primary-action");
    this.resultCard = page.getByTestId("result-card");
    this.confirmAction = page.getByRole("button", { name: /Confirm|Processing/ });
    this.cancelAction = page.getByRole("button", { name: "Cancel" });
    this.lifecycleState = page.getByTestId("withdrawal-lifecycle-state");
  }

  async goto() {
    await this.page.goto("/");
    await expect(this.card).toBeVisible();
  }

  async selectDirection(direction: SwapDirection) {
    if ((await this.direction()) !== direction) {
      await this.directionToggle.click();
    }
    await expect(this.card).toHaveAttribute("data-direction", direction);
  }

  async connectBaseWallet() {
    if (!this.testWallet) {
      throw new Error("SwapPage requires the deterministic wallet fixture");
    }
    await this.testWallet.connect();
  }

  async disconnectBaseWallet() {
    if (!this.testWallet) {
      throw new Error("SwapPage requires the deterministic wallet fixture");
    }
    await this.testWallet.disconnect();
  }

  async enterExactAmount(amount: string) {
    await this.amount.fill(amount);
    await this.amount.press("Tab");
  }

  async enterDestination(destination: string) {
    await this.destination.fill(destination);
    await this.destination.press("Tab");
  }

  async review() {
    await this.primaryAction.click();
    await expect(this.resultCard).toBeVisible();
  }

  async confirm() {
    await this.confirmAction.click();
  }

  async cancel() {
    await this.cancelAction.click();
    await expect(this.card).toBeVisible();
  }

  async readForm(): Promise<SwapFormSnapshot> {
    const amountError = this.page.getByTestId("swap-amount-error");
    return {
      direction: await this.direction(),
      amount: await this.amount.inputValue(),
      destination: (await this.destination.inputValue()).trim(),
      quote: await this.quote.inputValue(),
      primaryAction: (await this.primaryAction.textContent())?.trim() ?? "",
      primaryActionDisabled: await this.primaryAction.isDisabled(),
      amountError: (await amountError.count())
        ? (await amountError.textContent())?.trim() ?? null
        : null,
    };
  }

  async expectPrimaryAction(name: string | RegExp, enabled: boolean) {
    await expect(this.primaryAction).toHaveText(name);
    if (enabled) await expect(this.primaryAction).toBeEnabled();
    else await expect(this.primaryAction).toBeDisabled();
  }

  async readLifecycleState(): Promise<WithdrawalUiState> {
    await expect(this.lifecycleState).toBeVisible();
    const state = await this.lifecycleState.getAttribute("data-state");
    if (!isWithdrawalUiState(state)) {
      throw new Error(`Unsupported visible withdrawal lifecycle state: ${state}`);
    }
    return state;
  }

  async expectLifecycleState(state: WithdrawalUiState, timeout?: number) {
    await expect(this.lifecycleState).toHaveAttribute("data-state", state, {
      timeout,
    });
    await expect(this.lifecycleState).toBeVisible({ timeout });
  }

  async readBlockers(): Promise<string[]> {
    const blockers = this.page.locator(
      '[data-testid="swap-amount-error"], [data-testid="result-error"], [data-testid="result-blocker"]'
    );
    const values: string[] = [];
    for (let index = 0; index < (await blockers.count()); index += 1) {
      const blocker = blockers.nth(index);
      if (await blocker.isVisible()) {
        const text = (await blocker.textContent())?.trim();
        if (text) values.push(text);
      }
    }
    return values;
  }

  async readReferences(): Promise<WithdrawalReferences> {
    return {
      base: await optionalReference(this.page.getByTestId("base-reference")),
      nockchain: await optionalReference(
        this.page.getByTestId("nockchain-reference")
      ),
      destination: await optionalReference(
        this.page.getByTestId("result-destination")
      ),
      transaction: await optionalReference(
        this.page.getByTestId("result-transaction")
      ),
    };
  }

  async readBrowserEvidence(): Promise<BrowserObservedWithdrawal> {
    const required = async (name: string) => {
      const value = await this.resultCard.getAttribute(name);
      if (!value) throw new Error(`Result card is missing ${name}`);
      return value;
    };
    const history = this.page.getByTestId("withdrawal-history").locator("li");
    const historyStates = await history.allTextContents();
    const nockchainReference = this.page.getByTestId("nockchain-reference");
    if (
      (await nockchainReference.count()) === 0 ||
      !(await nockchainReference.isVisible())
    ) {
      throw new Error("Result card is missing Nockchain reference");
    }
    const nockchain = (await nockchainReference.textContent())?.trim();
    if (!nockchain) throw new Error("Result card is missing Nockchain reference");
    const [nockTransactionId, nockBlockId = ""] = nockchain
      .replace("Nockchain transaction: ", "")
      .split(" · block ");
    return {
      calldata: await required("data-calldata"),
      submittedTransactionHash: await required(
        "data-submitted-transaction-hash"
      ),
      transactionHash: await required("data-transaction-hash"),
      blockNumber: await required("data-block-number"),
      blockHash: await required("data-block-hash"),
      logIndex: Number.parseInt(await required("data-log-index"), 10),
      baseEventId: await required("data-base-event-id"),
      nockTransactionId,
      nockBlockId,
      historyStates: historyStates.map((value) => value.split(":")[0].trim()),
    };
  }

  private async direction(): Promise<SwapDirection> {
    const direction = await this.card.getAttribute("data-direction");
    if (direction !== "nock_to_base" && direction !== "base_to_nock") {
      throw new Error(`Unsupported swap direction: ${direction}`);
    }
    return direction;
  }
}

async function optionalReference(locator: Locator): Promise<string | null> {
  if ((await locator.count()) === 0 || !(await locator.isVisible())) return null;
  return (
    (await locator.getAttribute("title")) ??
    (await locator.textContent())?.trim() ??
    null
  );
}

function isWithdrawalUiState(value: string | null): value is WithdrawalUiState {
  return (
    value === "submitted" ||
    value === "receipt" ||
    value === "pending" ||
    value === "delayed" ||
    value === "confirmed" ||
    value === "support"
  );
}
