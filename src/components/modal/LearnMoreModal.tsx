"use client";

interface LearnMoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

export default function LearnMoreModal({ isOpen, onClose, isDarkMode = false }: LearnMoreModalProps) {
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
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 20,
          padding: 20,
          width: 340,
          height: 487,
          background: theme.background,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          overflow: "clip",
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
          How the bridge works
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
          }}
        >
          Security is our superpower. NOCK Chain turns complex blockchain tools into seamless browser experiences users trust and developers love.
        </div>
      </div>
    </>
  );
}
