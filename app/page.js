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
// Sheets format: row1=title, row2=section headers, row3=column headers, row4+=data
function parseCSV(text) {
  // Full CSV tokeniser that handles newlines inside quoted cells
  function tokenise(src) {
    const rows = [];
    let row = [], cur = '', inQ = false, i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '"') {
        if (inQ && src[i+1] === '"') { cur += '"'; i += 2; continue; } // escaped quote
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

  // Row index 2 = actual column headers (row 3 in Sheets)
  const clean = s => s.replace(/^#\s*/, '').replace(/\n/g,' ').trim();
  const headers = rows[2].map(clean);

  // Row index 3+ = data; keep only rows where ภาค is a valid region
  const VALID_REGIONS = ['ภาคเหนือ','ใต้','ภาคอีสาน','กทม.ตะวันออก','กลางตะวันตก'];
  const regionIdx = headers.indexOf('ภาค');

  return rows.slice(3)
    .filter(vals => {
      const name  = (vals[headers.indexOf('ชื่อโครงการ')] ?? '').trim();
      const reg   = regionIdx >= 0 ? (vals[regionIdx] ?? '').trim() : '';
      // ตัดแถวที่ไม่มีชื่อโครงการ หรือภาคไม่ใช่ 5 ภาคหลัก
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
const getCommunity= r => g(r, 'ชุมชน');
const getMentor   = r => g(r, 'รายชื่อพี่เลี้ยง');
const getStatus   = r => g(r, 'สถานะ');
const getIssue    = r => g(r, 'ประเด็น');
const getLat      = r => parseFloat(g(r, 'latitude')) || null;
const getLon      = r => parseFloat(g(r, 'longtitude', 'longitude')) || null;
const getBudget   = r => { const v = g(r, 'งบประมาณ').replace(/[฿,]/g,''); return parseInt(v)||0; };
const getLeaders  = r => parseInt(g(r, 'จำนวนแกนนำโครงการ (คน)', 'จำนวนแกนนำ')) || 0;
const getTargetP  = r => parseInt(g(r, 'จำนวนกลุ่มเป้าหมายเข้าร่วมโครงการ (คน)', 'จำนวนกลุ่มเป้าหมายเข้า\nร่วมโครงการ\n(คน)')) || 0;
const getTargetG  = r => parseInt(g(r, 'จำนวนกลุ่มเป้าหมายเข้าร่วมโครงการ (กี่กลุ่มองค์กร)', 'จำนวนกลุ่มเป้า\nหมายเข้าร่วม\nโครงการ\n(กี่กลุ่มองค์กร)')) || 0;
const getProgress = r => parseInt(g(r, 'ประเมินการดำเนินกิจกรรมของโครงการ (เปอร์เซ็นต์ %)', 'ประเมินการดำเนิน\nกิจกรรมของโครงการ\n(เปอร์เซ็นต์ %)')) || 0;

// ─── SVG PIE ─────────────────────────────────────────────────────────────────
function PieChart({ data }) {
  const total = data.reduce((s,d)=>s+d.value,0); if(!total)return null;
  let a = -90;
  const slices = data.map(d=>{ const p=d.value/total,s=a; a+=p*360; return{...d,p,s,e:a}; });
  const arc=(cx,cy,r,s,e)=>{const to=x=>(x*Math.PI)/180,x1=cx+r*Math.cos(to(s)),y1=cy+r*Math.sin(to(s)),x2=cx+r*Math.cos(to(e)),y2=cy+r*Math.sin(to(e)),lg=e-s>180?1:0;return`M${cx} ${cy}L${x1} ${y1}A${r} ${r} 0 ${lg} 1 ${x2} ${y2}Z`;};
  return(
    <div className="flex flex-col md:flex-row items-center gap-4">
      <svg viewBox="0 0 200 200" width="160" height="160" className="shrink-0">
        {slices.map((s,i)=><path key={i} d={arc(100,100,90,s.s,s.e)} fill={REGION_COLORS[s.label]??ISSUE_COLORS[i%ISSUE_COLORS.length]} stroke="#fff" strokeWidth="2"/>)}
      </svg>
      <div className="flex flex-col gap-1.5 text-sm w-full">
        {slices.map((s,i)=>(
          <div key={i} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{background:REGION_COLORS[s.label]??ISSUE_COLORS[i%ISSUE_COLORS.length]}}/>
            <span className="text-gray-700 font-medium truncate flex-1">{s.label}</span>
            <span className="font-bold text-gray-900 ml-2">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SVG BAR ──────────────────────────────────────────────────────────────────
function BarChart({ data, keys, colors, labels }) {
  const maxVal = Math.max(...data.flatMap(d=>keys.map(k=>d[k]??0)),1);
  const H=180, BW=36, GAP=10, GG=30;
  const svgW=data.length*(BW*keys.length+GAP*(keys.length-1)+GG)+GG;
  return(
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${H+56}`} width="100%" style={{minWidth:260,maxHeight:260}}>
        {data.map((d,gi)=>{ const x=gi*(BW*keys.length+GAP*(keys.length-1)+GG)+GG; return(
          <g key={gi}>
            {keys.map((k,ki)=>{ const h=(d[k]??0)/maxVal*H; return(
              <g key={ki}>
                <rect x={x+ki*(BW+GAP)} y={H-h} width={BW} height={h} fill={colors[ki]} rx="3"/>
                {d[k]>0&&<text x={x+ki*(BW+GAP)+BW/2} y={H-h-4} textAnchor="middle" fontSize="11" fill="#475569">{d[k]}</text>}
              </g>
            );})}
            <text x={x+(BW*keys.length+GAP*(keys.length-1))/2} y={H+16} textAnchor="middle" fontSize="10" fill="#64748B">{d.label}</text>
          </g>
        );})}
        {keys.map((k,i)=><g key={i}>
          <rect x={GG+i*90} y={H+28} width={12} height={12} fill={colors[i]} rx="2"/>
          <text x={GG+i*90+16} y={H+39} fontSize="11" fill="#475569">{labels[i]}</text>
        </g>)}
      </svg>
    </div>
  );
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────
function KPICard({label,value,color,icon,sub}){
  return(
    <div className="rounded-2xl p-4 text-white shadow-lg flex flex-col gap-1 relative overflow-hidden" style={{background:color}}>
      <div className="absolute -top-3 -right-3 text-5xl opacity-20">{icon}</div>
      <div className="text-2xl mb-0.5">{icon}</div>
      <div className="text-3xl font-extrabold">{typeof value==='number'?value.toLocaleString():value}</div>
      <div className="text-sm font-medium opacity-90">{label}</div>
      {sub&&<div className="text-xs opacity-70 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
function Badge({text,color}){
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-white whitespace-nowrap" style={{background:color}}>{text||'-'}</span>;
}

// ─── PAGES ───────────────────────────────────────────────────────────────────
const PAGES=[
  {id:'overview', label:'ภาพรวม',       icon:'📊'},
  {id:'projects', label:'รายชื่อโครงการ', icon:'📁'},
  {id:'mentors',  label:'พี่เลี้ยง',     icon:'👤'},
  {id:'mapping',  label:'Mapping',       icon:'🗺️'},
];

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
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

  // FETCH
  useEffect(()=>{
    fetch(CSV_URL)
      .then(r=>{ if(!r.ok)throw new Error('Network error'); return r.text(); })
      .then(t=>{ const d=parseCSV(t); setRows(d); setLoading(false); })
      .catch(()=>{ setError('ไม่สามารถโหลดข้อมูลได้ — ตรวจสอบสิทธิ์การแชร์ Google Sheets'); setLoading(false); });
  },[]);

  // FILTER
  const allProvinces = useMemo(()=>[...new Set(rows.map(getProvince).filter(Boolean))].sort(),[rows]);
  const allIssues    = useMemo(()=>[...new Set(rows.map(getIssue).filter(Boolean))].sort(),[rows]);

  const filtered = useMemo(()=>{
    return rows.filter(r=>{
      if(region!=='ทั้งหมด' && getRegion(r)!==region) return false;
      if(province!=='ทั้งหมด' && getProvince(r)!==province) return false;
      if(issue!=='ทั้งหมด' && getIssue(r)!==issue) return false;
      if(search && !getProject(r).toLowerCase().includes(search.toLowerCase()) &&
                   !getMentor(r).toLowerCase().includes(search.toLowerCase()) &&
                   !getProvince(r).toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  },[rows,region,province,issue,search]);

  // KPIs
  const totalBudget  = filtered.reduce((s,r)=>s+getBudget(r),0);
  const totalLeaders = filtered.reduce((s,r)=>s+getLeaders(r),0);
  const totalTargetP = filtered.reduce((s,r)=>s+getTargetP(r),0);
  const totalTargetG = filtered.reduce((s,r)=>s+getTargetG(r),0);
  const avgProgress  = filtered.length ? Math.round(filtered.reduce((s,r)=>s+getProgress(r),0)/filtered.length) : 0;
  const mentorSet    = [...new Set(filtered.map(getMentor).filter(Boolean))];

  // CHARTS
  const pieRegion = REGIONS.map(reg=>({label:reg, value:filtered.filter(r=>getRegion(r)===reg).length})).filter(d=>d.value>0);
  const pieIssue  = allIssues.slice(0,6).map(iss=>({label:iss, value:filtered.filter(r=>getIssue(r)===iss).length})).filter(d=>d.value>0);

  const barRegion = REGIONS.map(reg=>{
    const rs=filtered.filter(r=>getRegion(r)===reg);
    return{label:reg.replace('กทม.ตะวันออก','กทม.ตอ.').replace('กลางตะวันตก','กลาง ตต.'), total:rs.length, leaders:rs.reduce((s,r)=>s+getLeaders(r),0)};
  }).filter(d=>d.total>0);

  // Tables
  const projectRows = filtered.map((r,i)=>({
    no:i+1, id:g(r,'เลขที่ข้อเสนอ'), name:getProject(r), region:getRegion(r),
    subReg:getSubReg(r), province:getProvince(r), issue:getIssue(r), status:getStatus(r),
    budget:getBudget(r), leaders:getLeaders(r), targetP:getTargetP(r), targetG:getTargetG(r),
    progress:getProgress(r), mentor:getMentor(r), lat:getLat(r), lon:getLon(r),
  }));

  const mentorRows = mentorSet.map((m,i)=>{
    const ps=filtered.filter(r=>getMentor(r)===m);
    return{ no:i+1, name:m, region:getRegion(ps[0]||{}), count:ps.length,
      provinces:[...new Set(ps.map(getProvince))].join(', '),
      leaders:ps.reduce((s,r)=>s+getLeaders(r),0) };
  });

  const mapRows = projectRows.filter(r=>r.lat&&r.lon);

  // STATUS COLORS
  const statusColor=(s)=>s&&s.includes('กำลัง')?'#2563EB':s&&s.includes('เสร็จ')?'#16A34A':'#9CA3AF';

  return(
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* ══ HEADER ══ */}
      <header className="bg-gradient-to-r from-[#1B3A8C] via-[#0F2663] to-[#C8102E] text-white shadow-2xl">
        <div className="max-w-screen-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            {/* logos */}
            <div className="flex items-center gap-2 shrink-0">
              {['logo-codi.jpg','logo-sss.png','logo-sanuk6.png'].map((f,i)=>(
                <div key={i} className="bg-white rounded-xl p-1 shadow-lg">
                  <Image src={`/images/${f}`} alt="" width={44} height={44} className="rounded-lg object-contain"/>
                </div>
              ))}
            </div>
            {/* title */}
            <div className="flex-1 text-center min-w-0">
              <h1 className="text-lg md:text-2xl font-extrabold drop-shadow-lg leading-tight truncate">
                คนรุ่นใหม่คืนถิ่น MOVEMENT คนรุ่นใหม่3
              </h1>
              <p className="text-xs md:text-sm opacity-80">รายงานสรุปผลการดำเนินงาน · สำนัก 6 สสส.</p>
            </div>
            {/* characters */}
            <div className="hidden lg:flex items-end gap-1 shrink-0">
              {[1,2,3,4].map(n=>(
                <Image key={n} src={`/images/char${n}.png`} alt="" width={50} height={58}
                  className="object-contain drop-shadow-xl"
                  style={{animation:`float${n%2===0?'2':''} ${3.5+n*0.5}s ease-in-out infinite`}}/>
              ))}
            </div>
          </div>

          {/* NAV + FILTERS */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="hidden md:flex gap-1.5">
              {PAGES.map(p=>(
                <button key={p.id} onClick={()=>setPage(p.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all
                    ${page===p.id?'bg-white text-[#1B3A8C] shadow-md scale-105':'bg-white/20 hover:bg-white/30'}`}>
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
            <div className="flex-1 flex flex-wrap gap-2 md:justify-end">
              {/* Region filter */}
              <select value={region} onChange={e=>{setRegion(e.target.value);setProvince('ทั้งหมด');}}
                className="bg-white/20 border border-white/30 text-white rounded-full px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-white/40">
                <option value="ทั้งหมด" className="text-gray-900">🌏 ทุกภาค</option>
                {REGIONS.map(r=><option key={r} value={r} className="text-gray-900">{r}</option>)}
              </select>
              {/* Province filter */}
              <select value={province} onChange={e=>setProvince(e.target.value)}
                className="bg-white/20 border border-white/30 text-white rounded-full px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-white/40">
                <option value="ทั้งหมด" className="text-gray-900">📍 ทุกจังหวัด</option>
                {allProvinces.map(p=><option key={p} value={p} className="text-gray-900">{p}</option>)}
              </select>
              {/* Issue filter */}
              <select value={issue} onChange={e=>setIssue(e.target.value)}
                className="bg-white/20 border border-white/30 text-white rounded-full px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-white/40">
                <option value="ทั้งหมด" className="text-gray-900">📌 ทุกประเด็น</option>
                {allIssues.map(i=><option key={i} value={i} className="text-gray-900">{i}</option>)}
              </select>
              {/* Search */}
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ค้นหา..."
                className="bg-white/20 border border-white/30 text-white placeholder-white/60 rounded-full px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-white/40 w-32 md:w-40"/>
            </div>
            <button className="md:hidden bg-white/20 rounded-full px-3 py-1.5 text-xs" onClick={()=>setMenuOpen(!menuOpen)}>☰</button>
          </div>

          {menuOpen&&(
            <div className="md:hidden mt-2 flex flex-col gap-1 pb-2">
              {PAGES.map(p=>(
                <button key={p.id} onClick={()=>{setPage(p.id);setMenuOpen(false)}}
                  className={`text-left px-4 py-2 rounded-lg text-sm font-semibold ${page===p.id?'bg-white text-[#1B3A8C]':'bg-white/20'}`}>
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ══ MAIN ══ */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-5 space-y-5">

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
            {/* ── OVERVIEW ── */}
            {page==='overview'&&(
              <>
                {/* KPI row */}
                <section>
                  <h2 className="text-base font-bold text-gray-700 mb-3">
                    📊 ภาพรวมโครงการ
                    {region!=='ทั้งหมด'&&<span className="text-[#1B3A8C] ml-2">— {region}</span>}
                    {province!=='ทั้งหมด'&&<span className="text-[#C8102E] ml-2">— {province}</span>}
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <KPICard label="โครงการทั้งหมด"    value={filtered.length}  color="#D97706" icon="📁"/>
                    <KPICard label="แกนนำคนรุ่นใหม่"   value={totalLeaders}     color="#F97316" icon="🌱"/>
                    <KPICard label="พี่เลี้ยง"          value={mentorSet.length} color="#0F766E" icon="👤"/>
                    <KPICard label="กลุ่มเป้าหมาย (คน)" value={totalTargetP}    color="#1D4ED8" icon="👥"/>
                    <KPICard label="กลุ่มเป้าหมาย (กลุ่ม)" value={totalTargetG} color="#7C3AED" icon="🏘️"/>
                    <KPICard label="งบประมาณรวม"        value={`฿${(totalBudget/1000000).toFixed(1)}M`} color="#BE185D" icon="💰"
                      sub={`เฉลี่ย ฿${filtered.length?Math.round(totalBudget/filtered.length/1000).toLocaleString():0}K/โครงการ`}/>
                  </div>
                </section>

                {/* Progress bar */}
                {avgProgress>0&&(
                  <div className="bg-white rounded-2xl shadow p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-700">⏱️ ความคืบหน้าเฉลี่ยโครงการ</span>
                      <span className="text-lg font-extrabold text-[#1B3A8C]">{avgProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div className="h-4 rounded-full transition-all" style={{width:`${avgProgress}%`,background:'linear-gradient(90deg,#1B3A8C,#C8102E)'}}/>
                    </div>
                  </div>
                )}

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Pie: Region */}
                  <div className="bg-white rounded-2xl shadow p-5">
                    <h3 className="font-bold text-gray-800 mb-4">🥧 จำนวนโครงการแบ่งตามภาค</h3>
                    {pieRegion.length>0?<PieChart data={pieRegion}/>:<p className="text-gray-400 text-center py-8">ไม่มีข้อมูล</p>}
                  </div>
                  {/* Pie: Issue */}
                  <div className="bg-white rounded-2xl shadow p-5">
                    <h3 className="font-bold text-gray-800 mb-4">📌 จำนวนโครงการแบ่งตามประเด็น</h3>
                    {pieIssue.length>0?<PieChart data={pieIssue}/>:<p className="text-gray-400 text-center py-8">ไม่มีข้อมูล</p>}
                  </div>
                </div>

                {/* Bar */}
                <div className="bg-white rounded-2xl shadow p-5">
                  <h3 className="font-bold text-gray-800 mb-4">📊 โครงการและแกนนำ แยกตามภาค</h3>
                  {barRegion.length>0?
                    <BarChart data={barRegion} keys={['total','leaders']} colors={['#1B3A8C','#F97316']} labels={['โครงการ','แกนนำ (คน)']}/>
                    :<p className="text-gray-400 text-center py-8">ไม่มีข้อมูล</p>}
                </div>

                {/* Province summary */}
                <div className="bg-white rounded-2xl shadow p-5">
                  <h3 className="font-bold text-gray-800 mb-4">📍 สรุปตามจังหวัด</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#1B3A8C] text-white">
                          {['จังหวัด','ภาค','โครงการ','แกนนำ (คน)','งบประมาณ'].map(h=><th key={h} className="px-3 py-2 text-left">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {[...new Set(filtered.map(getProvince))].filter(Boolean).sort().map((prov,i)=>{
                          const ps=filtered.filter(r=>getProvince(r)===prov);
                          const reg=getRegion(ps[0]||{});
                          return(
                            <tr key={i} className={i%2===0?'bg-gray-50':'bg-white'}>
                              <td className="px-3 py-2 font-medium">{prov}</td>
                              <td className="px-3 py-2"><Badge text={reg} color={REGION_COLORS[reg]??'#94A3B8'}/></td>
                              <td className="px-3 py-2 font-bold text-[#1B3A8C]">{ps.length}</td>
                              <td className="px-3 py-2 font-bold text-[#F97316]">{ps.reduce((s,r)=>s+getLeaders(r),0)}</td>
                              <td className="px-3 py-2 text-gray-600">฿{(ps.reduce((s,r)=>s+getBudget(r),0)/1000).toLocaleString()}K</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ── PROJECTS PAGE ── */}
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
                          <td className="px-2 py-2 text-right text-xs text-gray-500 whitespace-nowrap">{p.budget?`฿${(p.budget/1000).toLocaleString()}K`:'-'}</td>
                        </tr>
                      ))}
                      {projectRows.length===0&&<tr><td colSpan="11" className="text-center py-10 text-gray-400">ไม่พบโครงการ</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── MENTORS PAGE ── */}
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
                      {mentorRows.length===0&&<tr><td colSpan="6" className="text-center py-10 text-gray-400">ไม่พบข้อมูลพี่เลี้ยง</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── MAPPING PAGE ── */}
            {page==='mapping'&&(
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {REGIONS.map(reg=>{
                    const cnt=filtered.filter(r=>getRegion(r)===reg).length;
                    return(
                      <div key={reg} className="rounded-xl text-white p-3 shadow text-center" style={{background:REGION_COLORS[reg]}}>
                        <div className="text-2xl font-extrabold">{cnt}</div>
                        <div className="text-sm font-medium opacity-90">{reg}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Cards by region */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {REGIONS.map(reg=>{
                    const ps=filtered.filter(r=>getRegion(r)===reg);
                    if(!ps.length)return null;
                    return(
                      <div key={reg} className="bg-white rounded-2xl shadow overflow-hidden">
                        <div className="px-4 py-3 text-white font-bold flex justify-between items-center" style={{background:REGION_COLORS[reg]}}>
                          <span>{reg}</span><span className="bg-white/20 rounded-full px-2 py-0.5 text-sm">{ps.length}</span>
                        </div>
                        <ul className="p-3 space-y-2 max-h-64 overflow-y-auto">
                          {ps.map((r,i)=>{
                            const lat=getLat(r), lon=getLon(r);
                            return(
                              <li key={i} className="text-xs text-gray-700 border-b border-gray-100 pb-1.5 last:border-0">
                                <div className="font-medium truncate" title={getProject(r)}>{i+1}. {getProject(r)}</div>
                                <div className="text-gray-400 mt-0.5 flex items-center gap-2">
                                  <span>📍 {getProvince(r)} — {getDistrict(r)}</span>
                                  {lat&&lon&&<a href={`https://maps.google.com/?q=${lat},${lon}`} target="_blank" rel="noreferrer" className="text-blue-500 underline">แผนที่</a>}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>

                {/* Location table */}
                {mapRows.length>0&&(
                  <div className="bg-white rounded-2xl shadow p-5">
                    <h3 className="font-bold text-gray-800 mb-3">📌 โครงการที่มีพิกัด ({mapRows.length} โครงการ)</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-gray-100">
                          {['ชื่อโครงการ','จังหวัด','อำเภอ','Latitude','Longitude','Google Maps'].map(h=><th key={h} className="px-2 py-1.5 text-left">{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {mapRows.map((r,i)=>(
                            <tr key={i} className={i%2===0?'bg-gray-50':'bg-white'}>
                              <td className="px-2 py-1.5 max-w-xs truncate" title={r.name}>{r.name}</td>
                              <td className="px-2 py-1.5">{r.province}</td>
                              <td className="px-2 py-1.5">{projectRows[i]?.district||'-'}</td>
                              <td className="px-2 py-1.5 font-mono">{r.lat}</td>
                              <td className="px-2 py-1.5 font-mono">{r.lon}</td>
                              <td className="px-2 py-1.5">
                                <a href={`https://maps.google.com/?q=${r.lat},${r.lon}`} target="_blank" rel="noreferrer"
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
      <footer className="bg-[#1B3A8C] text-white py-3 text-center text-xs opacity-90">
        © 2024 สถาบันพัฒนาองค์กรชุมชน (CODI) · สำนักงานกองทุนสนับสนุนการสร้างเสริมสุขภาพ (สสส.) · Movement คนรุ่นใหม่คืนถิ่น
      </footer>
    </div>
  );
}
