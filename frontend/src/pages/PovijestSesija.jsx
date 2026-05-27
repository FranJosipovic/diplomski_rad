import { useState, useEffect } from 'react';
import { getSesije, getSesija, getOcitavanja, getEventi } from '../api.js';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts';

const MOD_CFG = {
  pull:  { color: 'var(--teal)',   hex: '#45bfb8' },
  push:  { color: 'var(--violet)', hex: '#9887cc' },
  timer: { color: 'var(--amber)',  hex: '#e09a18' },
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
  for (const e of (eventi ?? [])) {
    if (e.status && onTs === null) onTs = new Date(e.timestamp).getTime();
    else if (!e.status && onTs !== null) { bands.push([onTs, new Date(e.timestamp).getTime()]); onTs = null; }
  }
  if (onTs !== null) bands.push([onTs, Date.now()]);
  return bands;
}

function ModBadge({ mod }) {
  const cfg = MOD_CFG[mod] ?? { color: 'var(--teal)', hex: '#45bfb8' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
      background: `${cfg.hex}20`, color: cfg.color, border: `1px solid ${cfg.hex}40`,
    }}>{mod}</span>
  );
}

const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const vlP = payload.find(p => p.dataKey === 'vlaga');
  const pumpaOn = payload[0]?.payload?.pumpaOn;
  return (
    <div style={{
      background: 'var(--bg-3)', border: '1px solid var(--br-2)', borderRadius: 6,
      padding: '8px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--tx-0)',
    }}>
      <div style={{ color: 'var(--tx-2)', marginBottom: 5 }}>
        {new Date(label).toLocaleTimeString('hr', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      {vlP && <div style={{ color: vlP.color }}>vlaga: {Number(vlP.value).toFixed(1)}%</div>}
      <div style={{ color: pumpaOn ? 'var(--green)' : 'var(--tx-2)', marginTop: 3 }}>
        pumpa: {pumpaOn ? 'ON' : 'OFF'}
      </div>
    </div>
  );
};

const AXIS_STYLE = { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: '#4a6040' };

export default function PovijestSesija() {
  const [sesije, setSesije]   = useState([]);
  const [sel, setSel]         = useState(null);
  const [details, setDetails] = useState(null);
  const [oc, setOc]           = useState([]);
  const [ev, setEv]           = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { getSesije().then(setSesije); }, []);

  const handleSelect = async (s) => {
    if (sel?.id === s.id) { setSel(null); setDetails(null); setOc([]); setEv([]); return; }
    setSel(s);
    setLoading(true);
    try {
      const [det, ocList, evList] = await Promise.all([getSesija(s.id), getOcitavanja(s.id), getEventi(s.id)]);
      setDetails(det);
      setEv(evList ?? []);
      setOc((ocList ?? []).map(o => ({
        t: new Date(o.timestamp).getTime(),
        vlaga: typeof o.vlaga === 'number' ? o.vlaga : parseFloat(o.vlaga),
      })));
    } finally { setLoading(false); }
  };

  const bands = pumpBands(ev);
  const augOc = oc.map(r => ({ ...r, pumpaOn: bands.some(([s, e]) => r.t >= s && r.t <= e) }));

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>
          Povijest sesija
        </h1>
        <p style={{ color: 'var(--tx-2)', fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 5 }}>
          {sesije.length} sesija ukupno
        </p>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--br-1)', borderRadius: 'var(--r-md)', marginBottom: 24, overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th><th>Mod</th><th>Threshold</th><th>Početak</th><th>Kraj</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sesije.map(s => (
              <tr key={s.id} onClick={() => handleSelect(s)}
                style={{ cursor: 'pointer', background: sel?.id === s.id ? 'var(--bg-4)' : undefined }}>
                <td><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--tx-1)' }}>{String(s.id).padStart(3, '0')}</span></td>
                <td><ModBadge mod={s.mod} /></td>
                <td><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>{s.threshold}%</span></td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-1)' }}>{new Date(s.pocetak).toLocaleString('hr')}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-2)' }}>{s.kraj ? new Date(s.kraj).toLocaleString('hr') : '—'}</td>
                <td>
                  {s.aktivna
                    ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)' }}>LIVE</span>
                      </span>
                    : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-2)' }}>završena</span>}
                </td>
              </tr>
            ))}
            {sesije.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--tx-2)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                Nema snimljenih sesija.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-2)' }}>Učitavanje…</div>
      )}

      {!loading && details && (
        <div className="fade-up" style={{ background: 'var(--bg-2)', border: '1px solid var(--br-1)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--br-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--tx-0)', fontSize: 18 }}>#{details.id}</span>
              <ModBadge mod={details.mod} />
              {details.napomena && <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-2)', fontStyle: 'italic' }}>{details.napomena}</span>}
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-2)' }}>
              {new Date(details.pocetak).toLocaleString('hr')}{details.kraj ? ` → ${new Date(details.kraj).toLocaleString('hr')}` : ' → LIVE'}
            </span>
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', padding: '20px 24px', gap: 14, borderBottom: '1px solid var(--br-1)' }}>
            {[
              { label: 'Trajanje',         val: sec2hr(details.trajanjeSek) },
              { label: 'Prosj. vlaga',     val: `${details.prosjecnaVlaga}%` },
              { label: 'Min vlaga',        val: `${details.minVlaga}%`, color: 'var(--red)' },
              { label: 'Max vlaga',        val: `${details.maxVlaga}%`, color: 'var(--green)' },
              { label: 'Ispod thresholda', val: `${details.postoIspodThresholda}%`, color: details.postoIspodThresholda > 15 ? 'var(--red)' : 'var(--green)' },
              { label: 'Pumpa paljena',    val: `${details.brPaljenja}×` },
              { label: 'Pumpa upaljena',   val: sec2hr(details.sekundeUpaljeno), color: 'var(--teal)' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: 'var(--bg-3)', borderRadius: 'var(--r-sm)', padding: '12px 14px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--tx-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: color ?? 'var(--tx-0)' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          {augOc.length > 0 ? (
            <div style={{ padding: '24px 24px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--tx-2)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Vlaga kroz sesiju
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-2)' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(104,194,94,0.35)' }} />
                    pumpa ON
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-2)' }}>
                    <div style={{ width: 16, height: 2, background: '#dc5050', opacity: 0.7 }} />
                    threshold
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={augOc} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="grVlaga" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#45bfb8" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#45bfb8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c2818" />
                  <XAxis
                    dataKey="t" type="number" scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={t => new Date(t).toLocaleTimeString('hr', { hour: '2-digit', minute: '2-digit' })}
                    tick={AXIS_STYLE} axisLine={false} tickLine={false}
                  />
                  <YAxis domain={[0, 100]} tick={AXIS_STYLE} axisLine={false} tickLine={false} unit="%" width={36} />
                  <Tooltip content={<DarkTooltip />} />

                  {/* Pump ON shading */}
                  {bands.map(([x1, x2], i) => (
                    <ReferenceArea key={i} x1={x1} x2={x2}
                      fill="rgba(104,194,94,0.13)" stroke="rgba(104,194,94,0.35)" strokeWidth={1} />
                  ))}

                  <ReferenceLine
                    y={details.threshold} stroke="#dc5050" strokeDasharray="6 3" strokeOpacity={0.7}
                    label={{ value: `${details.threshold}%`, fill: '#dc5050', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', position: 'insideTopRight' }}
                  />
                  <Area type="monotone" dataKey="vlaga" stroke="#45bfb8" strokeWidth={1.5}
                    fill="url(#grVlaga)" dot={false} name="Vlaga" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ padding: '32px 24px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-2)' }}>
              Nema očitavanja za ovu sesiju.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
