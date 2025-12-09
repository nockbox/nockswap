"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import LearnMoreModal from "@/components/modal/LearnMoreModal";
import { ASSETS } from "@/lib/constants";

export interface Theme {
  background: string;
  textPrimary: string;
  cardBg: string;
  cardBorder: string;
  headerButtonBg: string;
  headerButtonBorder: string;
  toggleBg: string;
  toggleActiveBg: string;
  dividerColor: string;
  titleTextShadow: string;
}

interface PageLayoutProps {
  children: (props: { isDarkMode: boolean; theme: Theme }) => React.ReactNode;
  mainStyle?: React.CSSProperties;
}

export default function PageLayout({ children, mainStyle }: PageLayoutProps) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showLearnMore, setShowLearnMore] = useState(false);

  const theme: Theme = {
    background: isDarkMode ? "#000" : "#f6f5f1",
    textPrimary: isDarkMode ? "#fff" : "#000",
    cardBg: isDarkMode ? "#101010" : "#fff",
    cardBorder: isDarkMode ? "#171717" : "#ededed",
    headerButtonBg: isDarkMode ? "#171717" : "#fff",
    headerButtonBorder: isDarkMode ? "#252525" : "#e4e3dd",
    toggleBg: isDarkMode ? "#171717" : "#e4e3dd",
    toggleActiveBg: isDarkMode ? "#444" : "#fff",
    dividerColor: isDarkMode ? "#333" : "#e4e3dd",
    titleTextShadow: isDarkMode
      ? "0px 1px 1px rgba(0, 0, 0, 0.2), 0px -1px 1px rgba(255, 255, 255, 0.2)"
      : "0px 1px 1px rgba(0, 0, 0, 0.2)",
  };

  return (
    <>
      <div
        style={{
          position: "relative",
          height: "100vh",
          background: theme.background,
          overflow: "hidden",
        }}
      >
        {/* Background decorative elements */}

        {/* Bottom right - NOCK text watermark */}
        <div
          style={{
            position: "absolute",
            pointerEvents: "none",
            left: 950, //919
            top: 630, // 757
            width: 509,
            height: 165,
            opacity: isDarkMode ? 0.1 : 1,
          }}
        >
          <Image
            src="/assets/design-1.svg"
            alt=""
            fill
            style={{ objectFit: "contain" }}
          />
        </div>

        {/* Top right - Rotated shape */}
        <div
          style={{
            position: "absolute",
            pointerEvents: "none",
            left: 1246,
            top: 80,
            width: 214,
            height: 223,
            transform: "rotate(12.314deg)",
            opacity: isDarkMode ? 0.1 : 1,
          }}
        >
          <Image
            src="/assets/design-3.svg"
            alt=""
            fill
            style={{ objectFit: "contain" }}
          />
        </div>

        {/* Bottom left - Large hand/plant illustration */}
        <div
          style={{
            position: "absolute",
            pointerEvents: "none",
            left: "calc(50% - 617px)",
            transform: "translateX(-50%)",
            bottom: -122,
            width: 474,
            height: 587,
            opacity: isDarkMode ? 0.1 : 1,
          }}
        >
          <Image
            src="/assets/design-4.svg"
            alt=""
            fill
            priority
            style={{ objectFit: "contain" }}
          />
        </div>

        {/* Top left corner - NOCK watermark */}
        <div
          style={{
            position: "absolute",
            pointerEvents: "none",
            left: -47,
            top: -99,
            width: 354,
            height: 358,
            opacity: isDarkMode ? 0.1 : 1,
          }}
        >
          <Image
            src="/assets/design-2.svg"
            alt=""
            fill
            priority
            style={{ objectFit: "contain" }}
          />
        </div>

        {/* Header */}
        <header
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            right: 20,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            zIndex: 20,
          }}
        >
          <Link href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={isDarkMode ? ASSETS.nockswapLogoDark : ASSETS.nockswapLogo}
              alt="Nockswap Logo"
              width={57}
              height={60}
            />
          </Link>

          <button
            onClick={() => setShowLearnMore(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 14px",
              background: theme.headerButtonBg,
              border: `1px solid ${theme.headerButtonBorder}`,
              borderRadius: 58,
              cursor: "pointer",
              color: theme.textPrimary,
            }}
          >
            <img
              src="/assets/information.svg"
              alt="Info"
              style={{ width: 16, height: 16 }}
            />
            <span
              style={{
                color: theme.textPrimary,
                textAlign: "center",
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 15,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "16px",
              }}
            >
              Learn more
            </span>
          </button>
        </header>

        {/* Main content */}
        <main
          style={{
            position: "relative",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 80,
            paddingBottom: 80,
            height: "100vh",
            boxSizing: "border-box",
            overflow: "hidden",
            ...mainStyle,
          }}
        >
          {children({ isDarkMode, theme })}
        </main>

        {/* Footer */}
        <footer
          style={{
            position: "absolute",
            bottom: 30,
            left: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 24,
            zIndex: 15,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              fontSize: 13,
              color: theme.textPrimary,
              letterSpacing: -0.26,
            }}
          >
            <span style={{ opacity: 0.5 }}>© 2025 Nockswap</span>
            <a
              href="/terms"
              style={{
                opacity: 0.5,
                textDecoration: "underline",
                color: theme.textPrimary,
              }}
            >
              Terms of Service
            </a>
            <a
              href="/privacy"
              style={{
                opacity: 0.5,
                textDecoration: "underline",
                color: theme.textPrimary,
              }}
            >
              Privacy Policy
            </a>
          </div>

          {/* Theme toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: theme.toggleBg,
              borderRadius: 14,
              padding: 4,
              marginLeft: 16,
            }}
          >
            <button
              onClick={() => setIsDarkMode(false)}
              style={{
                padding: 4,
                background: !isDarkMode ? theme.toggleActiveBg : "transparent",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: theme.textPrimary,
              }}
              aria-label="Light mode"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M5.04134 3.45004L4.71634 3.12504C4.5613 2.97095 4.3516 2.88446 4.13301 2.88446C3.91442 2.88446 3.70471 2.97095 3.54967 3.12504L3.54134 3.13337C3.46414 3.20964 3.40285 3.30048 3.36102 3.40061C3.31918 3.50075 3.29764 3.60819 3.29764 3.71671C3.29764 3.82523 3.31918 3.93267 3.36102 4.0328C3.40285 4.13294 3.46414 4.22377 3.54134 4.30004L3.86634 4.62504C4.19134 4.95004 4.70801 4.95004 5.03301 4.62504L5.04134 4.61671C5.11854 4.54044 5.17983 4.4496 5.22167 4.34947C5.2635 4.24934 5.28504 4.1419 5.28504 4.03337C5.28504 3.92485 5.2635 3.81741 5.22167 3.71728C5.17983 3.61714 5.11854 3.52631 5.04134 3.45004ZM2.50801 8.75004H1.65801C1.19967 8.75004 0.833008 9.11671 0.833008 9.57504V9.58337C0.833008 10.0417 1.19967 10.4084 1.65801 10.4084H2.49967C2.96634 10.4167 3.33301 10.05 3.33301 9.59171V9.58337C3.33301 9.11671 2.96634 8.75004 2.50801 8.75004ZM10.008 0.458374H9.99967C9.53301 0.458374 9.16634 0.825041 9.16634 1.28337V2.08337C9.16634 2.54171 9.53301 2.90837 9.99134 2.90837H9.99967C10.4663 2.91671 10.833 2.55004 10.833 2.09171V1.28337C10.833 0.825041 10.4663 0.458374 10.008 0.458374ZM16.458 3.13337C16.133 2.80837 15.608 2.80837 15.283 3.12504L14.958 3.45004C14.8808 3.52631 14.8195 3.61714 14.7777 3.71728C14.7358 3.81741 14.7143 3.92485 14.7143 4.03337C14.7143 4.1419 14.7358 4.24934 14.7777 4.34947C14.8195 4.4496 14.8808 4.54044 14.958 4.61671L14.9663 4.62504C15.2913 4.95004 15.8163 4.95004 16.133 4.62504L16.458 4.30004C16.5352 4.22377 16.5965 4.13294 16.6383 4.0328C16.6802 3.93267 16.7017 3.82523 16.7017 3.71671C16.7017 3.60819 16.6802 3.50075 16.6383 3.40061C16.5965 3.30048 16.5352 3.20964 16.458 3.13337ZM14.9497 15.7167L15.2747 16.0417C15.4305 16.1975 15.6418 16.2851 15.8622 16.2851C16.0825 16.2851 16.2939 16.1975 16.4497 16.0417C16.6055 15.8859 16.693 15.6746 16.693 15.4542C16.693 15.2339 16.6055 15.0225 16.4497 14.8667L16.1247 14.5417C15.9696 14.3876 15.7599 14.3011 15.5413 14.3011C15.3228 14.3011 15.113 14.3876 14.958 14.5417C14.6247 14.875 14.6247 15.3917 14.9497 15.7167ZM16.6663 9.57504V9.58337C16.6663 10.0417 17.033 10.4084 17.4913 10.4084H18.333C18.7913 10.4084 19.158 10.0417 19.158 9.58337V9.57504C19.158 9.11671 18.7913 8.75004 18.333 8.75004H17.4913C17.033 8.75004 16.6663 9.11671 16.6663 9.57504ZM9.99967 4.58337C7.24134 4.58337 4.99967 6.82504 4.99967 9.58337C4.99967 12.3417 7.24134 14.5834 9.99967 14.5834C12.758 14.5834 14.9997 12.3417 14.9997 9.58337C14.9997 6.82504 12.758 4.58337 9.99967 4.58337ZM9.99134 18.7084H9.99967C10.458 18.7084 10.8247 18.3417 10.8247 17.8834V17.0834C10.8247 16.625 10.458 16.2584 9.99967 16.2584H9.99134C9.53301 16.2584 9.16634 16.625 9.16634 17.0834V17.8834C9.16634 18.3417 9.53301 18.7084 9.99134 18.7084ZM3.54134 16.0334C3.86634 16.3584 4.39134 16.3584 4.71634 16.0334L5.04134 15.7084C5.19543 15.5533 5.28192 15.3436 5.28192 15.125C5.28192 14.9065 5.19543 14.6967 5.04134 14.5417L5.03301 14.5334C4.95591 14.4561 4.86434 14.3948 4.76353 14.353C4.66272 14.3112 4.55465 14.2897 4.44551 14.2897C4.33637 14.2897 4.2283 14.3112 4.12749 14.353C4.02668 14.3948 3.9351 14.4561 3.85801 14.5334L3.53301 14.8584C3.21634 15.1917 3.21634 15.7084 3.54134 16.0334Z"
                  fill="currentColor"
                />
              </svg>
            </button>
            <button
              onClick={() => setIsDarkMode(true)}
              style={{
                padding: 4,
                borderRadius: 10,
                border: "none",
                background: isDarkMode ? theme.toggleActiveBg : "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: theme.textPrimary,
              }}
              aria-label="Dark mode"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10.0475 16.6667C8.19586 16.6667 6.62169 16.0184 5.32503 14.7217C4.02836 13.425 3.3803 11.8511 3.38086 10C3.38086 8.62781 3.77336 7.36809 4.55836 6.22087C5.34392 5.07254 6.4578 4.2467 7.90003 3.74337C8.07003 3.68392 8.21892 3.66837 8.34669 3.6967C8.47447 3.72504 8.5803 3.78031 8.66419 3.86254C8.74808 3.94476 8.80142 4.05031 8.82419 4.1792C8.84642 4.30865 8.82892 4.44448 8.77169 4.5867C8.66392 4.8517 8.58558 5.12142 8.53669 5.39587C8.4878 5.67031 8.46364 5.95504 8.46419 6.25004C8.46419 7.73504 8.98169 8.99531 10.0167 10.0309C11.0522 11.0659 12.3125 11.5834 13.7975 11.5834C14.1853 11.5834 14.54 11.5423 14.8617 11.46C15.1839 11.3778 15.4584 11.3111 15.685 11.26C15.8061 11.2378 15.917 11.2406 16.0175 11.2684C16.1181 11.2961 16.1992 11.345 16.2609 11.415C16.3247 11.4845 16.3681 11.57 16.3909 11.6717C16.4136 11.7734 16.4006 11.8892 16.3517 12.0192C15.9545 13.3803 15.1759 14.495 14.0159 15.3634C12.8559 16.2317 11.5331 16.6661 10.0475 16.6667Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </footer>
      </div>

      <LearnMoreModal
        isOpen={showLearnMore}
        onClose={() => setShowLearnMore(false)}
        isDarkMode={isDarkMode}
      />
    </>
  );
}
