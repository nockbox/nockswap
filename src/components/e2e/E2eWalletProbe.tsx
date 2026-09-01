"use client";

import { useAccount, useChainId, useConnect, useDisconnect } from "wagmi";
import { useState } from "react";

import { E2E_CHAIN_ID } from "@/lib/e2eWallet";
import { isTestWalletEnabled } from "@/lib/wagmiConfig";

const TEST_WALLET_ID = "nockswap-e2e-wallet";

export function E2eWalletProbe() {
  const { address, status } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, error, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [collapsed, setCollapsed] = useState(true);

  if (!isTestWalletEnabled) return null;

  if (collapsed) {
    return (
      <button
        aria-label="Show E2E wallet controls"
        data-testid="e2e-wallet-toggle"
        onClick={() => setCollapsed(false)}
        style={{
          position: "fixed",
          right: 8,
          bottom: 8,
          zIndex: 10000,
          padding: "4px 6px",
          border: 0,
          borderRadius: 4,
          background: "#111827",
          color: "#f9fafb",
          fontFamily: "ui-monospace, monospace",
          fontSize: 10,
        }}
        type="button"
      >
        E2E wallet
      </button>
    );
  }

  const connector = connectors.find((candidate) => candidate.id === TEST_WALLET_ID);
  const connected = status === "connected";

  return (
    <aside
      aria-label="E2E wallet controls"
      data-testid="e2e-wallet-probe"
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 10000,
        display: "grid",
        gap: 6,
        maxWidth: 360,
        padding: 10,
        borderRadius: 8,
        background: "#111827",
        color: "#f9fafb",
        fontFamily: "ui-monospace, monospace",
        fontSize: 12,
      }}
    >
      <button
        aria-label="Hide E2E wallet controls"
        data-testid="e2e-wallet-hide"
        onClick={() => setCollapsed(true)}
        type="button"
      >
        Hide
      </button>
      <output data-testid="e2e-wallet-status">{status}</output>
      <output data-testid="e2e-wallet-account">{address ?? "disconnected"}</output>
      <output data-testid="e2e-wallet-chain">{chainId}</output>
      {error ? (
        <output data-testid="e2e-wallet-error">{error.message}</output>
      ) : null}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          data-testid="e2e-wallet-connect"
          disabled={connected || isPending || connector === undefined}
          onClick={() => {
            if (connector) connect({ connector, chainId: E2E_CHAIN_ID });
          }}
          type="button"
        >
          Connect
        </button>
        <button
          data-testid="e2e-wallet-disconnect"
          disabled={!connected}
          onClick={() => disconnect()}
          type="button"
        >
          Disconnect
        </button>
      </div>
    </aside>
  );
}
