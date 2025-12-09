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
  WalletNotInstalledError,
  UserRejectedError,
  NoAccountError,
} from "@nockbox/iris-sdk";

// 1 NOCK = 65,536 nicks
export const NOCK_TO_NICKS = 65_536;

interface WalletContextType {
  // State
  isInstalled: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  grpcEndpoint: string | null;
  error: string | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  sendTransaction: (to: string, amountInNocks: number) => Promise<string>;

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
  const [error, setError] = useState<string | null>(null);

  // Initialize provider on mount
  useEffect(() => {
    // Check if we're in browser
    if (typeof window === "undefined") return;

    // Small delay to allow extension to inject
    const timer = setTimeout(() => {
      const installed = NockchainProvider.isInstalled();
      setIsInstalled(installed);

      if (installed) {
        try {
          const p = new NockchainProvider();
          setProvider(p);

          // Check if already connected
          if (p.isConnected && p.accounts.length > 0) {
            setIsConnected(true);
            setAddress(p.accounts[0]);
          }

          // Listen for account changes
          p.on("accountsChanged", (accounts: string[]) => {
            if (accounts.length > 0) {
              setAddress(accounts[0]);
              setIsConnected(true);
            } else {
              setAddress(null);
              setIsConnected(false);
            }
          });

          // Listen for disconnect
          p.on("disconnect", () => {
            setAddress(null);
            setIsConnected(false);
            setGrpcEndpoint(null);
          });
        } catch (err) {
          console.error("Failed to initialize wallet provider:", err);
        }
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (provider) {
        provider.dispose();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(async () => {
    if (!provider) {
      setError("Iris wallet not installed");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const { pkh, grpcEndpoint: endpoint } = await provider.connect();
      setAddress(pkh);
      setGrpcEndpoint(endpoint);
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

      const tx = provider.transaction().to(to).amount(amountInNicks).build();

      const txId = await provider.sendTransaction(tx);
      return txId;
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
    error,
    connect,
    disconnect,
    sendTransaction,
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
