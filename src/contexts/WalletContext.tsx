"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  NockchainProvider,
  NOCK_TO_NICKS,
  WalletNotInstalledError,
  UserRejectedError,
  NoAccountError,
  initWasm,
  wasm,
  type Account,
  type Address,
  type SignTxResponse,
} from "@nockbox/iris-sdk";
import type {
  Nicks,
  PbCom2Note,
  PbCom2RawTransaction,
  TxEngineSettings,
} from "@nockbox/iris-sdk/wasm";
import { guard } from "@nockbox/iris-sdk/wasm";

export { NOCK_TO_NICKS };

function accountAddressString(account: Account): string {
  return String(account.address);
}

interface SignRawTxParams {
  rawTx: unknown;
  notes: unknown[];
  spendConditions: unknown[];
}

interface WalletContextType {
  // State
  isInstalled: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  grpcEndpoint: string | null;
  /** From last successful `connect`; required for tx fee / bridge build alignment with the wallet. */
  txEngineActivationHeights: Record<number, TxEngineSettings> | null;
  /** Coinbase note maturity (blocks), from Iris RPC config. */
  coinbaseTimelockBlocks: number | null;
  error: string | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  sendTransaction: (to: string, amountInNocks: number) => Promise<string>;
  signRawTx: (params: SignRawTxParams) => Promise<PbCom2RawTransaction>;

  // Helpers
  formatAddress: (address: string) => string;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<NockchainProvider | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [grpcEndpoint, setGrpcEndpoint] = useState<string | null>(null);
  const [txEngineActivationHeights, setTxEngineActivationHeights] = useState<
    Record<number, TxEngineSettings> | null
  >(null);
  const [coinbaseTimelockBlocks, setCoinbaseTimelockBlocks] = useState<
    number | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize provider on mount; re-check when Iris injects (nockchain#initialized).
  useEffect(() => {
    if (typeof window === "undefined") return;

    let activeProvider: NockchainProvider | null = null;
    let cancelled = false;

    function attachProvider(p: NockchainProvider) {
      if (p.isConnected && p.accounts.length > 0) {
        p.connect()
          .then(({ account, rpcConfig }) => {
            if (cancelled) return;
            setAddress(accountAddressString(account));
            setGrpcEndpoint(rpcConfig.rpcUrl);
            setTxEngineActivationHeights(rpcConfig.txEngineActivationHeights);
            setCoinbaseTimelockBlocks(rpcConfig.coinbaseTimelockBlocks);
            setIsConnected(true);
          })
          .catch((err) => {
            if (cancelled) return;
            console.error("Failed to reconnect wallet:", err);
            setIsConnected(true);
            setAddress(accountAddressString(p.accounts[0]));
          });
      }

      p.on("accountsChanged", (accounts: Account[]) => {
        if (accounts.length > 0) {
          setAddress(accountAddressString(accounts[0]));
          setIsConnected(true);
        } else {
          setAddress(null);
          setIsConnected(false);
        }
      });

      p.on("disconnect", () => {
        setAddress(null);
        setIsConnected(false);
        setGrpcEndpoint(null);
        setTxEngineActivationHeights(null);
        setCoinbaseTimelockBlocks(null);
      });
    }

    function tryInitProvider() {
      if (cancelled || activeProvider) return;

      const installed = NockchainProvider.isInstalled();
      setIsInstalled(installed);
      if (!installed) return;

      try {
        const p = new NockchainProvider();
        activeProvider = p;
        setProvider(p);
        attachProvider(p);
      } catch (err) {
        console.error("Failed to initialize wallet provider:", err);
      }
    }

    tryInitProvider();
    window.addEventListener("nockchain#initialized", tryInitProvider);

    return () => {
      cancelled = true;
      window.removeEventListener("nockchain#initialized", tryInitProvider);
      activeProvider?.dispose();
    };
  }, []);

  const connect = useCallback(async () => {
    let activeProvider = provider;
    if (!activeProvider && NockchainProvider.isInstalled()) {
      setIsInstalled(true);
      activeProvider = new NockchainProvider();
      setProvider(activeProvider);
    }
    if (!activeProvider) {
      setError("Iris wallet not installed");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const { account, rpcConfig } = await activeProvider.connect();
      setAddress(accountAddressString(account));
      setGrpcEndpoint(rpcConfig.rpcUrl);
      setTxEngineActivationHeights(rpcConfig.txEngineActivationHeights);
      setCoinbaseTimelockBlocks(rpcConfig.coinbaseTimelockBlocks);
      setIsConnected(true);
    } catch (err) {
      if (err instanceof UserRejectedError) {
        setError("Connection rejected by user");
      } else if (err instanceof WalletNotInstalledError) {
        setError("Iris wallet not installed");
        setIsInstalled(false);
      } else {
        setError("Failed to connect wallet");
        console.error("Wallet connection error:", err);
      }
    } finally {
      setIsConnecting(false);
    }
  }, [provider]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setIsConnected(false);
    setGrpcEndpoint(null);
    setTxEngineActivationHeights(null);
    setCoinbaseTimelockBlocks(null);
    setError(null);
  }, []);

  const sendTransaction = useCallback(
    async (to: string, amountInNocks: number): Promise<string> => {
      if (!provider) {
        throw new Error("Wallet not connected");
      }

      if (!isConnected) {
        throw new NoAccountError();
      }

      // Convert NOCK to nicks
      const amountInNicks = Math.floor(amountInNocks * NOCK_TO_NICKS);

      const txId = await provider.sendTransaction({
        to: to as Address,
        amount: String(amountInNicks) as Nicks,
      });
      return txId;
    },
    [provider, isConnected]
  );

  const signRawTx = useCallback(
    async (params: SignRawTxParams): Promise<PbCom2RawTransaction> => {
      if (!provider) {
        throw new Error("Wallet not connected");
      }

      if (!isConnected) {
        throw new NoAccountError();
      }

      try {
        await initWasm();
        const rawTxWasm = wasm.rawTxFromProtobuf(
          params.rawTx as PbCom2RawTransaction
        );
        const nockTx = wasm.rawTxV1ToNockchainTx(
          rawTxWasm as Parameters<typeof wasm.rawTxV1ToNockchainTx>[0]
        );
        const notes = (params.notes as PbCom2Note[]).map((n) =>
          wasm.noteFromProtobuf(n)
        );
        const signResult = await provider.signTx(nockTx, notes);

        if (
          signResult &&
          typeof signResult === "object" &&
          "tx" in signResult &&
          (signResult as SignTxResponse).tx
        ) {
          const signedRaw = wasm.nockchainTxToRawTx(
            (signResult as SignTxResponse).tx
          );
          return wasm.rawTxToProtobuf(signedRaw) as PbCom2RawTransaction;
        }

        if (guard.isPbCom2RawTransaction(signResult as unknown)) {
          return signResult as unknown as PbCom2RawTransaction;
        }

        throw new Error(
          "Wallet returned an unexpected sign transaction response shape"
        );
      } catch (err) {
        if (err instanceof UserRejectedError) {
          throw err;
        }

        // TODO: This workaround can be removed when iris wallet fix is merged
        if (err instanceof Error && err.message === "[object Object]") {
          throw new UserRejectedError("User cancelled the transaction");
        }

        throw err;
      }
    },
    [provider, isConnected]
  );

  const formatAddress = useCallback((addr: string): string => {
    if (!addr || addr.length < 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }, []);

  const value: WalletContextType = {
    isInstalled,
    isConnected,
    isConnecting,
    address,
    grpcEndpoint,
    txEngineActivationHeights,
    coinbaseTimelockBlocks,
    error,
    connect,
    disconnect,
    sendTransaction,
    signRawTx,
    formatAddress,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
