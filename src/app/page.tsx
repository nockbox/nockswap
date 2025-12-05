"use client";

import { useState } from "react";
import PageLayout from "@/components/layout/PageLayout";
import SwapCard from "@/components/swap/SwapCard";
import SuccessCard from "@/components/swap/SuccessCard";

export default function Home() {
  const [showSuccess, setShowSuccess] = useState(false);

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
              Nock Swap
            </h1>
            <p
              style={{
                fontSize: 18,
                color: theme.textPrimary,
                lineHeight: "26px",
                margin: 0,
              }}
            >
              Your Bridge from Nock to Nock
            </p>
          </div>

          {/* Swap card or Success card */}
          <div style={{ marginTop: 31, width: 480 }}>
            {showSuccess ? (
              <SuccessCard
                isDarkMode={isDarkMode}
                onHomeClick={() => setShowSuccess(false)}
              />
            ) : (
              <SwapCard
                isDarkMode={isDarkMode}
                onSwapSuccess={() => setShowSuccess(true)}
              />
            )}
          </div>
        </>
      )}
    </PageLayout>
  );
}
