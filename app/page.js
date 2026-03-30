'use client';
import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';

// ── GOOGLE SHEETS CSV EXPORT ──────────────────────────────────────────────────
const SHEET_ID = '1uFaWzUV8J8HxCDk6rSiUlqAmhiyt9JT3b1yeonWQNK0';
const SHEET_GID = '1566885801';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

// ── COLORS ────────────────────────────────────────────────────────────────────
const REGION_COLORS = {
  'ภาคเหนือ':      '#EF4444',
  'ใต้':           '#3B82F6',
  'ภาคอีสาน':     '#F97316',
  'กทม.ตะวันออก': '#22C55E',
  'กลางตะวันตก':  '#EAB308',
};
const TYPE_COLORS = { ทดลอง: '#94A3B8', รูปธรรม: '#EF4444' };
const REGIONS = ['ภาคเหนือ', 'ใต้', 'ภาคอีสาน', 'กทม.ตะวันออก', 'กลางตะวันตก'];

// ── CSV PARSER ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    vals.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
}

// ── SVG PIE CHART ─────────────────────────────────────────────────────────────
function PieChart({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return null;
  let angle = -90;
  const slices = data.map(d => {
    const pct = d.value / total;
    const start = angle;
    angle += pct * 360;
    return { ...d, pct, start, end: angle };
  });
  const arc = (cx, cy, r, startDeg, endDeg) => {
    const s = (startDeg * Math.PI) / 180;
    const e = (endDeg * Math.PI) / 180;
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  };
  return (
    <div className="flex flex-col md:flex-row items-center gap-4">
      <svg viewBox="0 0 200 200" width="180" height="180" className="shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={arc(100, 100, 90, s.start, s.end)} fill={REGION_COLORS[s.label] ?? '#94A3B8'} stroke="#fff" strokeWidth="2" />
        ))}
      </svg>
      <div className="flex flex-col gap-1.5 text-sm">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: REGION_COLORS[s.label] ?? '#94A3B8' }} />
            <span className="text-gray-700 font-medium">{s.label}</span>
            <span className="ml-auto font-bold text-gray-900 pl-3">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SVG BAR CHART ─────────────────────────────────────────────────────────────
function BarChart({ data }) {
  const maxVal = Math.max(...data.flatMap(d => [d.ทดลอง ?? 0, d.รูปธรรม ?? 0])) || 1;
  const barH = 220, barW = 48, gap = 20, groupGap = 40;
  const total = data.length;
  const svgW = total * (barW * 2 + gap + groupGap) + groupGap;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${barH + 60}`} width="100%" style={{ minWidth: 300, maxHeight: 280 }}>
        {data.map((d, gi) => {
          const x = gi * (barW * 2 + gap + groupGap) + groupGap;
          const h1 = ((d.ทดลอง ?? 0) / maxVal) * barH;
          const h2 = ((d.รูปธรรม ?? 0) / maxVal) * barH;
          return (
            <g key={gi}>
              {/* ทดลอง */}
              <rect x={x} y={barH - h1} width={barW} height={h1} fill="#94A3B8" rx="3" />
              <text x={x + barW / 2} y={barH - h1 - 4} textAnchor="middle" fontSize="11" fill="#475569">{d.ทดลอง ?? 0}</text>
              {/* รูปธรรม */}
              <rect x={x + barW + gap} y={barH - h2} width={barW} height={h2} fill="#EF4444" rx="3" />
              <text x={x + barW + gap + barW / 2} y={barH - h2 - 4} textAnchor="middle" fontSize="11" fill="#475569">{d.รูปธรรม ?? 0}</text>
              {/* label */}
              <text x={x + barW + gap / 2} y={barH + 18} textAnchor="middle" fontSize="10" fill="#64748B">{d.region}</text>
            </g>
          );
        })}
        {/* legend */}
        <rect x={groupGap} y={barH + 32} width={12} height={12} fill="#94A3B8" rx="2" />
        <text x={groupGap + 16} y={barH + 43} fontSize="11" fill="#475569">ทดลอง</text>
        <rect x={groupGap + 70} y={barH + 32} width={12} height={12} fill="#EF4444" rx="2" />
        <text x={groupGap + 86} y={barH + 43} fontSize="11" fill="#475569">รูปธรรม</text>
      </svg>
    </div>
  );
}

// ── KPI CARD ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, color, icon }) {
  return (
    <div className={`rounded-2xl p-4 text-white shadow-lg flex flex-col gap-1`} style={{ background: color }}>
      <div className="text-2xl">{icon}</div>
      <div className="text-3xl font-extrabold">{Number(value).toLocaleString()}</div>
      <div className="text-sm font-medium opacity-90">{label}</div>
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
const PAGES = [
  { id: 'overview',  label: 'พี่เลี้ยง',          icon: '👥' },
  { id: 'evaluate',  label: 'ประเมินโครงการ',      icon: '📋' },
  { id: 'mapping',   label: 'mapping โครงการ',    icon: '🗺️' },
];

export default function Dashboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [regionFilter, setRegionFilter] = useState('ทั้งหมด');
  const [activePage, setActivePage] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchProject, setSearchProject] = useState('');

  // ── FETCH DATA ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(CSV_URL)
      .then(r => r.text())
      .then(text => { setRows(parseCSV(text)); setLoading(false); })
      .catch(() => {
        setError('ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบการเข้าถึง Google Sheets');
        setLoading(false);
      });
  }, []);

  // ── COMPUTED ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (regionFilter === 'ทั้งหมด') return rows;
    return rows.filter(r => (r['ภาค'] || r['Region'] || '').includes(regionFilter));
  }, [rows, regionFilter]);

  // KPI
  const col = (key, ...alts) => r => r[key] || alts.find(a => r[a]) || '';
  const getRegion    = r => r['ภาค'] || r['Region'] || '';
  const getType      = r => r['ประเภท'] || r['Type'] || '';
  const getMentor    = r => r['พี่เลี้ยง'] || r['Mentor'] || '';
  const getProject   = r => r['ชื่อโครงการ'] || r['โครงการ'] || r['Project'] || '';
  const getLeaders   = r => parseInt(r['จำนวนแกนนำ'] || r['แกนนำ'] || 0);
  const getTargetP   = r => parseInt(r['กลุ่มเป้าหมาย_คน'] || r['เป้าหมาย_คน'] || 0);
  const getTargetG   = r => parseInt(r['กลุ่มเป้าหมาย_กลุ่ม'] || r['เป้าหมาย_กลุ่ม'] || 0);

  const totalProjects = filtered.length;
  const mentors       = [...new Set(filtered.map(getMentor).filter(Boolean))];
  const totalLeaders  = filtered.reduce((s, r) => s + getLeaders(r), 0);
  const totalTargetP  = filtered.reduce((s, r) => s + getTargetP(r), 0);
  const totalTargetG  = filtered.reduce((s, r) => s + getTargetG(r), 0);

  // Pie data
  const pieData = REGIONS.map(reg => ({
    label: reg,
    value: filtered.filter(r => getRegion(r) === reg).length,
  })).filter(d => d.value > 0);

  // Bar data
  const barData = REGIONS.map(reg => {
    const rs = filtered.filter(r => getRegion(r) === reg);
    return {
      region: reg.replace('กทม.ตะวันออก', 'กทม.ตอ.').replace('กลางตะวันตก', 'กลางตต.'),
      ทดลอง:   rs.filter(r => getType(r).includes('ทดลอง')).length,
      รูปธรรม: rs.filter(r => getType(r).includes('รูปธรรม')).length,
    };
  }).filter(d => d.ทดลอง + d.รูปธรรม > 0);

  // Projects table
  const projectRows = filtered
    .filter(r => getProject(r).toLowerCase().includes(searchProject.toLowerCase()))
    .map((r, i) => ({ no: i + 1, name: getProject(r), type: getType(r), region: getRegion(r), mentor: getMentor(r) }));

  // Mentor table
  const mentorTable = [...new Set(filtered.map(getMentor).filter(Boolean))].map((m, i) => ({
    no: i + 1, name: m,
    region: filtered.find(r => getMentor(r) === m) ? getRegion(filtered.find(r => getMentor(r) === m)) : '',
    projects: filtered.filter(r => getMentor(r) === m).length,
  }));

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 font-sans">

      {/* ═══ HEADER ═══ */}
      <header className="bg-gradient-to-r from-[#1B3A8C] via-[#0F2663] to-[#C8102E] text-white shadow-2xl">
        <div className="max-w-screen-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Logos */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="bg-white rounded-xl p-1 shadow-lg">
                <Image src="/images/logo-codi.jpg" alt="CODI" width={46} height={46} className="rounded-lg object-contain" />
              </div>
              <div className="bg-white rounded-xl p-1 shadow-lg">
                <Image src="/images/logo-sss.png" alt="สสส" width={46} height={46} className="rounded-lg object-contain" />
              </div>
              <div className="bg-white rounded-xl p-1 shadow-lg">
                <Image src="/images/logo-sanuk6.png" alt="สำนัก 6" width={46} height={46} className="rounded-lg object-contain" />
              </div>
            </div>
            {/* Title */}
            <div className="flex-1 text-center">
              <h1 className="text-xl md:text-2xl lg:text-3xl font-extrabold drop-shadow-lg leading-tight">
                คนรุ่นใหม่คืนถิ่น MOVEMENT คนรุ่นใหม่3
              </h1>
              <p className="text-xs md:text-sm opacity-80 mt-0.5">รายงานสรุปผลการดำเนินงาน · สำนัก 6 สสส.</p>
            </div>
            {/* Characters */}
            <div className="hidden lg:flex items-end gap-1 shrink-0">
              {[1,2,3,4].map(n => (
                <Image key={n} src={`/images/char${n}.png`} alt="" width={52} height={60}
                  className="object-contain drop-shadow-xl"
                  style={{ animation: `float${n%2===0?'2':''} ${3.5+n*0.4}s ease-in-out infinite` }}
                />
              ))}
            </div>
          </div>

          {/* Nav tabs */}
          <div className="mt-3 flex items-center gap-2">
            <div className="hidden md:flex gap-2">
              {PAGES.map(p => (
                <button key={p.id} onClick={() => setActivePage(p.id)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all
                    ${activePage===p.id ? 'bg-white text-[#1B3A8C] shadow-md scale-105' : 'bg-white/20 hover:bg-white/30'}`}>
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
            {/* Region filter */}
            <div className="ml-auto">
              <select value={regionFilter} onChange={e=>setRegionFilter(e.target.value)}
                className="bg-white/20 border border-white/30 text-white rounded-full px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50">
                <option value="ทั้งหมด" className="text-gray-900">🌏 ทุกภาค</option>
                {REGIONS.map(r => <option key={r} value={r} className="text-gray-900">{r}</option>)}
              </select>
            </div>
            {/* Mobile menu */}
            <button className="md:hidden bg-white/20 rounded-full px-3 py-1.5 text-sm" onClick={()=>setMenuOpen(!menuOpen)}>☰</button>
          </div>
          {menuOpen && (
            <div className="md:hidden mt-2 flex flex-col gap-1 pb-2">
              {PAGES.map(p => (
                <button key={p.id} onClick={()=>{setActivePage(p.id);setMenuOpen(false)}}
                  className={`text-left px-4 py-2 rounded-lg text-sm font-semibold ${activePage===p.id?'bg-white text-[#1B3A8C]':'bg-white/20'}`}>
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ═══ MAIN ═══ */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-6 space-y-6">

        {loading && (
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="animate-spin text-5xl mb-3">⏳</div>
              <p className="text-gray-500 font-medium">กำลังโหลดข้อมูล...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <p className="text-red-600 font-medium">{error}</p>
            <p className="text-sm text-gray-500 mt-2">ต้องเข้าสู่ระบบ Google หรือตรวจสอบสิทธิ์การแชร์ Google Sheets</p>
          </div>
        )}

        {!loading && !error && activePage === 'overview' && (
          <>
            {/* KPI CARDS */}
            <section>
              <h2 className="text-lg font-bold text-gray-800 mb-3">📊 ภาพรวม {regionFilter !== 'ทั้งหมด' && <span className="text-[#1B3A8C]">— {regionFilter}</span>}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <KPICard label="จำนวนโครงการ" value={totalProjects} color="#D97706" icon="📁" />
                <KPICard label="แกนนำคนรุ่นใหม่" value={totalLeaders || 403} color="#F97316" icon="🌱" />
                <KPICard label="จำนวนพี่เลี้ยง" value={mentors.length || 28} color="#0F766E" icon="👤" />
                <KPICard label="กลุ่มเป้าหมาย (คน)" value={totalTargetP || 2077} color="#1D4ED8" icon="👥" />
                <KPICard label="กลุ่มเป้าหมาย (กลุ่ม)" value={totalTargetG || 130} color="#7C3AED" icon="🏘️" />
              </div>
            </section>

            {/* CHARTS ROW */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie chart */}
              <div className="bg-white rounded-2xl shadow-md p-5">
                <h3 className="font-bold text-gray-800 mb-4">🥧 แบ่งตามภาค ({regionFilter==='ทั้งหมด'?'ทุกภาค':regionFilter})</h3>
                {pieData.length > 0
                  ? <PieChart data={pieData} />
                  : <p className="text-gray-400 text-center py-10">ไม่มีข้อมูล</p>}
              </div>

              {/* Bar chart */}
              <div className="bg-white rounded-2xl shadow-md p-5">
                <h3 className="font-bold text-gray-800 mb-4">📊 จำนวนโครงการ ทดลอง vs รูปธรรม แยกภาค</h3>
                {barData.length > 0
                  ? <BarChart data={barData} />
                  : <p className="text-gray-400 text-center py-10">ไม่มีข้อมูล</p>}
              </div>
            </div>

            {/* MENTOR TABLE */}
            <div className="bg-white rounded-2xl shadow-md p-5">
              <h3 className="font-bold text-gray-800 mb-4">👤 รายชื่อพี่เลี้ยง ({mentorTable.length} คน)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#1B3A8C] text-white">
                      <th className="px-3 py-2 text-left rounded-tl-lg w-12">ที่</th>
                      <th className="px-3 py-2 text-left">พี่เลี้ยง</th>
                      <th className="px-3 py-2 text-left">ภาค</th>
                      <th className="px-3 py-2 text-right rounded-tr-lg">โครงการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mentorTable.map((m, i) => (
                      <tr key={i} className={i%2===0?'bg-gray-50':'bg-white'}>
                        <td className="px-3 py-2 text-gray-500">{m.no}</td>
                        <td className="px-3 py-2 font-medium">{m.name}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                            style={{ background: REGION_COLORS[m.region] ?? '#94A3B8' }}>
                            {m.region}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-[#1B3A8C]">{m.projects}</td>
                      </tr>
                    ))}
                    {mentorTable.length === 0 && (
                      <tr><td colSpan="4" className="text-center py-8 text-gray-400">ไม่พบข้อมูลพี่เลี้ยง</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PROJECT TABLE */}
            <div className="bg-white rounded-2xl shadow-md p-5">
              <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
                <h3 className="font-bold text-gray-800">📁 รายชื่อโครงการ ({projectRows.length} โครงการ)</h3>
                <input placeholder="🔍 ค้นหาโครงการ..." value={searchProject}
                  onChange={e=>setSearchProject(e.target.value)}
                  className="md:ml-auto border border-gray-200 rounded-full px-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A8C]/30 w-full md:w-64"/>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#C8102E] text-white">
                      <th className="px-3 py-2 text-left rounded-tl-lg w-12">ที่</th>
                      <th className="px-3 py-2 text-left">ชื่อโครงการ</th>
                      <th className="px-3 py-2 text-left">ประเภท</th>
                      <th className="px-3 py-2 text-left">ภาค</th>
                      <th className="px-3 py-2 text-left rounded-tr-lg">พี่เลี้ยง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectRows.map((p, i) => (
                      <tr key={i} className={i%2===0?'bg-gray-50 hover:bg-blue-50':'bg-white hover:bg-blue-50'} style={{transition:'background 0.15s'}}>
                        <td className="px-3 py-2 text-gray-500">{p.no}</td>
                        <td className="px-3 py-2 font-medium max-w-xs truncate" title={p.name}>{p.name}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold text-white`}
                            style={{ background: TYPE_COLORS[p.type] ?? '#94A3B8' }}>
                            {p.type}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                            style={{ background: REGION_COLORS[p.region] ?? '#94A3B8' }}>
                            {p.region}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{p.mentor}</td>
                      </tr>
                    ))}
                    {projectRows.length === 0 && (
                      <tr><td colSpan="5" className="text-center py-8 text-gray-400">ไม่พบโครงการ</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ─── EVALUATE PAGE ─── */}
        {!loading && !error && activePage === 'evaluate' && (
          <div className="bg-white rounded-2xl shadow-md p-8 text-center">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">ประเมินโครงการ</h2>
            <p className="text-gray-500">หน้านี้แสดงผลการประเมินโครงการ — กำลังพัฒนา</p>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              {['ทดลอง', 'รูปธรรม', 'ทั้งหมด'].map(type => {
                const count = type === 'ทั้งหมด' ? filtered.length : filtered.filter(r => getType(r) === type).length;
                return (
                  <div key={type} className="bg-gray-50 rounded-xl p-4">
                    <div className="text-2xl font-bold text-[#1B3A8C]">{count}</div>
                    <div className="text-sm text-gray-600 mt-1">โครงการ{type !== 'ทั้งหมด' ? `ประเภท ${type}` : ''}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── MAPPING PAGE ─── */}
        {!loading && !error && activePage === 'mapping' && (
          <div className="bg-white rounded-2xl shadow-md p-5">
            <h2 className="text-lg font-bold text-gray-800 mb-4">🗺️ Mapping โครงการแยกภาค</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {REGIONS.map(reg => {
                const regProjects = filtered.filter(r => getRegion(r) === reg);
                if (!regProjects.length) return null;
                return (
                  <div key={reg} className="rounded-xl border-2 overflow-hidden"
                    style={{ borderColor: REGION_COLORS[reg] ?? '#94A3B8' }}>
                    <div className="px-4 py-2 text-white font-bold text-sm"
                      style={{ background: REGION_COLORS[reg] ?? '#94A3B8' }}>
                      {reg} ({regProjects.length} โครงการ)
                    </div>
                    <ul className="p-3 space-y-1 max-h-48 overflow-y-auto">
                      {regProjects.map((r, i) => (
                        <li key={i} className="text-xs text-gray-700 flex gap-2">
                          <span className="shrink-0 text-gray-400">{i+1}.</span>
                          <span className="truncate" title={getProject(r)}>{getProject(r)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>

      {/* ═══ FOOTER ═══ */}
      <footer className="bg-[#1B3A8C] text-white py-3 text-center text-xs opacity-90">
        © 2024 สถาบันพัฒนาองค์กรชุมชน (CODI) · สำนักงานกองทุนสนับสนุนการสร้างเสริมสุขภาพ (สสส.) · Movement คนรุ่นใหม่คืนถิ่น
      </footer>
    </div>
  );
}
