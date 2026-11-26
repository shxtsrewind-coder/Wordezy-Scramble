import React, { useEffect } from "react";

// One BGameWorld account for every game. Accounts are made and signed into on
// bgameworld.com/join/ only; this card sends the player there and brings them
// back to this game afterwards. Same file in every game repo
// (source: bgameworld-site/tools/games/AuthModal.tsx).

interface AuthModalProps {
  userId?: string | null;
  currentDisplayName: string;
  onResolved: (opts: { isAnonymous: boolean; displayName?: string; countryCode?: string | null }) => void;
}

const JOIN = "https://bgameworld.com/join/";

function joinUrl(mode: "signup" | "login") {
  const next = typeof window !== "undefined" ? window.location.href.split("#")[0] : "https://bgameworld.com/";
  return `${JOIN}?mode=${mode}&next=${encodeURIComponent(next)}`;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onResolved }) => {
  const later = () => onResolved({ isAnonymous: true });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") later(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const S = {
    back: { position: "fixed", inset: 0, zIndex: 60, background: "rgba(10,12,16,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
    card: { width: "100%", maxWidth: 400, background: "#fff", color: "#15171a", borderRadius: 18, padding: "26px 22px 20px", boxShadow: "0 20px 60px rgba(0,0,0,.3)", font: "15px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif", textAlign: "center" },
    logo: { width: 120, height: "auto", margin: "0 auto 10px", display: "block" },
    h: { font: "700 21px/1.25 system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif", margin: "0 0 8px" },
    p: { margin: "0 0 16px", color: "#3f444d" },
    primary: { display: "block", padding: "12px 14px", borderRadius: 12, background: "#1e7d4a", color: "#fff", fontWeight: 700, textDecoration: "none", marginBottom: 10 },
    secondary: { display: "block", padding: "11px 14px", borderRadius: 12, border: "1px solid #cfd3da", color: "#15171a", fontWeight: 600, textDecoration: "none", marginBottom: 6 },
    later: { background: "none", border: 0, color: "#6b717c", font: "inherit", fontSize: 14, textDecoration: "underline", cursor: "pointer", padding: 8 },
  } as const;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="bgw-acct-title" style={S.back as React.CSSProperties} onClick={later}>
      <div style={S.card as React.CSSProperties} onClick={(e) => e.stopPropagation()}>
        <img src="https://bgameworld.com/logo.webp" alt="BGameWorld" style={S.logo as React.CSSProperties} />
        <h2 id="bgw-acct-title" style={S.h}>Your free BGameWorld account</h2>
        <p style={S.p}>
          One account for every BGameWorld game: your name on the leaderboards, streaks saved on every device, and the
          members-only Daily Seven challenge.
        </p>
        <a href={joinUrl("signup")} style={S.primary}>Create free account</a>
        <a href={joinUrl("login")} style={S.secondary}>I already have an account</a>
        <button type="button" onClick={later} style={S.later}>Keep playing as a guest</button>
      </div>
    </div>
  );
};
