"use client";

interface LearnMoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

export default function LearnMoreModal({
  isOpen,
  onClose,
  isDarkMode = false,
}: LearnMoreModalProps) {
  if (!isOpen) return null;

  const theme = {
    background: isDarkMode ? "#101010" : "#fff",
    border: isDarkMode ? "#171717" : "#ededed",
    titleColor: isDarkMode ? "#fff" : "#000",
    dividerColor: isDarkMode ? "#333" : "#e4e3dd",
    textColor: isDarkMode ? "#aaaaaa" : "#666",
    backdropColor: isDarkMode ? "rgba(0, 0, 0, 0.5)" : "rgba(0, 0, 0, 0.3)",
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: theme.backdropColor,
          zIndex: 100,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: 60,
          right: 20,
          zIndex: 101,
          width: 340,
          maxHeight: "calc(100vh - 80px)",
          background: theme.background,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 20,
            padding: 20,
            maxHeight: "calc(100vh - 80px)",
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          {/* Title */}
          <div
            style={{
              width: "100%",
              fontFamily: "var(--font-lora), serif",
              fontSize: 28,
              fontWeight: 600,
              lineHeight: "32px",
              letterSpacing: -0.56,
              color: theme.titleColor,
            }}
          >
            How the Bridge Works
          </div>

          {/* Divider */}
          <div
            style={{
              width: "100%",
              height: 0,
              borderTop: `1px dashed ${theme.dividerColor}`,
            }}
          />

          {/* Description */}
          <div
            style={{
              width: "100%",
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 15,
              fontWeight: 500,
              lineHeight: "22px",
              letterSpacing: 0.15,
              color: theme.textColor,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <p style={{ margin: 0 }}>
              <strong>1.</strong> You send NOCK to the bridge&apos;s multisig
              address on Nockchain. Your transaction includes your Base wallet
              address in the transaction data.
            </p>
            <p style={{ margin: 0 }}>
              <strong>2.</strong> Bridge operators verify your transaction. Four
              trusted ecosystem partners—Zorp, NockBox, Lambda, and
              SWPS—independently confirm the deposit.
            </p>
            <p style={{ margin: 0 }}>
              <strong>3.</strong> Nock is minted on Base. Once verified, the
              equivalent amount of Nock (ERC-20) is minted and sent to your Base
              wallet address.
            </p>
            <p style={{ margin: 0 }}>
              A 0.3% fee is deducted by the bridge to cover gas costs on Base.
              The minimum bridge amount is 100,000 Nock.
            </p>
            <p style={{ margin: 0, fontStyle: "italic" }}>
              Please note: Each step may take some time depending on network
              conditions and operator confirmation. There is currently no
              progress indicator, your Nock will arrive in your Base wallet once
              all steps are complete.
            </p>
            <p style={{ margin: 0 }}>
              NockSwap is built by NockBox Inc., the team behind{" "}
              <a
                href="https://iriswallet.io"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: theme.titleColor, textDecoration: "underline" }}
              >
                Iris Wallet
              </a>{" "}
              and{" "}
              <a
                href="https://pool.nockbox.org"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: theme.titleColor, textDecoration: "underline" }}
              >
                pool.nockbox.org
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
