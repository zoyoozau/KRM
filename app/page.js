'use client';
import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';

// ─── DATA SOURCE ──────────────────────────────────────────────────────────────
const SHEET_ID  = '1uFaWzUV8J8HxCDk6rSiUlqAmhiyt9JT3b1yeonWQNK0';
const SHEET_GID = '1566885801';
const CSV_URL   = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const REGION_COLORS = {
  'ภาคเหนือ':      '#EF4444',
  'ใต้':           '#3B82F6',
  'ภาคอีสาน':     '#F97316',
  'กทม.ตะวันออก': '#22C55E',
  'กลางตะวันตก':  '#EAB308',
};
const ISSUE_COLORS = ['#6366F1','#EC4899','#14B8A6','#F59E0B','#84CC16','#06B6D4','#8B5CF6'];
const REGIONS = Object.keys(REGION_COLORS);

// ─── CSV PARSER (รองรับ multi-line quoted cells) ──────────────────────────────
function parseCSV(text) {
  function tokenise(src) {
    const rows = [];
    let row = [], cur = '', inQ = false, i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '"') {
        if (inQ && src[i+1] === '"') { cur += '"'; i += 2; continue; }
        inQ = !inQ; i++; continue;
      }
      if (ch === ',' && !inQ) { row.push(cur); cur = ''; i++; continue; }
      if ((ch === '\n' || ch === '\r') && !inQ) {
        if (ch === '\r' && src[i+1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = ''; i++; continue;
      }
      cur += ch; i++;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  const rows = tokenise(text);
  if (rows.length < 4) return [];

  const clean = s => s.replace(/^#\s*/, '').replace(/\n/g,' ').trim();
  const headers = rows[2].map(clean);

  const VALID_REGIONS = ['ภาคเหนือ','ใต้','ภาคอีสาน','กทม.ตะวันออก','กลางตะวันตก'];
  const regionIdx = headers.indexOf('ภาค');

  return rows.slice(3)
    .filter(vals => {
      const name = (vals[headers.indexOf('ชื่อโครงการ')] ?? '').trim();
      const reg  = regionIdx >= 0 ? (vals[regionIdx] ?? '').trim() : '';
      return name && VALID_REGIONS.includes(reg);
    })
    .map(vals => {
      const obj = {};
      headers.forEach((h, i) => { if (h) obj[h] = (vals[i] ?? '').trim(); });
      return obj;
    });
}

// ─── ACCESSORS ────────────────────────────────────────────────────────────────
const g = (r, ...keys) => { for (const k of keys) if (r[k] !== undefined && r[k] !== '') return r[k]; return ''; };

const getProject  = r => g(r, 'ชื่อโครงการ');
const getRegion   = r => g(r, 'ภาค');
const getSubReg   = r => g(r, 'กลุ่มจังหวัด');
const getProvince = r => g(r, 'จังหวัด');
const getDistrict = r => g(r, 'อำเภอ');
const getMentor   = r => g(r, 'รายชื่อพี่เลี้ยง');
const getStatus   = r => g(r, 'สถานะ');
const getIssue    = r => g(r, 'ประเด็น');
const getLat      = r => parseFloat(g(r, 'latitude')) || null;
const getLon      = r => parseFloat(g(r, 'longtitude', 'longitude')) || null;
const getBudget   = r => { const v = g(r, 'งบประมาณ').replace(/[฿,]/g,''); return parseInt(v)||0; };
const getLeaders  = r => parseInt(g(r, 'จำนวนแกนนำโครงการ (คน)', 'จำนวนแกนนำ')) || 0;
const getTargetP  = r => parseInt(g(r, 'จำนวนกลุ่มเป้าหมายเข้าร่วมโครงการ (คน)', 'จำนวนกลุ่มเป้าหมายเข้า\nร่วมโครงการ\n(คน)')) || 0;
const getTargetG  = r => parseInt(g(r, 'จำนวนกลุ่มเป้าหมายเข้าร่วมโครงการ (กี่กลุ่มองค์กร)', 'จำนวนกลุ่มเป้า\nหมายเข้าร่วม\nโครงการ\n(กี่กลุ่มองค์กร)')) || 0;
const getProgress   = r => parseInt(g(r, 'ประเมินการดำเนินกิจกรรมของโครงการ (เปอร์เซ็นต์ %)', 'ประเมินการดำเนิน\nกิจกรรมของโครงการ\n(เปอร์เซ็นต์ %)')) || 0;
const getRowNo      = r => g(r, 'ที่');

// ประเภทโครงการ: งบ ≤ 70,000 = ทดลอง, งบ > 70,000 = รูปธรรม
const getProjectType = budget => budget > 0 && budget <= 70000 ? 'ทดลอง' : budget > 70000 ? 'รูปธรรม' : '-';
const TYPE_COLOR = { 'ทดลอง': '#F97316', 'รูปธรรม': '#1B3A8C' };

// ─── SVG PIE ──────────────────────────────────────────────────────────────────
function PieChart({ data, size = 160 }) {
  const total = data.reduce((s,d)=>s+d.value,0);
  if (!total) return null;
  let a = -90;
  const slices = data.map(d=>{ const p=d.value/total, s=a; a+=p*360; return{...d,p,s,e:a}; });
  const arc=(cx,cy,r,s,e)=>{
    const to=x=>(x*Math.PI)/180;
    const x1=cx+r*Math.cos(to(s)),y1=cy+r*Math.sin(to(s));
    const x2=cx+r*Math.cos(to(e)),y2=cy+r*Math.sin(to(e));
    const lg=e-s>180?1:0;
    return `M${cx} ${cy}L${x1} ${y1}A${r} ${r} 0 ${lg} 1 ${x2} ${y2}Z`;
  };
  const cx=100, cy=100, r=88;
  return (
    <div className="flex flex-col items-center w-full">
      <svg viewBox="0 0 200 200" width={size} height={size}>
        {slices.map((s,i)=>(
          <path key={i} d={arc(cx,cy,r,s.s,s.e)}
            fill={REGION_COLORS[s.label]??ISSUE_COLORS[i%ISSUE_COLORS.length]}
            stroke="#fff" strokeWidth="2"/>
        ))}
        {/* center hole */}
        <circle cx={cx} cy={cy} r="40" fill="white"/>
        <text x={cx} y={cy-6} textAnchor="middle" fontSize="11" fill="#64748b" fontWeight="600">รวม</text>
        <text x={cx} y={cy+10} textAnchor="middle" fontSize="15" fill="#1e293b" fontWeight="800">{total}</text>
      </svg>
      {/* legend */}
      <div className="flex flex-col gap-1 w-full mt-2">
        {slices.map((s,i)=>(
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-sm shrink-0"
              style={{background:REGION_COLORS[s.label]??ISSUE_COLORS[i%ISSUE_COLORS.length]}}/>
            <span className="flex-1 text-gray-700 font-medium">{s.label}</span>
            <span className="font-extrabold text-gray-900">{s.value}</span>
            <span className="text-gray-400 w-8 text-right">{Math.round(s.p*100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SVG BAR CHART ────────────────────────────────────────────────────────────
function BarChart({ data, keys, colors, labels }) {
  const maxVal = Math.max(...data.flatMap(d=>keys.map(k=>d[k]??0)), 1);
  const H=150, BW=30, GAP=6, GG=28;
  const svgW = data.length*(BW*keys.length+GAP*(keys.length-1)+GG)+GG;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${H+60}`} width="100%" style={{minWidth:240, maxHeight:240}}>
        {data.map((d,gi)=>{
          const x=gi*(BW*keys.length+GAP*(keys.length-1)+GG)+GG;
          return (
            <g key={gi}>
              {keys.map((k,ki)=>{
                const h=(d[k]??0)/maxVal*H;
                return (
                  <g key={ki}>
                    <rect x={x+ki*(BW+GAP)} y={H-h} width={BW} height={h}
                      fill={colors[ki]} rx="3"/>
                    {d[k]>0&&(
                      <text x={x+ki*(BW+GAP)+BW/2} y={H-h-4}
                        textAnchor="middle" fontSize="10" fill="#475569" fontWeight="600">
                        {d[k]}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x={x+(BW*keys.length+GAP*(keys.length-1))/2} y={H+16}
                textAnchor="middle" fontSize="9" fill="#64748B">{d.label}</text>
            </g>
          );
        })}
        {/* legend */}
        {keys.map((k,i)=>(
          <g key={i}>
            <rect x={GG+i*100} y={H+28} width={12} height={12} fill={colors[i]} rx="2"/>
            <text x={GG+i*100+16} y={H+39} fontSize="10" fill="#475569">{labels[i]}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── KPI CARD (Looker-style) ───────────────────────────────────────────────────
function KPIBox({ label, value, color, icon }) {
  return (
    <div className="rounded-xl p-3 text-white shadow flex flex-col items-center justify-center text-center min-h-[90px]"
      style={{background: color}}>
      <div className="text-2xl mb-0.5">{icon}</div>
      <div className="text-2xl md:text-3xl font-extrabold leading-tight">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-xs font-semibold opacity-90 mt-0.5 leading-tight">{label}</div>
    </div>
  );
}

// ─── BADGE ────────────────────────────────────────────────────────────────────
function Badge({ text, color }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-white whitespace-nowrap"
      style={{background: color}}>{text||'-'}</span>
  );
}

// ─── PAGES ───────────────────────────────────────────────────────────────────
const PAGES = [
  { id:'overview', label:'ภาพรวม',       icon:'📊' },
  { id:'projects', label:'รายชื่อโครงการ', icon:'📁' },
  { id:'mentors',  label:'พี่เลี้ยง',     icon:'👤' },
  { id:'mapping',  label:'Mapping',       icon:'🗺️' },
];

// ─── MAIN ────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [region,   setRegion]   = useState('ทั้งหมด');
  const [province, setProvince] = useState('ทั้งหมด');
  const [issue,    setIssue]    = useState('ทั้งหมด');
  const [page,     setPage]     = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [search,   setSearch]   = useState('');

  // Fetch
  useEffect(()=>{
    fetch(CSV_URL)
      .then(r=>{ if(!r.ok) throw new Error('Network error'); return r.text(); })
      .then(t=>{ setRows(parseCSV(t)); setLoading(false); })
      .catch(()=>{ setError('ไม่สามารถโหลดข้อมูลได้ — ตรวจสอบสิทธิ์การแชร์ Google Sheets'); setLoading(false); });
  },[]);

  // Derived
  const allProvinces = useMemo(()=>[...new Set(rows.map(getProvince).filter(Boolean))].sort(),[rows]);
  const allIssues    = useMemo(()=>[...new Set(rows.map(getIssue).filter(Boolean))].sort(),[rows]);

  const filtered = useMemo(()=>rows.filter(r=>{
    if (region!=='ทั้งหมด' && getRegion(r)!==region) return false;
    if (province!=='ทั้งหมด' && getProvince(r)!==province) return false;
    if (issue!=='ทั้งหมด' && getIssue(r)!==issue) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!getProject(r).toLowerCase().includes(q) &&
          !getMentor(r).toLowerCase().includes(q) &&
          !getProvince(r).toLowerCase().includes(q)) return false;
    }
    return true;
  }), [rows, region, province, issue, search]);

  // KPIs
  const totalLeaders = filtered.reduce((s,r)=>s+getLeaders(r),0);
  const totalTargetP = filtered.reduce((s,r)=>s+getTargetP(r),0);
  const totalTargetG = filtered.reduce((s,r)=>s+getTargetG(r),0);
  const totalBudget  = filtered.reduce((s,r)=>s+getBudget(r),0);
  const avgProgress  = filtered.length ? Math.round(filtered.reduce((s,r)=>s+getProgress(r),0)/filtered.length) : 0;
  const mentorSet    = [...new Set(filtered.map(getMentor).filter(Boolean))];

  // Charts
  const pieRegion = REGIONS.map(reg=>({ label:reg, value:filtered.filter(r=>getRegion(r)===reg).length })).filter(d=>d.value>0);
  const pieIssue  = allIssues.slice(0,7).map(iss=>({ label:iss, value:filtered.filter(r=>getIssue(r)===iss).length })).filter(d=>d.value>0);

  const barRegion = REGIONS.map(reg=>{
    const rs = filtered.filter(r=>getRegion(r)===reg);
    return {
      label: reg.replace('กทม.ตะวันออก','กทม.ตอ.').replace('กลางตะวันตก','กลาง ตต.').replace('ภาคเหนือ','เหนือ').replace('ภาคอีสาน','อีสาน'),
      total: rs.length,
      leaders: rs.reduce((s,r)=>s+getLeaders(r),0),
    };
  }).filter(d=>d.total>0);

  // Table data
  const projectRows = filtered.map((r,i)=>({
    no:i+1, rowNo:getRowNo(r), name:getProject(r), region:getRegion(r), subReg:getSubReg(r),
    province:getProvince(r), issue:getIssue(r), status:getStatus(r),
    budget:getBudget(r), leaders:getLeaders(r), targetP:getTargetP(r), targetG:getTargetG(r),
    progress:getProgress(r), mentor:getMentor(r), lat:getLat(r), lon:getLon(r),
    type: getProjectType(getBudget(r)),
  }));

  const mentorRows = mentorSet.map((m,i)=>{
    const ps = filtered.filter(r=>getMentor(r)===m);
    return { no:i+1, name:m, region:getRegion(ps[0]||{}), count:ps.length,
      provinces:[...new Set(ps.map(getProvince))].join(', '),
      leaders:ps.reduce((s,r)=>s+getLeaders(r),0) };
  });

  const mapRows = projectRows.filter(r=>r.lat&&r.lon);
  const statusColor = s => s&&s.includes('กำลัง')?'#2563EB':s&&s.includes('เสร็จ')?'#16A34A':'#9CA3AF';

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">

      {/* ══ HEADER (Gold / Amber) ══ */}
      <header style={{background:'linear-gradient(135deg,#B8860B 0%,#DAA520 35%,#FFD700 60%,#DAA520 80%,#B8860B 100%)'}}>
        <div className="max-w-screen-2xl mx-auto px-3 py-3">
          {/* Top bar: logos | title | characters */}
          <div className="flex items-center gap-3">
            {/* Logos */}
            <div className="flex items-center gap-1.5 shrink-0">
              {['logo-codi.jpg','logo-sss.png','logo-sanuk6.png'].map((f,i)=>(
                <div key={i} className="bg-white rounded-lg p-0.5 shadow">
                  <Image src={`/images/${f}`} alt="" width={40} height={40} className="rounded object-contain"/>
                </div>
              ))}
            </div>
            {/* Title */}
            <div className="flex-1 text-center min-w-0 px-2">
              <h1 className="text-base md:text-xl font-extrabold text-[#3B1A00] drop-shadow leading-tight">
                คนรุ่นใหม่คืนถิ่น MOVEMENT คนรุ่นใหม่ 3
              </h1>
              <p className="text-xs text-[#5C3500] font-semibold opacity-90 mt-0.5">
                รายงานสรุปผลการดำเนินงาน · สำนัก 6 สสส.
              </p>
            </div>
            {/* Characters */}
            <div className="hidden sm:flex items-end gap-0.5 shrink-0">
              {[1,2,3,4].map(n=>(
                <Image key={n} src={`/images/char${n}.png`} alt="" width={44} height={52}
                  className="object-contain drop-shadow-lg"
                  style={{animation:`float${n%2===0?'2':''} ${3.5+n*0.4}s ease-in-out infinite`}}/>
              ))}
            </div>
          </div>

          {/* Nav + filters */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {/* Desktop nav */}
            <div className="hidden md:flex gap-1">
              {PAGES.map(p=>(
                <button key={p.id} onClick={()=>setPage(p.id)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all border
                    ${page===p.id
                      ?'bg-[#3B1A00] text-yellow-300 border-[#3B1A00] shadow-md'
                      :'bg-white/30 text-[#3B1A00] border-white/50 hover:bg-white/50'}`}>
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
            {/* Filters */}
            <div className="flex-1 flex flex-wrap gap-1.5 md:justify-end">
              <select value={region} onChange={e=>{setRegion(e.target.value);setProvince('ทั้งหมด');}}
                className="bg-white/70 border border-[#8B6000]/30 text-[#3B1A00] rounded-full px-3 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-yellow-600/40">
                <option value="ทั้งหมด">🌏 ทุกภาค</option>
                {REGIONS.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
              <select value={province} onChange={e=>setProvince(e.target.value)}
                className="bg-white/70 border border-[#8B6000]/30 text-[#3B1A00] rounded-full px-3 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-yellow-600/40">
                <option value="ทั้งหมด">📍 ทุกจังหวัด</option>
                {allProvinces.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <select value={issue} onChange={e=>setIssue(e.target.value)}
                className="bg-white/70 border border-[#8B6000]/30 text-[#3B1A00] rounded-full px-3 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-yellow-600/40">
                <option value="ทั้งหมด">📌 ทุกประเด็น</option>
                {allIssues.map(i=><option key={i} value={i}>{i}</option>)}
              </select>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ค้นหา..."
                className="bg-white/70 border border-[#8B6000]/30 text-[#3B1A00] placeholder-[#8B6000]/60 rounded-full px-3 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-yellow-600/40 w-28 md:w-36"/>
            </div>
            {/* Mobile menu button */}
            <button className="md:hidden bg-[#3B1A00]/20 rounded-full px-3 py-1 text-xs text-[#3B1A00] font-bold"
              onClick={()=>setMenuOpen(!menuOpen)}>☰</button>
          </div>

          {/* Mobile menu */}
          {menuOpen&&(
            <div className="md:hidden mt-2 flex flex-col gap-1 pb-1">
              {PAGES.map(p=>(
                <button key={p.id} onClick={()=>{setPage(p.id);setMenuOpen(false)}}
                  className={`text-left px-4 py-2 rounded-lg text-sm font-bold
                    ${page===p.id?'bg-[#3B1A00] text-yellow-300':'bg-white/30 text-[#3B1A00]'}`}>
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ══ MAIN ══ */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-3 py-4 space-y-4">

        {/* Loading */}
        {loading&&(
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="animate-spin text-5xl mb-3">⏳</div>
              <p className="text-gray-500 font-medium">กำลังโหลดข้อมูลจาก Google Sheets...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error&&!loading&&(
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 text-center">
            <p className="text-amber-700 font-semibold text-lg">⚠️ {error}</p>
            <p className="text-sm text-gray-500 mt-2">กรุณาแชร์ Google Sheets เป็น "ทุกคนที่มีลิ้งค์" (ผู้ดู) แล้วรีเฟรชหน้าเว็บ</p>
          </div>
        )}

        {!loading&&!error&&(
          <>
            {/* ══════════════════════════════════════════════════════════
                OVERVIEW PAGE
            ══════════════════════════════════════════════════════════ */}
            {page==='overview'&&(
              <div className="space-y-4">

                {/* ── Row 1: KPI Cards ── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <KPIBox label="จำนวนโครงการ"         value={filtered.length}  color="#B8860B" icon="📁"/>
                  <KPIBox label="แกนนำคนรุ่นใหม่ (คน)" value={totalLeaders}     color="#C8102E" icon="🌱"/>
                  <KPIBox label="พี่เลี้ยง (คน)"        value={mentorSet.length} color="#1B3A8C" icon="👤"/>
                  <KPIBox label="กลุ่มเป้าหมาย (คน)"   value={totalTargetP}    color="#0F766E" icon="👥"/>
                  <KPIBox label="กลุ่มเป้าหมาย (กลุ่ม)" value={totalTargetG}   color="#6D28D9" icon="🏘️"/>
                </div>

                {/* ── Row 2: Pie | Characters | Mentor table ── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                  {/* PIE CHART แบ่งภาค */}
                  <div className="bg-white rounded-2xl shadow p-4">
                    <h3 className="font-extrabold text-sm text-gray-700 mb-3 border-b border-gray-100 pb-2">
                      🥧 โครงการแบ่งตามภาค
                    </h3>
                    {pieRegion.length>0
                      ? <PieChart data={pieRegion} size={150}/>
                      : <p className="text-gray-400 text-center py-8 text-sm">ไม่มีข้อมูล</p>}
                  </div>

                  {/* CENTER: Characters + summary stats */}
                  <div className="bg-white rounded-2xl shadow p-4 flex flex-col items-center justify-between">
                    {/* Characters row */}
                    <div className="flex items-end justify-center gap-1 mb-3">
                      {[1,2,3,4].map(n=>(
                        <Image key={n} src={`/images/char${n}.png`} alt="" width={56} height={66}
                          className="object-contain drop-shadow-md"
                          style={{animation:`float${n%2===0?'2':''} ${3.5+n*0.4}s ease-in-out infinite`}}/>
                      ))}
                    </div>
                    {/* Summary stats */}
                    <div className="w-full space-y-2">
                      <div className="flex items-center justify-between bg-amber-50 rounded-xl px-3 py-2">
                        <span className="text-xs font-semibold text-amber-800">งบประมาณรวม</span>
                        <span className="text-base font-extrabold text-amber-700">฿{(totalBudget/1000000).toFixed(2)}M</span>
                      </div>
                      <div className="flex items-center justify-between bg-blue-50 rounded-xl px-3 py-2">
                        <span className="text-xs font-semibold text-blue-800">เฉลี่ย/โครงการ</span>
                        <span className="text-base font-extrabold text-blue-700">
                          ฿{filtered.length?Math.round(totalBudget/filtered.length/1000).toLocaleString():0}K
                        </span>
                      </div>
                      {avgProgress>0&&(
                        <div className="bg-green-50 rounded-xl px-3 py-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-green-800">ความคืบหน้าเฉลี่ย</span>
                            <span className="text-sm font-extrabold text-green-700">{avgProgress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="h-2 rounded-full transition-all"
                              style={{width:`${avgProgress}%`, background:'linear-gradient(90deg,#16A34A,#84CC16)'}}/>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* MENTOR TABLE */}
                  <div className="bg-white rounded-2xl shadow p-4 flex flex-col">
                    <h3 className="font-extrabold text-sm text-gray-700 mb-3 border-b border-gray-100 pb-2">
                      👤 รายชื่อพี่เลี้ยง ({mentorRows.length} คน)
                    </h3>
                    <div className="overflow-y-auto flex-1" style={{maxHeight:260}}>
                      <table className="w-full text-xs">
                        <thead className="sticky top-0">
                          <tr style={{background:'#1B3A8C'}}>
                            <th className="text-white px-2 py-1.5 text-left rounded-tl-lg">ชื่อ</th>
                            <th className="text-white px-2 py-1.5 text-center">ภาค</th>
                            <th className="text-white px-2 py-1.5 text-center rounded-tr-lg">โครงการ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mentorRows.map((m,i)=>(
                            <tr key={i} className={i%2===0?'bg-gray-50':'bg-white'}>
                              <td className="px-2 py-1.5 font-medium text-gray-800 truncate max-w-[130px]" title={m.name}>{m.name}</td>
                              <td className="px-2 py-1.5 text-center">
                                <span className="inline-block w-2.5 h-2.5 rounded-full"
                                  style={{background:REGION_COLORS[m.region]??'#94A3B8'}}/>
                              </td>
                              <td className="px-2 py-1.5 text-center font-bold text-[#1B3A8C]">{m.count}</td>
                            </tr>
                          ))}
                          {mentorRows.length===0&&(
                            <tr><td colSpan="3" className="text-center py-6 text-gray-400">ไม่มีข้อมูล</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* ── Row 3: Bar chart | Issue Pie ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl shadow p-4">
                    <h3 className="font-extrabold text-sm text-gray-700 mb-3 border-b border-gray-100 pb-2">
                      📊 โครงการ & แกนนำ แยกตามภาค
                    </h3>
                    {barRegion.length>0
                      ? <BarChart data={barRegion} keys={['total','leaders']} colors={['#1B3A8C','#F97316']} labels={['โครงการ','แกนนำ (คน)']}/>
                      : <p className="text-gray-400 text-center py-8 text-sm">ไม่มีข้อมูล</p>}
                  </div>
                  <div className="bg-white rounded-2xl shadow p-4">
                    <h3 className="font-extrabold text-sm text-gray-700 mb-3 border-b border-gray-100 pb-2">
                      📌 โครงการแบ่งตามประเด็น
                    </h3>
                    {pieIssue.length>0
                      ? <PieChart data={pieIssue} size={130}/>
                      : <p className="text-gray-400 text-center py-8 text-sm">ไม่มีข้อมูล</p>}
                  </div>
                </div>

                {/* ── Row 4: Project type table ── */}
                <div className="bg-white rounded-2xl shadow p-4">
                  <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                    <h3 className="font-extrabold text-sm text-gray-700">
                      📋 รายชื่อโครงการ &amp; ประเภทโครงการ
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>
                        <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{background:'#F97316'}}/>
                        ทดลอง (≤60,000)
                      </span>
                      <span>
                        <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{background:'#1B3A8C'}}/>
                        รูปธรรม (100,000)
                      </span>
                      <button onClick={()=>setPage('projects')}
                        className="text-[#1B3A8C] font-semibold hover:underline ml-2">
                        ดูทั้งหมด →
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto" style={{maxHeight:380, overflowY:'auto'}}>
                    <table className="w-full text-xs">
                      <thead className="sticky top-0">
                        <tr style={{background:'#1B3A8C'}}>
                          <th className="text-white px-3 py-2 text-center w-10 rounded-tl-lg">ที่</th>
                          <th className="text-white px-3 py-2 text-left">ชื่อโครงการ</th>
                          <th className="text-white px-3 py-2 text-center w-24 rounded-tr-lg">ประเภทโครงการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectRows.map((p,i)=>(
                          <tr key={i} className={`${i%2===0?'bg-gray-50':'bg-white'} hover:bg-blue-50 transition-colors`}>
                            <td className="px-3 py-1.5 text-center text-gray-500 font-medium">
                              {p.rowNo || p.no}
                            </td>
                            <td className="px-3 py-1.5 font-medium text-gray-800">
                              <div className="truncate max-w-[420px] md:max-w-none" title={p.name}>{p.name}</div>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {p.type !== '-' && (
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-white text-xs font-bold whitespace-nowrap"
                                  style={{background: TYPE_COLOR[p.type] ?? '#94A3B8'}}>
                                  {p.type}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {projectRows.length===0&&(
                          <tr><td colSpan="3" className="text-center py-8 text-gray-400">ไม่พบโครงการ</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {/* summary counts */}
                  <div className="mt-3 flex gap-4 text-xs text-gray-500 pt-2 border-t border-gray-100">
                    <span>รวม <strong className="text-gray-800">{projectRows.length}</strong> โครงการ</span>
                    <span className="text-[#F97316] font-semibold">
                      ทดลอง: {projectRows.filter(p=>p.type==='ทดลอง').length}
                    </span>
                    <span className="text-[#1B3A8C] font-semibold">
                      รูปธรรม: {projectRows.filter(p=>p.type==='รูปธรรม').length}
                    </span>
                  </div>
                </div>

              </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                PROJECTS PAGE
            ══════════════════════════════════════════════════════════ */}
            {page==='projects'&&(
              <div className="bg-white rounded-2xl shadow p-5">
                <h3 className="font-bold text-gray-800 mb-4">📁 รายชื่อโครงการ ({projectRows.length} โครงการ)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#C8102E] text-white">
                        {['ที่','ชื่อโครงการ','ภาค','จังหวัด','ประเด็น','สถานะ','แกนนำ','เป้าหมาย','ความคืบหน้า','พี่เลี้ยง','งบประมาณ'].map(h=>(
                          <th key={h} className="px-2 py-2 text-left whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {projectRows.map((p,i)=>(
                        <tr key={i} className={`${i%2===0?'bg-gray-50':'bg-white'} hover:bg-blue-50 transition-colors`}>
                          <td className="px-2 py-2 text-gray-400 text-center">{p.no}</td>
                          <td className="px-2 py-2 font-medium max-w-xs">
                            <div className="truncate" title={p.name}>{p.name}</div>
                            {p.subReg&&<div className="text-xs text-gray-400">{p.subReg}</div>}
                          </td>
                          <td className="px-2 py-2"><Badge text={p.region} color={REGION_COLORS[p.region]??'#94A3B8'}/></td>
                          <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{p.province}</td>
                          <td className="px-2 py-2 max-w-[120px]"><div className="truncate text-xs" title={p.issue}>{p.issue}</div></td>
                          <td className="px-2 py-2"><Badge text={p.status} color={statusColor(p.status)}/></td>
                          <td className="px-2 py-2 text-center font-bold text-[#F97316]">{p.leaders||'-'}</td>
                          <td className="px-2 py-2 text-center font-bold text-[#1D4ED8]">{p.targetP||'-'}</td>
                          <td className="px-2 py-2">
                            {p.progress>0&&(
                              <div className="flex items-center gap-1">
                                <div className="flex-1 bg-gray-200 rounded h-2">
                                  <div className="h-2 rounded" style={{width:`${Math.min(p.progress,100)}%`,background:'#1B3A8C'}}/>
                                </div>
                                <span className="text-xs font-bold text-gray-600">{p.progress}%</span>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-gray-600 text-xs whitespace-nowrap">{p.mentor}</td>
                          <td className="px-2 py-2 text-right text-xs text-gray-500 whitespace-nowrap">
                            {p.budget?`฿${(p.budget/1000).toLocaleString()}K`:'-'}
                          </td>
                        </tr>
                      ))}
                      {projectRows.length===0&&(
                        <tr><td colSpan="11" className="text-center py-10 text-gray-400">ไม่พบโครงการ</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                MENTORS PAGE
            ══════════════════════════════════════════════════════════ */}
            {page==='mentors'&&(
              <div className="bg-white rounded-2xl shadow p-5">
                <h3 className="font-bold text-gray-800 mb-4">👤 รายชื่อพี่เลี้ยง ({mentorRows.length} คน)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#0F766E] text-white">
                        {['ที่','รายชื่อพี่เลี้ยง','ภาค','จังหวัดที่รับผิดชอบ','โครงการ','แกนนำรวม'].map(h=>(
                          <th key={h} className="px-3 py-2 text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mentorRows.map((m,i)=>(
                        <tr key={i} className={i%2===0?'bg-gray-50':'bg-white'}>
                          <td className="px-3 py-2 text-gray-400 text-center">{m.no}</td>
                          <td className="px-3 py-2 font-semibold text-gray-800">{m.name}</td>
                          <td className="px-3 py-2"><Badge text={m.region} color={REGION_COLORS[m.region]??'#94A3B8'}/></td>
                          <td className="px-3 py-2 text-gray-600 text-xs">{m.provinces}</td>
                          <td className="px-3 py-2 text-center font-bold text-[#1B3A8C]">{m.count}</td>
                          <td className="px-3 py-2 text-center font-bold text-[#F97316]">{m.leaders||'-'}</td>
                        </tr>
                      ))}
                      {mentorRows.length===0&&(
                        <tr><td colSpan="6" className="text-center py-10 text-gray-400">ไม่พบข้อมูลพี่เลี้ยง</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                MAPPING PAGE
            ══════════════════════════════════════════════════════════ */}
            {page==='mapping'&&(
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {REGIONS.map(reg=>{
                    const cnt = filtered.filter(r=>getRegion(r)===reg).length;
                    return (
                      <div key={reg} className="rounded-xl text-white p-3 shadow text-center"
                        style={{background:REGION_COLORS[reg]}}>
                        <div className="text-2xl font-extrabold">{cnt}</div>
                        <div className="text-xs font-semibold opacity-90 mt-0.5">{reg}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {REGIONS.map(reg=>{
                    const ps = filtered.filter(r=>getRegion(r)===reg);
                    if (!ps.length) return null;
                    return (
                      <div key={reg} className="bg-white rounded-2xl shadow overflow-hidden">
                        <div className="px-4 py-3 text-white font-bold flex justify-between items-center"
                          style={{background:REGION_COLORS[reg]}}>
                          <span>{reg}</span>
                          <span className="bg-white/20 rounded-full px-2 py-0.5 text-sm">{ps.length}</span>
                        </div>
                        <ul className="p-3 space-y-2 max-h-64 overflow-y-auto">
                          {ps.map((r,i)=>{
                            const lat=getLat(r), lon=getLon(r);
                            return (
                              <li key={i} className="text-xs text-gray-700 border-b border-gray-100 pb-1.5 last:border-0">
                                <div className="font-medium truncate" title={getProject(r)}>{i+1}. {getProject(r)}</div>
                                <div className="text-gray-400 mt-0.5 flex items-center gap-2">
                                  <span>📍 {getProvince(r)}</span>
                                  {lat&&lon&&(
                                    <a href={`https://maps.google.com/?q=${lat},${lon}`} target="_blank" rel="noreferrer"
                                      className="text-blue-500 underline">แผนที่</a>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>

                {mapRows.length>0&&(
                  <div className="bg-white rounded-2xl shadow p-5">
                    <h3 className="font-bold text-gray-800 mb-3">📌 โครงการที่มีพิกัด ({mapRows.length} โครงการ)</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-100">
                            {['ชื่อโครงการ','จังหวัด','Latitude','Longitude','Google Maps'].map(h=>(
                              <th key={h} className="px-2 py-1.5 text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {mapRows.map((r,i)=>(
                            <tr key={i} className={i%2===0?'bg-gray-50':'bg-white'}>
                              <td className="px-2 py-1.5 max-w-xs truncate" title={r.name}>{r.name}</td>
                              <td className="px-2 py-1.5">{r.province}</td>
                              <td className="px-2 py-1.5 font-mono">{r.lat}</td>
                              <td className="px-2 py-1.5 font-mono">{r.lon}</td>
                              <td className="px-2 py-1.5">
                                <a href={`https://maps.google.com/?q=${r.lat},${r.lon}`}
                                  target="_blank" rel="noreferrer"
                                  className="bg-[#1B3A8C] text-white rounded px-2 py-0.5 hover:bg-[#0F2663] transition-colors">
                                  📍 ดูแผนที่
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* ══ FOOTER ══ */}
      <footer className="text-center py-3 text-xs text-gray-400 border-t border-gray-200 bg-white">
        รายงาน Movement คนรุ่นใหม่คืนถิ่น · สำนัก 6 สสส. · ข้อมูล ณ วันที่โหลด
      </footer>
    </div>
  );
}
