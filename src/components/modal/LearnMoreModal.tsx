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
              NockSwap now works in both directions: NOCK ↔ Base. Pick your
              direction and the flow mirrors itself.
            </p>

            <p style={{ margin: 0, color: theme.titleColor }}>
              <strong>Nockchain → Base (deposit)</strong>
            </p>
            <ol
              style={{
                margin: 0,
                paddingLeft: 20,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <li>
                <strong>You send NOCK</strong> to the bridge&apos;s multisig
                address on Nockchain. Your transaction includes your Base
                wallet address in the transaction data.
              </li>
              <li>
                <strong>Operators verify your deposit.</strong> Four trusted
                ecosystem partners—Zorp, NockBox, Lambda, and
                SWPS—independently confirm it.
              </li>
              <li>
                <strong>NOCK is minted on Base.</strong> Once verified, the
                equivalent amount of NOCK (ERC-20) is minted and sent to your
                Base wallet.
              </li>
            </ol>

            <p style={{ margin: 0, color: theme.titleColor }}>
              <strong>Base → Nockchain (withdrawal)</strong>
            </p>
            <ol
              style={{
                margin: 0,
                paddingLeft: 20,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <li>
                <strong>You burn NOCK on Base.</strong> Your transaction
                includes your Nockchain address. The ERC-20 NOCK is burned to
                remove it from circulation on Base.
              </li>
              <li>
                <strong>Operators verify the burn.</strong> The same four
                partners independently confirm it.
              </li>
              <li>
                <strong>NOCK is released on Nockchain.</strong> Once verified,
                the equivalent amount is sent from the multisig to your
                Nockchain address.
              </li>
            </ol>

            <p style={{ margin: 0, color: theme.titleColor }}>
              <strong>Both directions</strong>
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: 20,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <li>
                <strong>Minimum:</strong> 100,000 NOCK
              </li>
              <li>
                <strong>Fee:</strong> ~0.3% (covers gas costs)
              </li>
              <li>
                <strong>Timing:</strong> Each step can take a while depending
                on network conditions and operator confirmation. There is
                currently no progress indicator—expect your NOCK to arrive
                after all steps complete, typically several hours.
              </li>
              <li>
                <strong>Settlement:</strong> NockSwap only initiates and
                confirms the Base side of each transaction. Bridge settlement
                and final execution are handled by Nockchain and the bridge
                operators.
              </li>
            </ul>
          </div>

          {/* Divider */}
          <div
            style={{
              width: "100%",
              height: 0,
              borderTop: `1px solid ${theme.dividerColor}`,
            }}
          />

          {/* Footer */}
          <div
            style={{
              width: "100%",
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 15,
              fontWeight: 500,
              lineHeight: "22px",
              letterSpacing: 0.15,
              color: theme.textColor,
            }}
          >
            The bridge infrastructure is built and maintained by{" "}
            <a
              href="https://zorp.io"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: theme.titleColor, textDecoration: "underline" }}
            >
              Zorp
            </a>
            . NockSwap is a front-end interface built by{" "}
            <a
              href="https://nockbox.org"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: theme.titleColor, textDecoration: "underline" }}
            >
              NockBox Inc.
            </a>
            , the team behind{" "}
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
          </div>
        </div>
      </div>
    </>
  );
}
