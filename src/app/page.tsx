"use client";

import { useState } from "react";
import PageLayout from "@/components/layout/PageLayout";
import SwapCard from "@/components/swap/SwapCard";
import ResultCard from "@/components/swap/ResultCard";
import { ASSETS } from "@/lib/constants";

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
              gap: 5,
              width: 560,
              textAlign: "center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                isDarkMode ? ASSETS.nockswapHeaderDark : ASSETS.nockswapHeader
              }
              alt="Nock Swap"
              width={320}
              height={72}
            />
            <p
              style={{
                fontSize: 18,
                color: theme.textPrimary,
                lineHeight: "26px",
                margin: 0,
              }}
            >
              Your Bridge from Nockchain to Base
            </p>
          </div>

          {/* Swap card or Success card */}
          <div style={{ marginTop: 31, width: 480 }}>
            {showSuccess ? (
              <ResultCard
                isDarkMode={isDarkMode}
                status="success"
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
