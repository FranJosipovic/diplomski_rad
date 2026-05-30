import { useState, useEffect } from "react";
import {
  getSesije,
  getSesija,
  getOcitavanja,
  getEventi,
  getBaterija,
  deleteSesija,
} from "../api.js";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Customized,
  ResponsiveContainer,
} from "recharts";

const MOD_CFG = {
  pull: { color: "var(--teal)", hex: "#45bfb8" },
  push: { color: "var(--violet)", hex: "#9887cc" },
  timer: { color: "var(--amber)", hex: "#e09a18" },
};

const AXIS_STYLE = {
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 10,
  fill: "#4a6040",
};

function sec2hr(s) {
  const v = Math.round(s ?? 0);
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function pumpBands(eventi) {
  const bands = [];
  let onTs = null;
  for (const e of eventi ?? []) {
    if (e.status && onTs === null) onTs = new Date(e.timestamp).getTime();
    else if (!e.status && onTs !== null) {
      bands.push([onTs, new Date(e.timestamp).getTime()]);
      onTs = null;
    }
  }
  if (onTs !== null) bands.push([onTs, Date.now()]);
  return bands;
}

// Crta pump bandove direktno kao SVG rect — zaobilazi Recharts ReferenceArea clipPath bug
function PumpBandsOverlay({ bands, xAxisMap, offset }) {
  const xAxis = xAxisMap && Object.values(xAxisMap)[0];
  if (!xAxis?.scale || !offset || !bands?.length) return null;
  const { top, height } = offset;
  return (
    <>
      {bands.map(([x1, x2], i) => {
        const left = xAxis.scale(x1);
        const right = xAxis.scale(x2);
        if (isNaN(left) || isNaN(right) || right <= left) return null;
        return (
          <rect
            key={i}
            x={left}
            y={top}
            width={Math.max(1, right - left)}
            height={height}
            fill="rgba(104,194,94,0.13)"
            stroke="rgba(104,194,94,0.35)"
            strokeWidth={1}
          />
        );
      })}
    </>
  );
}

function ModBadge({ mod }) {
  const cfg = MOD_CFG[mod] ?? { color: "var(--teal)", hex: "#45bfb8" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 600,
        background: `${cfg.hex}20`,
        color: cfg.color,
        border: `1px solid ${cfg.hex}40`,
      }}
    >
      {mod}
    </span>
  );
}

function ChartLabel({ children, legend }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          color: "var(--tx-2)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {children}
      </div>
      {legend && (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {legend.map(({ swatch, label }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--tx-2)",
              }}
            >
              {swatch}
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const mkTooltip =
  (dataKey, color, unit, extraKey) =>
  ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload.find((x) => x.dataKey === dataKey);
    const pumpaOn = payload[0]?.payload?.pumpaOn;
    return (
      <div
        style={{
          background: "var(--bg-3)",
          border: "1px solid var(--br-2)",
          borderRadius: 6,
          padding: "8px 14px",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
          color: "var(--tx-0)",
        }}
      >
        <div style={{ color: "var(--tx-2)", marginBottom: 5 }}>
          {new Date(label).toLocaleTimeString("hr", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </div>
        {p && (
          <div style={{ color }}>
            {dataKey}: {Number(p.value).toFixed(1)}
            {unit}
          </div>
        )}
        {extraKey === "pumpa" && (
          <div
            style={{
              color: pumpaOn ? "var(--green)" : "var(--tx-2)",
              marginTop: 3,
            }}
          >
            pumpa: {pumpaOn ? "ON" : "OFF"}
          </div>
        )}
      </div>
    );
  };

const BatTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const vinP = payload.find((p) => p.dataKey === "vin");
  const pctP = payload.find((p) => p.dataKey === "postotak");
  return (
    <div
      style={{
        background: "var(--bg-3)",
        border: "1px solid var(--br-2)",
        borderRadius: 6,
        padding: "8px 14px",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 11,
        color: "var(--tx-0)",
      }}
    >
      <div style={{ color: "var(--tx-2)", marginBottom: 5 }}>
        {new Date(label).toLocaleTimeString("hr", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </div>
      {vinP && (
        <div style={{ color: "var(--amber)" }}>
          Vin: {Number(vinP.value).toFixed(2)} V
        </div>
      )}
      {pctP && (
        <div style={{ color: "var(--teal)", marginTop: 3 }}>
          postotak: {pctP.value}%
        </div>
      )}
    </div>
  );
};

export default function PovijestSesija() {
  const [sesije, setSesije] = useState([]);
  const [sel, setSel] = useState(null);
  const [details, setDetails] = useState(null);
  const [oc, setOc] = useState([]);
  const [ev, setEv] = useState([]);
  const [bat, setBat] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    getSesije().then(setSesije);
  }, []);

  const handleDelete = async (s, e) => {
    e.stopPropagation();
    if (
      !window.confirm(
        `Obriši sesiju #${s.id} i sve njene podatke? Ovo se ne može poništiti.`,
      )
    )
      return;
    setDeleting(s.id);
    try {
      await deleteSesija(s.id);
      setSesije((prev) => prev.filter((x) => x.id !== s.id));
      if (sel?.id === s.id) {
        setSel(null);
        setDetails(null);
        setOc([]);
        setEv([]);
        setBat([]);
      }
    } catch {
      alert("Greška pri brisanju.");
    } finally {
      setDeleting(null);
    }
  };

  const handleSelect = async (s) => {
    if (sel?.id === s.id) {
      setSel(null);
      setDetails(null);
      setOc([]);
      setEv([]);
      setBat([]);
      return;
    }
    setSel(s);
    setLoading(true);
    try {
      const [det, ocList, evList, batList] = await Promise.all([
        getSesija(s.id),
        getOcitavanja(s.id),
        getEventi(s.id),
        getBaterija(s.id),
      ]);
      setDetails(det);
      setEv(evList ?? []);
      setOc(
        (ocList ?? []).map((o) => ({
          t: new Date(o.timestamp).getTime(),
          vlaga: parseFloat(o.vlaga),
          temperatura: parseFloat(o.temperatura),
        })),
      );
      setBat(
        (batList ?? []).map((b) => ({
          t: new Date(b.timestamp).getTime(),
          vin: parseFloat(b.vin),
          postotak: b.postotak,
        })),
      );
    } finally {
      setLoading(false);
    }
  };

  const bands = pumpBands(ev);
  const augOc = oc.map((r) => ({
    ...r,
    pumpaOn: bands.some(([s, e]) => r.t >= s && r.t <= e),
  }));

  const VlagaTooltip = mkTooltip("vlaga", "#45bfb8", "%", "pumpa");
  const TempTooltip = mkTooltip("temperatura", "#e09a18", "°C");

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
          Povijest sesija
        </h1>
        <p
          style={{
            color: "var(--tx-2)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            marginTop: 5,
          }}
        >
          {sesije.length} sesija ukupno
        </p>
      </div>

      {/* Table */}
      <div
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--br-1)",
          borderRadius: "var(--r-md)",
          marginBottom: 24,
          overflow: "hidden",
        }}
      >
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Mod</th>
              <th>Threshold</th>
              <th>Početak</th>
              <th>Kraj</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sesije.map((s) => (
              <tr
                key={s.id}
                onClick={() => handleSelect(s)}
                style={{
                  cursor: "pointer",
                  background: sel?.id === s.id ? "var(--bg-4)" : undefined,
                }}
              >
                <td>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      color: "var(--tx-1)",
                    }}
                  >
                    {String(s.id).padStart(3, "0")}
                  </span>
                </td>
                <td>
                  <ModBadge mod={s.mod} />
                </td>
                <td>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--amber)",
                    }}
                  >
                    {s.threshold}%
                  </span>
                </td>
                <td
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--tx-1)",
                  }}
                >
                  {new Date(s.pocetak).toLocaleString("hr")}
                </td>
                <td
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--tx-2)",
                  }}
                >
                  {s.kraj ? new Date(s.kraj).toLocaleString("hr") : "—"}
                </td>
                <td>
                  {s.aktivna ? (
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <span
                        className="pulse"
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "var(--green)",
                          display: "inline-block",
                        }}
                      />
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          color: "var(--green)",
                        }}
                      >
                        LIVE
                      </span>
                    </span>
                  ) : (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--tx-2)",
                      }}
                    >
                      završena
                    </span>
                  )}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  {!s.aktivna && (
                    <button
                      onClick={(e) => handleDelete(s, e)}
                      disabled={deleting === s.id}
                      style={{
                        background: "none",
                        border: "1px solid rgba(220,80,80,.3)",
                        borderRadius: "var(--r-xs)",
                        color: "var(--red)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        padding: "3px 8px",
                        cursor: "pointer",
                        opacity: deleting === s.id ? 0.5 : 1,
                      }}
                    >
                      {deleting === s.id ? "…" : "obriši"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {sesije.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    textAlign: "center",
                    padding: "36px 0",
                    color: "var(--tx-2)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                  }}
                >
                  Nema snimljenih sesija.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--tx-2)",
          }}
        >
          Učitavanje…
        </div>
      )}

      {!loading && details && (
        <div
          className="fade-up"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--br-1)",
            borderRadius: "var(--r-md)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "18px 24px",
              borderBottom: "1px solid var(--br-1)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  color: "var(--tx-0)",
                  fontSize: 18,
                }}
              >
                #{details.id}
              </span>
              <ModBadge mod={details.mod} />
              {details.napomena && (
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 12,
                    color: "var(--tx-2)",
                    fontStyle: "italic",
                  }}
                >
                  {details.napomena}
                </span>
              )}
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--tx-2)",
              }}
            >
              {new Date(details.pocetak).toLocaleString("hr")}
              {details.kraj
                ? ` → ${new Date(details.kraj).toLocaleString("hr")}`
                : " → LIVE"}
            </span>
          </div>

          {/* Stats grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              padding: "20px 24px",
              gap: 14,
              borderBottom: "1px solid var(--br-1)",
            }}
          >
            {[
              { label: "Trajanje", val: sec2hr(details.trajanjeSek) },
              { label: "Prosj. vlaga", val: `${details.prosjecnaVlaga}%` },
              {
                label: "Min vlaga",
                val: `${details.minVlaga}%`,
                color: "var(--red)",
              },
              {
                label: "Max vlaga",
                val: `${details.maxVlaga}%`,
                color: "var(--green)",
              },
              {
                label: "Ispod thresholda",
                val: `${details.postoIspodThresholda}%`,
                color:
                  details.postoIspodThresholda > 15
                    ? "var(--red)"
                    : "var(--green)",
              },
              { label: "Pumpa paljena", val: `${details.brPaljenja}×` },
              {
                label: "Pumpa upaljena",
                val: sec2hr(details.sekundeUpaljeno),
                color: "var(--teal)",
              },
            ].map(({ label, val, color }) => (
              <div
                key={label}
                style={{
                  background: "var(--bg-3)",
                  borderRadius: "var(--r-sm)",
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9.5,
                    color: "var(--tx-2)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 6,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    fontSize: 16,
                    color: color ?? "var(--tx-0)",
                  }}
                >
                  {val}
                </div>
              </div>
            ))}
          </div>

          {augOc.length > 0 ? (
            <div style={{ padding: "24px 24px 8px" }}>
              {/* ── Vlaga ── */}
              <ChartLabel
                legend={[
                  {
                    swatch: (
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          background: "rgba(104,194,94,0.35)",
                        }}
                      />
                    ),
                    label: "pumpa ON",
                  },
                  {
                    swatch: (
                      <div
                        style={{
                          width: 16,
                          height: 2,
                          background: "#dc5050",
                          opacity: 0.7,
                        }}
                      />
                    ),
                    label: "threshold",
                  },
                ]}
              >
                Vlaga tla
              </ChartLabel>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart
                  data={augOc}
                  margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="grVlaga" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="#45bfb8"
                        stopOpacity={0.25}
                      />
                      <stop offset="95%" stopColor="#45bfb8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c2818" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(t) =>
                      new Date(t).toLocaleTimeString("hr", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    }
                    tick={AXIS_STYLE}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={AXIS_STYLE}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                    width={36}
                  />
                  <Tooltip content={<VlagaTooltip />} />
                  <Customized
                    component={(props) => (
                      <PumpBandsOverlay bands={bands} {...props} />
                    )}
                  />
                  <ReferenceLine
                    y={details.threshold}
                    stroke="#dc5050"
                    strokeDasharray="6 3"
                    strokeOpacity={0.7}
                    label={{
                      value: `${details.threshold}%`,
                      fill: "#dc5050",
                      fontSize: 10,
                      fontFamily: "JetBrains Mono, monospace",
                      position: "insideTopRight",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="vlaga"
                    stroke="#45bfb8"
                    strokeWidth={1.5}
                    fill="url(#grVlaga)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>

              {/* ── Temperatura ── */}
              <div style={{ marginTop: 28 }}>
                <ChartLabel>Temperatura zraka</ChartLabel>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart
                    data={augOc}
                    margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="grTemp" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="#e09a18"
                          stopOpacity={0.22}
                        />
                        <stop
                          offset="95%"
                          stopColor="#e09a18"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c2818" />
                    <XAxis
                      dataKey="t"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(t) =>
                        new Date(t).toLocaleTimeString("hr", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      }
                      tick={AXIS_STYLE}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={AXIS_STYLE}
                      axisLine={false}
                      tickLine={false}
                      unit="°C"
                      width={42}
                    />
                    <Tooltip content={<TempTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="temperatura"
                      stroke="#e09a18"
                      strokeWidth={1.5}
                      fill="url(#grTemp)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* ── Baterija ── */}
              {bat.length > 0 && (
                <div style={{ marginTop: 28, marginBottom: 8 }}>
                  <ChartLabel>Baterija pumpe</ChartLabel>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart
                      data={bat}
                      margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="grBatPct"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#45bfb8"
                            stopOpacity={0.2}
                          />
                          <stop
                            offset="95%"
                            stopColor="#45bfb8"
                            stopOpacity={0}
                          />
                        </linearGradient>
                        <linearGradient
                          id="grBatVin"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#e09a18"
                            stopOpacity={0.2}
                          />
                          <stop
                            offset="95%"
                            stopColor="#e09a18"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c2818" />
                      <XAxis
                        dataKey="t"
                        type="number"
                        scale="time"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(t) =>
                          new Date(t).toLocaleTimeString("hr", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        }
                        tick={AXIS_STYLE}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="pct"
                        domain={[0, 100]}
                        tick={AXIS_STYLE}
                        axisLine={false}
                        tickLine={false}
                        unit="%"
                        width={36}
                      />
                      <YAxis
                        yAxisId="vin"
                        orientation="right"
                        domain={[2.8, 4.3]}
                        tick={AXIS_STYLE}
                        axisLine={false}
                        tickLine={false}
                        unit="V"
                        width={40}
                      />
                      <Tooltip content={<BatTooltip />} />
                      <Area
                        yAxisId="pct"
                        type="monotone"
                        dataKey="postotak"
                        stroke="#45bfb8"
                        strokeWidth={1.5}
                        fill="url(#grBatPct)"
                        dot={false}
                      />
                      <Area
                        yAxisId="vin"
                        type="monotone"
                        dataKey="vin"
                        stroke="#e09a18"
                        strokeWidth={1.5}
                        fill="url(#grBatVin)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
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
                        style={{ width: 14, height: 2, background: "#45bfb8" }}
                      />{" "}
                      postotak (%)
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
                        style={{ width: 14, height: 2, background: "#e09a18" }}
                      />{" "}
                      napon Vin (V)
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                padding: "32px 24px",
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--tx-2)",
              }}
            >
              Nema očitavanja za ovu sesiju.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
