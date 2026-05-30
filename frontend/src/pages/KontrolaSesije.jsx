import { useState, useEffect } from "react";
import {
  getAktivnaSesija,
  startSesija,
  stopSesija,
  getUredajiStatus,
} from "../api.js";

const MODES = [
  {
    id: 1,
    key: "pull",
    label: "PULL",
    desc: "Stalno aktivan, reagira u realnom vremenu.",
    pros: ["Precizno navodnjavanje", "Nema kašnjenja"],
    cons: ["Visoka potrošnja baterije"],
    color: "var(--teal)",
  },
  {
    id: 2,
    key: "push",
    label: "PUSH",
    desc: "Deep sleep — budi se, provjeri, odluči, zaspi.",
    pros: ["Niska potrošnja baterije", "Dugi vijek"],
    cons: ["Kašnjenje do N minuta"],
    color: "var(--violet)",
  },
  {
    id: 3,
    key: "timer",
    label: "TIMER",
    desc: "Fiksni raspored bez povratne informacije.",
    pros: ["Najjednostavnija logika"],
    cons: ["Ignorira senzore", "Baseline referenca"],
    color: "var(--amber)",
  },
];

function Label({ children }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9.5,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--tx-2)",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export default function KontrolaSesije() {
  const [aktivna, setAktivna] = useState(null);
  const [mod, setMod] = useState(1);
  const [threshold, setThr] = useState(50);
  const [intMin, setIntMin] = useState(5);
  const [intPalj, setIntPalj] = useState(60);
  const [traj, setTraj] = useState(30);
  const [napomena, setNap] = useState("");
  const [toast, setToast] = useState(null);
  const [stopping, setStopping] = useState(false);
  const [uredaji, setUredaji] = useState({ senzori: false, pumpa: false });

  useEffect(() => {
    getAktivnaSesija()
      .then(setAktivna)
      .catch(() => setAktivna(null));
  }, []);

  useEffect(() => {
    const poll = () =>
      getUredajiStatus()
        .then(setUredaji)
        .catch(() => {});
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  const notify = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const handleStart = async () => {
    try {
      const body = {
        modId: mod,
        threshold,
        intervalMinuta: mod === 2 ? intMin : null,
        intervalPaljenja: mod === 3 ? intPalj : null,
        trajanjePaljenja: mod === 3 ? traj : null,
        napomena: napomena.trim() || null,
      };
      const res = await startSesija(body);
      const nova = await getAktivnaSesija();
      setAktivna(nova);
      notify(`Sesija #${res.id} pokrenuta. Resetiraj mikrokontrolere.`);
    } catch {
      notify("Greška pri pokretanju.", false);
    }
  };

  const handleStop = async () => {
    if (!aktivna) return;
    setStopping(true);
    try {
      await stopSesija(aktivna.id);
      setAktivna(null);
      notify("Sesija završena i zatvorena.");
    } catch {
      notify("Greška.", false);
    } finally {
      setStopping(false);
    }
  };

  const selectedMode = MODES.find((m) => m.id === mod);

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
          Kontrola sesije
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
          ODABERI MOD → KONFIGURIRAJ → POKRENI → RESETIRAJ UREĐAJE
        </p>
      </div>

      {/* Active session */}
      {aktivna && (
        <div
          style={{
            marginBottom: 24,
            padding: "18px 22px",
            background: "var(--bg-2)",
            border: "1px solid rgba(104,194,94,.3)",
            borderLeft: "3px solid var(--green)",
            borderRadius: "var(--r-md)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--tx-2)",
                marginBottom: 6,
                letterSpacing: "0.08em",
              }}
            >
              AKTIVNA SESIJA
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  color: "var(--green)",
                  fontSize: 18,
                }}
              >
                #{aktivna.id}
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "var(--r-xs)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  background: `${MODES.find((m) => m.key === aktivna.mod)?.color ?? "var(--teal)"}20`,
                  color:
                    MODES.find((m) => m.key === aktivna.mod)?.color ??
                    "var(--teal)",
                  border: `1px solid ${MODES.find((m) => m.key === aktivna.mod)?.color ?? "var(--teal)"}40`,
                }}
              >
                {aktivna.mod}
              </span>
              <span style={{ color: "var(--tx-1)", fontSize: 13 }}>
                threshold{" "}
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--amber)",
                  }}
                >
                  {aktivna.threshold}%
                </span>
              </span>
              <span
                style={{
                  color: "var(--tx-2)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                }}
              >
                {new Date(aktivna.pocetak).toLocaleString("hr")}
              </span>
            </div>
          </div>
          <button
            className="btn btn-red"
            onClick={handleStop}
            disabled={stopping}
            style={{ minWidth: 140 }}
          >
            {stopping ? "…" : "⏹ Završi mjerenje"}
          </button>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* Left: mode select + form */}
        <div>
          {/* Mode cards */}
          <Label>Odaberi mod rada</Label>
          <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
            {MODES.map((m) => (
              <div
                key={m.id}
                onClick={() => setMod(m.id)}
                style={{
                  flex: 1,
                  cursor: "pointer",
                  padding: "14px 12px",
                  borderRadius: "var(--r-md)",
                  background: mod === m.id ? `${m.color}10` : "var(--bg-2)",
                  border: `1px solid ${mod === m.id ? m.color : "var(--br-1)"}`,
                  borderTop: `2px solid ${mod === m.id ? m.color : "var(--br-2)"}`,
                  transition: "all .15s",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: mod === m.id ? m.color : "var(--tx-2)",
                    marginBottom: 4,
                  }}
                >
                  0{m.id}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 13,
                    color: mod === m.id ? m.color : "var(--tx-1)",
                    marginBottom: 6,
                  }}
                >
                  {m.label}
                </div>
                <ul style={{ padding: 0, listStyle: "none" }}>
                  {m.pros.map((p) => (
                    <li
                      key={p}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        color: "var(--green)",
                        marginBottom: 2,
                      }}
                    >
                      + {p}
                    </li>
                  ))}
                  {m.cons.map((c) => (
                    <li
                      key={c}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        color: "var(--tx-2)",
                        marginBottom: 2,
                      }}
                    >
                      − {c}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Parameters */}
          <Field label="Threshold vlage (%)">
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={threshold}
              onChange={(e) => setThr(Number(e.target.value))}
            />
          </Field>

          {mod === 2 && (
            <Field label="Interval buđenja (minute)">
              <input
                type="number"
                min="1"
                max="60"
                value={intMin}
                onChange={(e) => setIntMin(Number(e.target.value))}
              />
            </Field>
          )}

          {mod === 3 && (
            <>
              <Field label="Interval između paljenja (minute)">
                <input
                  type="number"
                  min="1"
                  max="240"
                  value={intPalj}
                  onChange={(e) => setIntPalj(Number(e.target.value))}
                />
              </Field>
              <Field label="Trajanje paljenja pumpe (sekunde)">
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={traj}
                  onChange={(e) => setTraj(Number(e.target.value))}
                />
              </Field>
            </>
          )}

          <Field label="Napomena (opcionalno)">
            <input
              type="text"
              value={napomena}
              onChange={(e) => setNap(e.target.value)}
              placeholder="npr. Mjerenje u loncima — sat vremena"
            />
          </Field>

          {/* Device status */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 12,
            }}
          >
            {[
              { key: "senzori", label: "Senzori", ok: uredaji.senzori },
              { key: "pumpa", label: "Pumpa", ok: uredaji.pumpa },
            ].map(({ key, label, ok }) => (
              <div
                key={key}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "8px 12px",
                  borderRadius: "var(--r-sm)",
                  background: ok
                    ? "rgba(104,194,94,.07)"
                    : "rgba(220,80,80,.07)",
                  border: `1px solid ${ok ? "rgba(104,194,94,.25)" : "rgba(220,80,80,.25)"}`,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: ok ? "var(--green)" : "var(--red)",
                    boxShadow: ok ? "0 0 6px var(--green)" : "none",
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: ok ? "var(--green)" : "var(--red)",
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--tx-2)",
                    marginLeft: "auto",
                  }}
                >
                  {ok ? "READY" : "OFFLINE"}
                </span>
              </div>
            ))}
          </div>

          <button
            className="btn btn-green btn-wide"
            onClick={handleStart}
            disabled={!uredaji.senzori || !uredaji.pumpa}
            title={
              !uredaji.senzori || !uredaji.pumpa
                ? "Čekam da se oba uređaja prijave kao READY"
                : ""
            }
          >
            ▶ Započni mjerenje
          </button>

          {toast && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                borderRadius: "var(--r-sm)",
                background: toast.ok
                  ? "rgba(104,194,94,.08)"
                  : "rgba(220,80,80,.08)",
                border: `1px solid ${toast.ok ? "rgba(104,194,94,.3)" : "rgba(220,80,80,.3)"}`,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: toast.ok ? "var(--green)" : "var(--red)",
                lineHeight: 1.5,
              }}
            >
              {toast.msg}
            </div>
          )}
        </div>

        {/* Right: summary card */}
        <div
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--br-1)",
            borderTop: `2px solid ${selectedMode?.color}`,
            borderRadius: "var(--r-md)",
            padding: "20px 24px",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--tx-2)",
              marginBottom: 14,
            }}
          >
            Pregled konfiguracije
          </div>

          {[
            ["Mod", `${mod} — ${selectedMode?.label}`],
            ["Threshold", `${threshold} %`],
            ...(mod === 2
              ? [
                  ["Interval buđenja", `${intMin} min`],
                  ["Max kašnjenje", `${intMin} min`],
                  ["Logika pumpe", "ON dok vlaga < threshold"],
                ]
              : []),
            ...(mod === 3
              ? [
                  ["Interval paljenja", `${intPalj} min`],
                  ["Trajanje pumpe", `${traj} s`],
                ]
              : []),
            ...(napomena ? [["Napomena", napomena]] : []),
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                padding: "9px 0",
                borderBottom: "1px solid var(--br-1)",
              }}
            >
              <span
                style={{
                  color: "var(--tx-2)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                }}
              >
                {k}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--tx-0)",
                  textAlign: "right",
                  maxWidth: "60%",
                }}
              >
                {v}
              </span>
            </div>
          ))}

          <div
            style={{
              marginTop: 20,
              padding: "14px",
              background: "var(--bg-3)",
              borderRadius: "var(--r-sm)",
              borderLeft: "3px solid var(--tx-2)",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--tx-2)",
                lineHeight: 1.6,
              }}
            >
              Nakon klika <span style={{ color: "var(--green)" }}>Započni</span>
              , resetiraj oba mikrokontrolera. Uređaji će odmah primiti
              konfiguraciju i početi raditi u odabranom modu.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
