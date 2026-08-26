import { expect } from "@playwright/test";
import type {
  ConsoleMessage,
  Page,
  Request,
  Response,
} from "@playwright/test";

import { test as walletTest } from "./test-wallet";

export type ConsoleDiagnosticCategory =
  | "hydration"
  | "runtime"
  | "react"
  | "security";

export interface ConsoleDiagnostic {
  category: ConsoleDiagnosticCategory;
  level: string;
  message: string;
}

export interface NetworkDiagnostic {
  method: string;
  url: string;
  status: number | null;
  failure: string | null;
}

export interface LayoutDiagnostic {
  horizontalOverflow: number;
  clipped: readonly string[];
}

export interface BrowserDiagnostics {
  readonly console: ConsoleDiagnostic[];
  readonly network: NetworkDiagnostic[];
  captureCheckpoint(name: string): Promise<void>;
  inspectLayout(): Promise<LayoutDiagnostic>;
  assertNoCriticalConsole(): void;
  assertNoNetworkFailures(): void;
  assertViewportFits(): Promise<void>;
}

export function categorizeConsoleMessage(
  level: string,
  message: string
): ConsoleDiagnosticCategory | null {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("hydration") ||
    normalized.includes("server rendered html") ||
    normalized.includes("did not match")
  ) {
    return "hydration";
  }
  if (
    normalized.includes("content security policy") ||
    normalized.includes("refused to") ||
    normalized.includes("mixed content")
  ) {
    return "security";
  }
  if (
    (level === "warning" || level === "error") &&
    (normalized.includes("react") ||
      normalized.includes("hook") ||
      normalized.includes("state update on an unmounted"))
  ) {
    return "react";
  }
  if (
    level === "error" ||
    normalized.includes("typeerror") ||
    normalized.includes("referenceerror") ||
    normalized.includes("uncaught")
  ) {
    return "runtime";
  }
  return null;
}

export const test = walletTest.extend<{ diagnostics: BrowserDiagnostics }>({
  diagnostics: async ({ page }, runFixture, testInfo) => {
    const consoleDiagnostics: ConsoleDiagnostic[] = [];
    const networkDiagnostics: NetworkDiagnostic[] = [];

    const onConsole = (message: ConsoleMessage) => {
      const level = message.type();
      const text = message.text();
      const category = categorizeConsoleMessage(level, text);
      if (category) {
        consoleDiagnostics.push({
          category,
          level,
          message: redactDiagnosticText(text),
        });
      }
    };
    const onPageError = (error: Error) => {
      consoleDiagnostics.push({
        category: "runtime",
        level: "error",
        message: redactDiagnosticText(error.message),
      });
    };
    const onRequestFailed = (request: Request) => {
      networkDiagnostics.push({
        method: request.method(),
        url: sanitizedUrl(request.url()),
        status: null,
        failure: redactDiagnosticText(
          request.failure()?.errorText ?? "request failed"
        ),
      });
    };
    const onResponse = (response: Response) => {
      const status = response.status();
      if (status < 400) return;
      networkDiagnostics.push({
        method: response.request().method(),
        url: sanitizedUrl(response.url()),
        status,
        failure: null,
      });
    };

    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("requestfailed", onRequestFailed);
    page.on("response", onResponse);

    const diagnostics: BrowserDiagnostics = {
      console: consoleDiagnostics,
      network: networkDiagnostics,
      async captureCheckpoint(name) {
        const safeName = name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
        const screenshot = await page.screenshot({
          path: testInfo.outputPath(`${safeName}.png`),
          fullPage: true,
        });
        await testInfo.attach(`checkpoint-${safeName}`, {
          body: screenshot,
          contentType: "image/png",
        });
      },
      async inspectLayout() {
        return inspectVisibleLayout(page);
      },
      assertNoCriticalConsole() {
        if (consoleDiagnostics.length > 0) {
          throw new Error(
            `critical browser console diagnostics: ${JSON.stringify(
              consoleDiagnostics
            )}`
          );
        }
      },
      assertNoNetworkFailures() {
        if (networkDiagnostics.length > 0) {
          throw new Error(
            `browser network diagnostics: ${JSON.stringify(networkDiagnostics)}`
          );
        }
      },
      async assertViewportFits() {
        const layout = await inspectVisibleLayout(page);
        expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
        expect(layout.clipped).toEqual([]);
      },
    };

    try {
      await runFixture(diagnostics);
    } finally {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("requestfailed", onRequestFailed);
      page.off("response", onResponse);
      await testInfo.attach("browser-diagnostics", {
        body: Buffer.from(
          JSON.stringify(
            { console: consoleDiagnostics, network: networkDiagnostics },
            null,
            2
          )
        ),
        contentType: "application/json",
      });
    }
  },
});

export { expect };

async function inspectVisibleLayout(page: Page): Promise<LayoutDiagnostic> {
  return page.locator("body").evaluate((body) => {
    const viewportWidth = window.innerWidth;
    const horizontalOverflow = Math.max(
      0,
      document.documentElement.scrollWidth - viewportWidth
    );
    const clipped = Array.from(
      body.querySelectorAll<HTMLElement>(
        "button, input, a, [data-testid], [role='alert'], [role='status']"
      )
    )
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.position === "fixed"
        ) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 1 &&
          rect.height > 1 &&
          (rect.left < -1 || rect.right > viewportWidth + 1)
        );
      })
      .slice(0, 20)
      .map((element) =>
        [
          element.tagName.toLowerCase(),
          element.getAttribute("data-testid"),
          element.getAttribute("aria-label"),
        ]
          .filter(Boolean)
          .join(":")
      );
    return { horizontalOverflow, clipped };
  });
}

function sanitizedUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "invalid-url";
  }
}

function redactDiagnosticText(value: string): string {
  return value
    .replace(/0x[0-9a-fA-F]{64}/g, "[redacted-hex]")
    .replace(/([?&](?:key|token|secret|signature)=)[^&\s]+/gi, "$1[redacted]");
}
