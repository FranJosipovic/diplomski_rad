import { useState, useEffect } from "react";
import { getSesije, getSesija, getOcitavanja, getEventi } from "../api.js";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";

const COLOR_A = "#45bfb8";
const COLOR_B = "#e09a18";

function sec2hr(s) {
  const v = Math.round(s ?? 0);
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function normalise(ocitavanja, sesija) {
  if (!ocitavanja?.length || !sesija) return [];
  const t0 = new Date(sesija.pocetak).getTime();
  const t1 = sesija.kraj ? new Date(sesija.kraj).getTime() : Date.now();
  const dur = Math.max(t1 - t0, 1);
  return ocitavanja.map((o) => ({
    pct: Math.round(((new Date(o.timestamp).getTime() - t0) / dur) * 100),
    v: typeof o.vlaga === "number" ? o.vlaga : parseFloat(o.vlaga),
  }));
}

function normaliseBands(eventi, sesija) {
  if (!sesija) return [];
  const t0 = new Date(sesija.pocetak).getTime();
  const t1 = sesija.kraj ? new Date(sesija.kraj).getTime() : Date.now();
  const dur = Math.max(t1 - t0, 1);
  const bands = [];
  let onTs = null;
  for (const e of eventi ?? []) {
    if (e.status && onTs === null) onTs = new Date(e.timestamp).getTime();
    else if (!e.status && onTs !== null) {
      bands.push([onTs, new Date(e.timestamp).getTime()]);
      onTs = null;
    }
  }
  if (onTs !== null) bands.push([onTs, t1]);
  return bands.map(([s, e]) => [
    Math.max(0, Math.round(((s - t0) / dur) * 100)),
    Math.min(100, Math.round(((e - t0) / dur) * 100)),
  ]);
}

function mergeToGrid(a, b) {
  const keys = [
    ...new Set([...a.map((r) => r.pct), ...b.map((r) => r.pct)]),
  ].sort((x, y) => x - y);
  const mA = Object.fromEntries(a.map((r) => [r.pct, r.v]));
  const mB = Object.fromEntries(b.map((r) => [r.pct, r.v]));
  return keys.map((pct) => ({ pct, vA: mA[pct], vB: mB[pct] }));
}

const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--bg-3)",
        border: "1px solid var(--br-2)",
        borderRadius: 7,
        padding: "10px 14px",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 11,
        color: "var(--tx-0)",
      }}
    >
      <div style={{ color: "var(--tx-2)", marginBottom: 6, fontSize: 10 }}>
        trajanje {label}%
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: {p.value != null ? `${Number(p.value).toFixed(1)}%` : "—"}
        </div>
      ))}
    </div>
  );
};

const AXIS_STYLE = {
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 10,
  fill: "#4a6040",
};

function better(metricKey, a, b) {
  if (["postoIspodThresholda", "sekundeUpaljeno"].includes(metricKey)) {
    if (a == null || b == null) return null;
    return a < b ? "a" : b < a ? "b" : "eq";
  }
  if (["prosjecnaVlaga"].includes(metricKey)) {
    if (a == null || b == null) return null;
    return a > b ? "a" : b > a ? "b" : "eq";
  }
  return null;
}

export default function UsporedbaSeija() {
  const [sesije, setSesije] = useState([]);
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");
  const [detA, setDetA] = useState(null);
  const [detB, setDetB] = useState(null);
  const [chart, setChart] = useState([]);
  const [bandsA, setBandsA] = useState([]);
  const [bandsB, setBandsB] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSesije().then((s) => setSesije(s.filter((x) => !x.aktivna)));
  }, []);

  const usporedi = async () => {
    if (!idA || !idB || idA === idB) return;
    setLoading(true);
    try {
      const [dA, dB, ocA, ocB, evA, evB] = await Promise.all([
        getSesija(idA),
        getSesija(idB),
        getOcitavanja(idA),
        getOcitavanja(idB),
        getEventi(idA),
        getEventi(idB),
      ]);
      setDetA(dA);
      setDetB(dB);
      setChart(mergeToGrid(normalise(ocA, dA), normalise(ocB, dB)));
      setBandsA(normaliseBands(evA, dA));
      setBandsB(normaliseBands(evB, dB));
    } finally {
      setLoading(false);
    }
  };

  const METRICS = [
    { key: "mod", label: "Mod rada", fmt: (d) => d.mod },
    {
      key: "trajanjeSek",
      label: "Trajanje",
      fmt: (d) => sec2hr(d.trajanjeSek),
    },
    {
      key: "prosjecnaVlaga",
      label: "Prosj. vlaga",
      fmt: (d) => `${d.prosjecnaVlaga}%`,
    },
    { key: "minVlaga", label: "Min vlaga", fmt: (d) => `${d.minVlaga}%` },
    { key: "maxVlaga", label: "Max vlaga", fmt: (d) => `${d.maxVlaga}%` },
    {
      key: "postoIspodThresholda",
      label: "Ispod thresholda",
      fmt: (d) => `${d.postoIspodThresholda}%`,
    },
    {
      key: "brPaljenja",
      label: "Pumpa paljena",
      fmt: (d) => `${d.brPaljenja}×`,
    },
    {
      key: "sekundeUpaljeno",
      label: "Pumpa upaljena",
      fmt: (d) => sec2hr(d.sekundeUpaljeno),
    },
    { key: "threshold", label: "Threshold", fmt: (d) => `${d.threshold}%` },
  ];

  const sesOptions = sesije.map((s) => (
    <option key={s.id} value={s.id}>
      #{s.id} {s.mod} · {new Date(s.pocetak).toLocaleDateString("hr")}
    </option>
  ));

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
          Usporedba sesija
        </h1>
        <p
          style={{
            color: "var(--tx-2)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            marginTop: 5,
          }}
        >
          Odaberi dvije završene sesije za vizualnu i statističku usporedbu
        </p>
      </div>

      {/* Pickers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto",
          gap: 12,
          alignItems: "flex-end",
          marginBottom: 28,
          background: "var(--bg-2)",
          border: "1px solid var(--br-1)",
          borderRadius: "var(--r-md)",
          padding: "20px 24px",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: COLOR_A,
              marginBottom: 6,
            }}
          >
            — Sesija A
          </div>
          <select value={idA} onChange={(e) => setIdA(e.target.value)}>
            <option value="">— odaberi —</option>
            {sesOptions}
          </select>
        </div>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: COLOR_B,
              marginBottom: 6,
            }}
          >
            — Sesija B
          </div>
          <select value={idB} onChange={(e) => setIdB(e.target.value)}>
            <option value="">— odaberi —</option>
            {sesOptions}
          </select>
        </div>
        <button
          className="btn btn-ghost"
          onClick={usporedi}
          disabled={!idA || !idB || idA === idB || loading}
          style={{ alignSelf: "flex-end", whiteSpace: "nowrap" }}
        >
          {loading ? "…" : "⇌ Usporedi"}
        </button>
      </div>

      {detA && detB && !loading && (
        <div className="fade-up">
          {/* Chart */}
          <div
            style={{
              background: "var(--bg-2)",
              border: "1px solid var(--br-1)",
              borderRadius: "var(--r-md)",
              padding: "24px",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  color: "var(--tx-2)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Vlaga tla · normalizirano trajanje sesije
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[
                  { c: COLOR_A, l: `A · #${detA.id} ${detA.mod}` },
                  { c: COLOR_B, l: `B · #${detB.id} ${detB.mod}` },
                ].map(({ c, l }) => (
                  <div
                    key={l}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--tx-1)",
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 2,
                        background: c,
                        borderRadius: 1,
                      }}
                    />
                    {l}
                  </div>
                ))}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--tx-2)",
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: `${COLOR_A}30`,
                      border: `1px solid ${COLOR_A}60`,
                    }}
                  />
                  pumpa A
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--tx-2)",
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: `${COLOR_B}30`,
                      border: `1px solid ${COLOR_B}60`,
                    }}
                  />
                  pumpa B
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={chart}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1c2818" />
                <XAxis
                  dataKey="pct"
                  tick={AXIS_STYLE}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={AXIS_STYLE}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                  width={36}
                />
                <Tooltip content={<DarkTooltip />} />

                {/* Pump A bands */}
                {bandsA.map(([x1, x2], i) => (
                  <ReferenceArea
                    key={`a${i}`}
                    x1={x1}
                    x2={x2}
                    fill={`${COLOR_A}18`}
                    stroke={`${COLOR_A}50`}
                    strokeWidth={1}
                  />
                ))}
                {/* Pump B bands */}
                {bandsB.map(([x1, x2], i) => (
                  <ReferenceArea
                    key={`b${i}`}
                    x1={x1}
                    x2={x2}
                    fill={`${COLOR_B}18`}
                    stroke={`${COLOR_B}50`}
                    strokeWidth={1}
                  />
                ))}

                {detA.threshold === detB.threshold ? (
                  <ReferenceLine
                    y={detA.threshold}
                    stroke="#dc5050"
                    strokeDasharray="6 3"
                    strokeOpacity={0.6}
                    label={{
                      value: `thr ${detA.threshold}%`,
                      fill: "#dc5050",
                      fontSize: 10,
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                  />
                ) : (
                  <>
                    <ReferenceLine
                      y={detA.threshold}
                      stroke={COLOR_A}
                      strokeDasharray="6 3"
                      strokeOpacity={0.5}
                      label={{
                        value: `thr A ${detA.threshold}%`,
                        fill: COLOR_A,
                        fontSize: 9,
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    />
                    <ReferenceLine
                      y={detB.threshold}
                      stroke={COLOR_B}
                      strokeDasharray="6 3"
                      strokeOpacity={0.5}
                      label={{
                        value: `thr B ${detB.threshold}%`,
                        fill: COLOR_B,
                        fontSize: 9,
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    />
                  </>
                )}
                <Line
                  type="monotone"
                  dataKey="vA"
                  stroke={COLOR_A}
                  strokeWidth={1.5}
                  dot={false}
                  name={`A #${detA.id}`}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="vB"
                  stroke={COLOR_B}
                  strokeWidth={1.5}
                  dot={false}
                  name={`B #${detB.id}`}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Comparison table */}
          <div
            style={{
              background: "var(--bg-2)",
              border: "1px solid var(--br-1)",
              borderRadius: "var(--r-md)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 24px",
                borderBottom: "1px solid var(--br-1)",
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  color: "var(--tx-2)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Metrika
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  color: COLOR_A,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                A · #{detA.id} {detA.mod}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  color: COLOR_B,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                B · #{detB.id} {detB.mod}
              </div>
            </div>
            {METRICS.map(({ key, label, fmt }) => {
              const vA = detA[key];
              const vB = detB[key];
              const win = better(
                key,
                typeof vA === "number" ? vA : null,
                typeof vB === "number" ? vB : null,
              );
              return (
                <div
                  key={key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    padding: "12px 24px",
                    borderBottom: "1px solid var(--br-1)",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--tx-2)",
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 13,
                        color: win === "a" ? "var(--green)" : "var(--tx-0)",
                        fontWeight: win === "a" ? 700 : 400,
                      }}
                    >
                      {fmt(detA)}
                    </span>
                    {win === "a" && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          color: "var(--green)",
                          background: "rgba(104,194,94,.12)",
                          padding: "1px 5px",
                          borderRadius: 3,
                        }}
                      >
                        WIN
                      </span>
                    )}
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 13,
                        color: win === "b" ? "var(--green)" : "var(--tx-0)",
                        fontWeight: win === "b" ? 700 : 400,
                      }}
                    >
                      {fmt(detB)}
                    </span>
                    {win === "b" && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          color: "var(--green)",
                          background: "rgba(104,194,94,.12)",
                          padding: "1px 5px",
                          borderRadius: 3,
                        }}
                      >
                        WIN
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
