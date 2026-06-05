import { useState, useEffect } from "react";
import { getUredajiStatus, citajSenzor } from "../api.js";

const mono = (n, dec = 1) => (n != null ? Number(n).toFixed(dec) : "—");

function ResultCard({ label, value, unit, accent }) {
  return (
    <div
      style={{
        flex: 1,
        background: "var(--bg-3)",
        border: "1px solid var(--br-1)",
        borderTop: `2px solid ${accent}`,
        borderRadius: "var(--r-md)",
        padding: "18px 22px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--tx-2)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ lineHeight: 1 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 40,
            fontWeight: 700,
            color: accent,
            letterSpacing: "-0.03em",
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 15,
              color: "var(--tx-1)",
              marginLeft: 5,
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Dijagnostika() {
  const [uredaji, setUredaji] = useState({ senzori: false, pumpa: false });
  const [rezultat, setRezultat] = useState(null);
  const [loading, setLoading] = useState(false);
  const [poruka, setPoruka] = useState(null);

  useEffect(() => {
    const poll = () =>
      getUredajiStatus()
        .then(setUredaji)
        .catch(() => {});
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  const handleCitaj = async () => {
    setLoading(true);
    setPoruka(null);
    try {
      const r = await citajSenzor();
      if (!r?.online) {
        setRezultat(null);
        setPoruka({
          ok: false,
          msg: "Senzor nije online — uređaj se nije prijavio kao READY.",
        });
      } else if (!r.fresh) {
        setRezultat(r);
        setPoruka({
          ok: false,
          msg: "Komanda poslana, ali svježe očitavanje nije stiglo u 4s. Prikazana je zadnja poznata vrijednost.",
        });
      } else {
        setRezultat(r);
        setPoruka({ ok: true, msg: "Svježe očitavanje primljeno." });
      }
    } catch {
      setPoruka({ ok: false, msg: "Greška u komunikaciji s API-jem." });
    } finally {
      setLoading(false);
    }
  };

  const online = uredaji.senzori;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: "-0.03em",
          }}
        >
          Dijagnostika
        </h1>
        <p
          style={{
            color: "var(--tx-2)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            marginTop: 5,
            letterSpacing: "0.05em",
          }}
        >
          TEST SENZORA — OČITAJ NA ZAHTJEV (NE SPREMA SE U BAZU)
        </p>
      </div>

      <div
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--br-1)",
          borderRadius: "var(--r-md)",
          padding: "24px",
          maxWidth: 640,
        }}
      >
        {/* Sensor online status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: "var(--r-sm)",
            marginBottom: 18,
            background: online ? "rgba(104,194,94,.07)" : "rgba(220,80,80,.07)",
            border: `1px solid ${online ? "rgba(104,194,94,.25)" : "rgba(220,80,80,.25)"}`,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              flexShrink: 0,
              background: online ? "var(--green)" : "var(--red)",
              boxShadow: online ? "0 0 6px var(--green)" : "none",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: online ? "var(--green)" : "var(--red)",
            }}
          >
            Senzor {online ? "READY" : "OFFLINE"}
          </span>
        </div>

        <button
          className="btn btn-teal btn-wide"
          onClick={handleCitaj}
          disabled={!online || loading}
          title={!online ? "Senzor nije online" : ""}
        >
          {loading ? "Čekam očitavanje…" : "⟳ Očitaj senzor"}
        </button>

        {/* Result */}
        {rezultat && (
          <div style={{ display: "flex", gap: 14, marginTop: 20 }}>
            <ResultCard
              label="Vlaga tla"
              value={mono(rezultat.vlaga)}
              unit="%"
              accent="var(--teal)"
            />
            <ResultCard
              label="Temperatura"
              value={mono(rezultat.temperatura)}
              unit="°C"
              accent="var(--amber)"
            />
          </div>
        )}

        {rezultat?.timestamp && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--tx-2)",
              marginTop: 12,
            }}
          >
            očitano: {new Date(rezultat.timestamp).toLocaleString("hr")}
            {rezultat.fresh ? " · svježe" : " · zadnje poznato"}
          </div>
        )}

        {poruka && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              borderRadius: "var(--r-sm)",
              background: poruka.ok
                ? "rgba(104,194,94,.08)"
                : "rgba(220,80,80,.08)",
              border: `1px solid ${poruka.ok ? "rgba(104,194,94,.3)" : "rgba(220,80,80,.3)"}`,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: poruka.ok ? "var(--green)" : "var(--red)",
              lineHeight: 1.5,
            }}
          >
            {poruka.msg}
          </div>
        )}
      </div>
    </div>
  );
}
