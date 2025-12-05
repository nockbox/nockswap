"use client";

import PageLayout from "@/components/layout/PageLayout";

export default function TermsOfService() {
  return (
    <PageLayout>
      {({ isDarkMode, theme }) => (
        <>
          {/* Title section */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
              width: 560,
              textAlign: "center",
            }}
          >
            <h1
              style={{
                fontFamily: "var(--font-lora), serif",
                fontSize: 72,
                fontWeight: 500,
                color: theme.textPrimary,
                lineHeight: "72px",
                letterSpacing: -2.88,
                textShadow: theme.titleTextShadow,
                WebkitTextStrokeWidth: "12px",
                WebkitTextStrokeColor: isDarkMode ? "transparent" : "#FFF",
                paintOrder: "stroke fill",
                margin: 0,
              }}
            >
              Terms of Service
            </h1>
            <p
              style={{
                fontSize: 18,
                color: theme.textPrimary,
                lineHeight: "26px",
                margin: 0,
              }}
            >
              Last Updated: November 12, 2025
            </p>
          </div>

          {/* Content card */}
          <div
            style={{
              marginTop: 31,
              width: 720,
              flex: 1,
              minHeight: 0,
              maxHeight: 678,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 32,
              background: theme.cardBg,
              border: `1px solid ${theme.cardBorder}`,
              borderRadius: 16,
              overflow: "auto",
              boxSizing: "border-box",
            }}
          >
            {/* Section 1 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h2
                style={{
                  fontFamily: "var(--font-lora), serif",
                  fontSize: 30,
                  fontWeight: 600,
                  lineHeight: "34px",
                  letterSpacing: -0.6,
                  color: theme.textPrimary,
                  margin: 0,
                }}
              >
                1. Data we collect
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 15,
                    fontWeight: 700,
                    lineHeight: "26px",
                    color: theme.textPrimary,
                    margin: 0,
                  }}
                >
                  You Provide
                </p>
                <ul
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 15,
                    fontWeight: 400,
                    lineHeight: "26px",
                    color: theme.textPrimary,
                    margin: 0,
                    paddingLeft: 22,
                  }}
                >
                  <li>Email address (if contacting support)</li>
                  <li>Transaction hashes or public addresses (only if shared for support)</li>
                  <li>Feedback and bug reports</li>
                  <li>Device logs (only if manually submitted)</li>
                </ul>
              </div>
            </div>

            {/* Divider */}
            <div
              style={{
                width: "100%",
                height: 0,
                borderTop: `1px dashed ${theme.dividerColor}`,
              }}
            />

            {/* Section 2 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h2
                style={{
                  fontFamily: "var(--font-lora), serif",
                  fontSize: 30,
                  fontWeight: 600,
                  lineHeight: "34px",
                  letterSpacing: -0.6,
                  color: theme.textPrimary,
                  margin: 0,
                }}
              >
                2. Third-party services
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* RPC Providers */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <p
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 15,
                      fontWeight: 700,
                      lineHeight: "26px",
                      color: theme.textPrimary,
                      margin: 0,
                    }}
                  >
                    RPC Providers
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 15,
                      fontWeight: 400,
                      lineHeight: "26px",
                      color: theme.textPrimary,
                      margin: 0,
                    }}
                  >
                    The wallet connects to blockchain networks via RPC endpoints that may collect:
                  </p>
                  <ul
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 15,
                      fontWeight: 400,
                      lineHeight: "26px",
                      color: theme.textPrimary,
                      margin: 0,
                      paddingLeft: 22,
                    }}
                  >
                    <li>Your IP address</li>
                    <li>API requests (not private keys)</li>
                    <li>Request frequency</li>
                  </ul>
                  <p
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 15,
                      fontWeight: 400,
                      lineHeight: "26px",
                      color: theme.textPrimary,
                      margin: 0,
                    }}
                  >
                    You can change RPC providers in settings. Third-party RPCs have their own privacy policies.
                  </p>
                </div>

                {/* Payment Providers */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <p
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 15,
                      fontWeight: 700,
                      lineHeight: "26px",
                      color: theme.textPrimary,
                      margin: 0,
                    }}
                  >
                    Payment Providers
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 15,
                      fontWeight: 400,
                      lineHeight: "26px",
                      color: theme.textPrimary,
                      margin: 0,
                    }}
                  >
                    If using fiat on-ramps (MoonPay, Transak):
                  </p>
                  <ul
                    style={{
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 15,
                      fontWeight: 400,
                      lineHeight: "26px",
                      color: theme.textPrimary,
                      margin: 0,
                      paddingLeft: 22,
                    }}
                  >
                    <li>You interact directly with the payment provider</li>
                    <li>They collect KYC information per their policies</li>
                    <li>We receive only: completion status and public wallet address</li>
                    <li>We do NOT receive identity documents or payment details</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </PageLayout>
  );
}
