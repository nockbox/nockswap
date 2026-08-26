import assert from "node:assert/strict";
import test from "node:test";

import { categorizeConsoleMessage } from "../e2e/fixtures/diagnostics";

test("console diagnostics classify actionable browser failures", () => {
  assert.equal(
    categorizeConsoleMessage("warning", "Hydration failed because markup differs"),
    "hydration"
  );
  assert.equal(
    categorizeConsoleMessage("error", "Refused to connect by Content Security Policy"),
    "security"
  );
  assert.equal(
    categorizeConsoleMessage("warning", "React state update on an unmounted component"),
    "react"
  );
  assert.equal(
    categorizeConsoleMessage("error", "TypeError: cannot read properties"),
    "runtime"
  );
});

test("ordinary informational console messages are ignored", () => {
  assert.equal(categorizeConsoleMessage("info", "development server ready"), null);
  assert.equal(categorizeConsoleMessage("log", "wallet connected"), null);
  assert.equal(
    categorizeConsoleMessage("info", "Download the React DevTools"),
    null
  );
  assert.equal(
    categorizeConsoleMessage("error", "Failed to load resource: net::ERR_CONNECTION_REFUSED"),
    null
  );
  assert.equal(
    categorizeConsoleMessage("error", "Request has been blocked by CORS policy"),
    null
  );
});
