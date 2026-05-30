import { useState } from "react";
import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/", num: "01", label: "Dashboard", sub: "Real-time" },
  { to: "/sesija", num: "02", label: "Sesija", sub: "Upravljanje" },
  { to: "/povijest", num: "03", label: "Povijest", sub: "Analiza" },
  { to: "/usporedba", num: "04", label: "Usporedba", sub: "Grafovi" },
];

export default function Layout({ children }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside
        style={{
          width: 228,
          flexShrink: 0,
          background: "var(--bg-0)",
          borderRight: "1px solid var(--br-1)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: "28px 24px 20px",
            borderBottom: "1px solid var(--br-1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: "var(--bg-3)",
                border: "1px solid var(--br-2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 2 C10 2 4 8 4 12.5 A6 6 0 0 0 16 12.5 C16 8 10 2 10 2Z"
                  fill="none"
                  stroke="var(--teal)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 10 L10 16"
                  stroke="var(--green)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M7.5 13.5 L10 16 L12.5 13.5"
                  stroke="var(--green)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: 16,
                  letterSpacing: "-0.02em",
                  color: "var(--tx-0)",
                }}
              >
                ASN
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  color: "var(--tx-2)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginTop: 1,
                }}
              >
                Navodnjavanje
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "14px 12px" }}>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"}>
              {({ isActive }) => (
                <div
                  onMouseEnter={() => setHovered(item.to)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "9px 12px",
                    borderRadius: "var(--r-sm)",
                    marginBottom: 2,
                    cursor: "pointer",
                    transition: "background .12s",
                    borderLeft: `2px solid ${isActive ? "var(--green)" : "transparent"}`,
                    background: isActive
                      ? "var(--bg-3)"
                      : hovered === item.to
                        ? "var(--bg-2)"
                        : "transparent",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 700,
                      color: isActive ? "var(--green)" : "var(--tx-2)",
                      minWidth: 18,
                    }}
                  >
                    {item.num}
                  </span>
                  <div>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? "var(--tx-0)" : "var(--tx-1)",
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9.5,
                        color: "var(--tx-2)",
                        marginTop: 1,
                      }}
                    >
                      {item.sub}
                    </div>
                  </div>
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Status footer */}
        <div
          style={{
            padding: "16px 20px",
            borderTop: "1px solid var(--br-1)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              marginBottom: 8,
            }}
          >
            <div
              className="pulse"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--green)",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9.5,
                color: "var(--tx-2)",
                letterSpacing: "0.08em",
              }}
            >
              MQTT LIVE
            </span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              color: "var(--tx-2)",
            }}
          >
            192.168.1.112:1883
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: "auto", background: "var(--bg-1)" }}>
        <div
          className="fade-up"
          key={typeof window !== "undefined" ? window.location.pathname : ""}
          style={{ padding: "32px 36px", maxWidth: 1060, width: "100%" }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
