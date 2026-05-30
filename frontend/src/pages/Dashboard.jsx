import { useState, useEffect, useCallback } from "react";
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
import {
  getLatest,
  setThreshold,
  pumpaOn,
  pumpaOff,
  getAktivnaSesija,
  getOcitavanja,
  getEventi,
  getBaterija,
} from "../api.js";

const mono = (n, dec = 1) => (n != null ? Number(n).toFixed(dec) : "—");
const MOD_COLOR = {
  pull: "var(--teal)",
  push: "var(--violet)",
  timer: "var(--amber)",
};
const AXIS_STYLE = {
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 10,
  fill: "#4a6040",
};

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

function MetricCard({ label, value, unit, accentColor, status, children }) {
  return (
    <div
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--br-1)",
        borderTop: `2px solid ${accentColor}`,
        borderRadius: "var(--r-md)",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--tx-2)",
        }}
      >
        {label}
      </span>
      {value !== undefined && (
        <div style={{ lineHeight: 1 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 44,
              fontWeight: 700,
              color: accentColor,
              letterSpacing: "-0.03em",
            }}
          >
            {value}
          </span>
          {unit && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 16,
                color: "var(--tx-1)",
                marginLeft: 5,
              }}
            >
              {unit}
            </span>
          )}
        </div>
      )}
      {status && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--tx-2)",
          }}
        >
          {status}
        </div>
      )}
      {children}
    </div>
  );
}

function Tag({ color, children }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: "var(--r-xs)",
        background: `${color}18`,
        border: `1px solid ${color}40`,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color,
        letterSpacing: "0.05em",
      }}
    >
      {children}
    </span>
  );
}

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

const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const vlP = payload.find((p) => p.dataKey === "vlaga");
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
        {new Date(label).toLocaleTimeString("hr")}
      </div>
      {vlP && (
        <div style={{ color: vlP.color }}>
          vlaga: {Number(vlP.value).toFixed(1)}%
        </div>
      )}
      <div
        style={{
          color: pumpaOn ? "var(--green)" : "var(--tx-2)",
          marginTop: 3,
        }}
      >
        pumpa: {pumpaOn ? "ON" : "OFF"}
      </div>
    </div>
  );
};

const TempTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const p = payload.find((x) => x.dataKey === "temperatura");
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
        {new Date(label).toLocaleTimeString("hr")}
      </div>
      {p && (
        <div style={{ color: "#e09a18" }}>
          temp: {Number(p.value).toFixed(1)}°C
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
        {new Date(label).toLocaleTimeString("hr")}
      </div>
      {vinP && (
        <div style={{ color: "#e09a18" }}>
          Vin: {Number(vinP.value).toFixed(2)} V
        </div>
      )}
      {pctP && (
        <div style={{ color: "#45bfb8", marginTop: 3 }}>
          postotak: {pctP.value}%
        </div>
      )}
    </div>
  );
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [sesija, setSesija] = useState(null);
  const [ocData, setOcData] = useState([]);
  const [eventi, setEventi] = useState([]);
  const [batData, setBatData] = useState([]);
  const [thrInput, setThrInput] = useState("");
  const [toast, setToast] = useState(null);

  const notify = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const fetchAll = useCallback(async () => {
    try {
      const [latest, aktivna] = await Promise.all([
        getLatest(),
        getAktivnaSesija(),
      ]);
      setData(latest);
      setSesija(aktivna);
      if (thrInput === "") setThrInput(String(latest?.threshold ?? 50));

      if (aktivna?.id) {
        const [ocList, evList, batList] = await Promise.all([
          getOcitavanja(aktivna.id),
          getEventi(aktivna.id),
          getBaterija(aktivna.id),
        ]);
        setEventi(evList ?? []);
        setOcData(
          (ocList ?? []).map((o) => ({
            t: new Date(o.timestamp).getTime(),
            vlaga: parseFloat(o.vlaga),
            temperatura: parseFloat(o.temperatura),
          })),
        );
        setBatData(
          (batList ?? []).map((b) => ({
            t: new Date(b.timestamp).getTime(),
            vin: parseFloat(b.vin),
            postotak: b.postotak,
          })),
        );
      } else {
        setOcData([]);
        setEventi([]);
        setBatData([]);
      }
    } catch {
      /* broker offline */
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 10_000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const handleSaveThr = async () => {
    try {
      await setThreshold(parseFloat(thrInput));
      notify("Threshold ažuriran.");
    } catch {
      notify("Greška.", false);
    }
  };

  const handlePumpa = async (on) => {
    try {
      on ? await pumpaOn() : await pumpaOff();
      notify(`Komanda ${on ? "ON" : "OFF"} poslana.`);
      setTimeout(fetchAll, 800);
    } catch {
      notify("Greška.", false);
    }
  };

  const vlaga = data?.vlaga;
  const temp = data?.temperatura;
  const thr = data?.threshold ?? 50;
  const pumpa = data?.pumpaStatus;
  const ts = data?.timestamp
    ? new Date(data.timestamp).toLocaleTimeString("hr")
    : null;

  const vlahaColor =
    vlaga == null
      ? "var(--tx-1)"
      : vlaga < thr
        ? "var(--red)"
        : vlaga < thr + 10
          ? "var(--amber)"
          : "var(--green)";

  const bands = pumpBands(eventi);

  const augOcData = ocData.map((r) => ({
    ...r,
    pumpaOn: bands.some(([s, e]) => r.t >= s && r.t <= e),
  }));

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "-0.03em",
            }}
          >
            Dashboard
          </h1>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 5,
            }}
          >
            <div
              className="pulse"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--green)",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--tx-2)",
              }}
            >
              LIVE · polling 10s{ts ? ` · zadnje ${ts}` : ""}
            </span>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={fetchAll}>
          ↻ Osvježi
        </button>
      </div>

      {/* Session banner */}
      <div
        style={{
          marginBottom: 24,
          padding: "12px 18px",
          borderRadius: "var(--r-sm)",
          background: sesija ? "rgba(104,194,94,.07)" : "rgba(220,80,80,.07)",
          border: `1px solid ${sesija ? "rgba(104,194,94,.25)" : "rgba(220,80,80,.25)"}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: sesija ? "var(--green)" : "var(--red)",
            flexShrink: 0,
          }}
        />
        {sesija ? (
          <span style={{ fontSize: 13, color: "var(--tx-0)" }}>
            Aktivna sesija{" "}
            <span
              style={{ fontFamily: "var(--font-mono)", color: "var(--green)" }}
            >
              #{sesija.id}
            </span>{" "}
            ·{" "}
            <Tag color={MOD_COLOR[sesija.mod] ?? "var(--teal)"}>
              {sesija.mod}
            </Tag>{" "}
            · threshold{" "}
            <span
              style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}
            >
              {sesija.threshold}%
            </span>
          </span>
        ) : (
          <span style={{ fontSize: 13, color: "var(--tx-1)" }}>
            Nema aktivne sesije — podaci se ne snimaju u bazu
          </span>
        )}
      </div>

      {/* Metric grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <MetricCard
          label="Vlaga tla"
          value={mono(vlaga)}
          unit="%"
          accentColor={vlahaColor}
          status={
            vlaga == null ? null : vlaga < thr ? (
              <>
                <span style={{ color: "var(--red)" }}>⚠</span> Ispod thresholda
              </>
            ) : (
              <>
                <span style={{ color: "var(--green)" }}>✓</span> Iznad
                thresholda
              </>
            )
          }
        />
        <MetricCard
          label="Temperatura"
          value={mono(temp)}
          unit="°C"
          accentColor="var(--amber)"
          status={
            temp == null ? null : (
              <span style={{ color: "var(--tx-2)" }}>SHTC3</span>
            )
          }
        />
        <MetricCard
          label="Threshold vlage"
          value={mono(thr)}
          unit="%"
          accentColor="var(--teal)"
          status={
            <span style={{ color: "var(--tx-2)" }}>min. dopuštena vlaga</span>
          }
        />

        {/* Pump card */}
        <div
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--br-1)",
            borderTop: `2px solid ${pumpa ? "var(--green)" : "var(--tx-2)"}`,
            borderRadius: "var(--r-md)",
            padding: "20px 24px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--tx-2)",
            }}
          >
            Pumpa
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              margin: "12px 0",
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                flexShrink: 0,
                background: pumpa ? "var(--green)" : "var(--bg-4)",
                border: `2px solid ${pumpa ? "var(--green)" : "var(--br-3)"}`,
                boxShadow: pumpa ? "0 0 10px rgba(104,194,94,.5)" : "none",
                transition: "all .3s",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 28,
                fontWeight: 700,
                color: pumpa ? "var(--green)" : "var(--tx-2)",
                letterSpacing: "-0.02em",
              }}
            >
              {pumpa ? "ON" : "OFF"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-green"
              style={{ flex: 1, padding: "7px 0", fontSize: 12 }}
              onClick={() => handlePumpa(true)}
            >
              ▲ ON
            </button>
            <button
              className="btn btn-ghost"
              style={{
                flex: 1,
                padding: "7px 0",
                fontSize: 12,
                color: "var(--red)",
                borderColor: "rgba(220,80,80,.3)",
              }}
              onClick={() => handlePumpa(false)}
            >
              ▼ OFF
            </button>
          </div>
        </div>
      </div>

      {/* Live chart — only when session is active */}
      {sesija && augOcData.length > 0 && (
        <div
          className="fade-up"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--br-1)",
            borderRadius: "var(--r-md)",
            padding: "20px 24px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
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
              Vlaga tla · sesija #{sesija.id} · live
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
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
                    background: "rgba(104,194,94,0.35)",
                  }}
                />
                pumpa ON
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
                    width: 16,
                    height: 2,
                    background: "#dc5050",
                    opacity: 0.7,
                  }}
                />
                threshold
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={augOcData}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="grLive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#45bfb8" stopOpacity={0.22} />
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
              <Tooltip content={<DarkTooltip />} />

              <Customized
                component={(props) => (
                  <PumpBandsOverlay bands={bands} {...props} />
                )}
              />

              <ReferenceLine
                y={sesija.threshold}
                stroke="#dc5050"
                strokeDasharray="6 3"
                strokeOpacity={0.7}
                label={{
                  value: `${sesija.threshold}%`,
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
                fill="url(#grLive)"
                dot={false}
                name="Vlaga"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Temperatura chart */}
      {sesija && augOcData.length > 0 && (
        <div
          className="fade-up"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--br-1)",
            borderRadius: "var(--r-md)",
            padding: "20px 24px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              color: "var(--tx-2)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Temperatura zraka · sesija #{sesija.id} · live
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart
              data={augOcData}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="grTempLive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e09a18" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#e09a18" stopOpacity={0} />
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
                fill="url(#grTempLive)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Baterija chart */}
      {sesija && batData.length > 0 && (
        <div
          className="fade-up"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--br-1)",
            borderRadius: "var(--r-md)",
            padding: "20px 24px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
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
              Baterija pumpe · sesija #{sesija.id} · live
            </div>
            <div style={{ display: "flex", gap: 14 }}>
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
                <div style={{ width: 14, height: 2, background: "#45bfb8" }} />{" "}
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
                <div style={{ width: 14, height: 2, background: "#e09a18" }} />{" "}
                napon Vin (V)
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart
              data={batData}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="grBatPctLive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#45bfb8" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#45bfb8" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="grBatVinLive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e09a18" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#e09a18" stopOpacity={0} />
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
                fill="url(#grBatPctLive)"
                dot={false}
              />
              <Area
                yAxisId="vin"
                type="monotone"
                dataKey="vin"
                stroke="#e09a18"
                strokeWidth={1.5}
                fill="url(#grBatVinLive)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Threshold editor */}
      <div
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--br-1)",
          borderRadius: "var(--r-md)",
          padding: "20px 24px",
          maxWidth: 400,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--tx-2)",
            marginBottom: 12,
          }}
        >
          Postavi threshold
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={thrInput}
              onChange={(e) => setThrInput(e.target.value)}
            />
            <span
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--tx-2)",
                pointerEvents: "none",
              }}
            >
              %
            </span>
          </div>
          <button className="btn btn-teal" onClick={handleSaveThr}>
            Spremi
          </button>
        </div>
        {toast && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              borderRadius: "var(--r-xs)",
              background: toast.ok
                ? "rgba(104,194,94,.1)"
                : "rgba(220,80,80,.1)",
              border: `1px solid ${toast.ok ? "rgba(104,194,94,.3)" : "rgba(220,80,80,.3)"}`,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: toast.ok ? "var(--green)" : "var(--red)",
            }}
          >
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}
