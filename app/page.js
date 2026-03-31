'use client';
import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';

const SHEET_ID  = '1uFaWzUV8J8HxCDk6rSiUlqAmhiyt9JT3b1yeonWQNK0';
const SHEET_GID = '1566885801';
const CSV_URL   = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

const REGION_COLORS = {
  'ภาคเหนือ':      '#EF4444',
  'ใต้':           '#3B82F6',
  'ภาคอีสาน':     '#F97316',
  'กทม.ตะวันออก': '#84CC16',
  'กลางตะวันตก':  '#EAB308',
};
const ISSUE_COLORS = ['#6366F1','#EC4899','#14B8A6','#F59E0B','#84CC16','#06B6D4','#8B5CF6'];
const REGIONS = Object.keys(REGION_COLORS);

function parseCSV(text) {
  function tokenise(src) {
    const rows=[]; let row=[],cur='',inQ=false,i=0;
    while(i<src.length){
      const ch=src[i];
      if(ch==='"'){if(inQ&&src[i+1]==='"'){cur+='"';i+=2;continue;}inQ=!inQ;i++;continue;}
      if(ch===','&&!inQ){row.push(cur);cur='';i++;continue;}
      if((ch==='\n'||ch==='\r')&&!inQ){if(ch==='\r'&&src[i+1]==='\n')i++;row.push(cur);rows.push(row);row=[];cur='';i++;continue;}
      cur+=ch;i++;
    }
    if(cur||row.length){row.push(cur);rows.push(row);}
    return rows;
  }
  const rows=tokenise(text);
  if(rows.length<4)return[];
  const clean=s=>s.replace(/^#\s*/,'').replace(/\n/g,' ').trim();
  const headers=rows[2].map(clean);
  const VALID=['ภาคเหนือ','ใต้','ภาคอีสาน','กทม.ตะวันออก','กลางตะวันตก'];
  const ri=headers.indexOf('ภาค');
  return rows.slice(3).filter(vals=>{
    const name=(vals[headers.indexOf('ชื่อโครงการ')]??'').trim();
    const reg=ri>=0?(vals[ri]??'').trim():'';
    return name&&VALID.includes(reg);
  }).map(vals=>{
    const obj={};
    headers.forEach((h,i)=>{if(h)obj[h]=(vals[i]??'').trim();});
    return obj;
  });
}

const g=(r,...keys)=>{for(const k of keys)if(r[k]!==undefined&&r[k]!=='')return r[k];return'';};
const getProject  =r=>g(r,'ชื่อโครงการ');
const getRegion   =r=>g(r,'ภาค');
const getSubReg   =r=>g(r,'กลุ่มจังหวัด');
const getProvince =r=>g(r,'จังหวัด');
const getDistrict =r=>g(r,'อำเภอ');
const getMentor   =r=>g(r,'รายชื่อพี่เลี้ยง');
const getMentorNick=r=>g(r,'ชื่อเล่น')||getMentor(r);
const getStatus   =r=>g(r,'สถานะ');
const getIssue    =r=>g(r,'ประเด็น');
const getLat      =r=>parseFloat(g(r,'latitude'))||null;
const getLon      =r=>parseFloat(g(r,'longtitude','longitude'))||null;
const getBudget   =r=>{const v=g(r,'งบประมาณ').replace(/[฿,]/g,'');return parseInt(v)||0;};
const getLeaders  =r=>parseInt(g(r,'จำนวนแกนนำโครงการ (คน)','จำนวนแกนนำ'))||0;
const getTargetP  =r=>parseInt(g(r,'จำนวนกลุ่มเป้าหมายเข้าร่วมโครงการ (คน)','จำนวนกลุ่มเป้าหมายเข้า\nร่วมโครงการ\n(คน)'))||0;
const getTargetG  =r=>parseInt(g(r,'จำนวนกลุ่มเป้าหมายเข้าร่วมโครงการ (กี่กลุ่มองค์กร)','จำนวนกลุ่มเป้า\nหมายเข้าร่วม\nโครงการ\n(กี่กลุ่มองค์กร)'))||0;
const getProgress =r=>parseInt(g(r,'ประเมินการดำเนินกิจกรรมของโครงการ (เปอร์เซ็นต์ %)','ประเมินการดำเนิน\nกิจกรรมของโครงการ\n(เปอร์เซ็นต์ %)'))||0;
const getRowNo    =r=>g(r,'ที่');
const getProjectType=budget=>budget>0&&budget<=70000?'ทดลอง':budget>70000?'รูปธรรม':'-';
const TYPE_COLOR={'ทดลอง':'#F97316','รูปธรรม':'#1B3A8C'};

// PIE CHART — interactive: hover tooltip + click to filter
function PieChart({data,size=200,onSliceClick,activeRegion}){
  const[hovered,setHovered]=useState(null);
  const total=data.reduce((s,d)=>s+d.value,0);
  if(!total)return null;
  let a=-90;
  const slices=data.map(d=>{const p=d.value/total,s=a;a+=p*360;return{...d,p,s,e:a};});
  const cx=100,cy=100,r=92;
  const rad=x=>x*Math.PI/180;
  const pt=(angle,radius)=>[cx+radius*Math.cos(rad(angle)),cy+radius*Math.sin(rad(angle))];

  // arc path — rOuter can vary for "explode" effect
  const arc=(s,e,rOut)=>{
    const[x1,y1]=pt(s,rOut),[x2,y2]=pt(e,rOut);
    const lg=e-s>180?1:0;
    return`M${cx} ${cy}L${x1} ${y1}A${rOut} ${rOut} 0 ${lg} 1 ${x2} ${y2}Z`;
  };
  const cen=(s,e,rOut)=>pt((s+e)/2,rOut*0.62);

  const hoveredSlice=hovered!==null?slices[hovered]:null;

  return(
    <div className="relative flex flex-col items-center">
      {/* Tooltip */}
      <div className={`mb-1 h-7 flex items-center justify-center transition-all duration-150 ${hoveredSlice?'opacity-100':'opacity-0'}`}>
        {hoveredSlice&&(
          <div className="px-3 py-1 rounded-full text-white text-xs font-bold shadow-lg whitespace-nowrap"
            style={{background:REGION_COLORS[hoveredSlice.label]??'#333'}}>
            {hoveredSlice.label} · {hoveredSlice.value} โครงการ ({Math.round(hoveredSlice.p*100)}%)
          </div>
        )}
      </div>

      <svg viewBox="0 0 200 200" width={size} height={size} style={{overflow:'visible'}}>
        {slices.map((sl,i)=>{
          const color=REGION_COLORS[sl.label]??ISSUE_COLORS[i%ISSUE_COLORS.length];
          const isActive=activeRegion&&sl.label===activeRegion;
          const isHov=hovered===i;
          const rOut=isActive||isHov?98:92; // explode outward on hover/active
          const[tx,ty]=cen(sl.s,sl.e,rOut);
          return(
            <g key={i} style={{cursor:'pointer',transition:'all 0.15s'}}
              onMouseEnter={()=>setHovered(i)}
              onMouseLeave={()=>setHovered(null)}
              onClick={()=>onSliceClick&&onSliceClick(sl.label)}>
              <path d={arc(sl.s,sl.e,rOut)} fill={color}
                stroke={isActive?'#fff':'#fff'}
                strokeWidth={isActive?3:2}
                opacity={activeRegion&&!isActive?0.55:1}
                style={{filter:isHov?'brightness(1.15)':'none'}}/>
              {sl.p>0.035&&(
                <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
                  fontSize={isActive||isHov?15:14} fontWeight="800" fill="white"
                  style={{pointerEvents:'none'}}>
                  {sl.value}
                </text>
              )}
            </g>
          );
        })}
        {/* active ring indicator */}
        {activeRegion&&slices.find(s=>s.label===activeRegion)&&(()=>{
          const sl=slices.find(s=>s.label===activeRegion);
          const color=REGION_COLORS[sl.label]??'#333';
          return<circle cx={cx} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth="1.5"/>;
        })()}
      </svg>

      {/* "คลิกเพื่อกรอง" hint */}
      <p className="text-xs text-gray-400 mt-1 text-center">
        {activeRegion?<span className="text-[#1B3A8C] font-semibold cursor-pointer" onClick={()=>onSliceClick&&onSliceClick(activeRegion)}>✕ ยกเลิกกรอง {activeRegion}</span>:'คลิกชิ้นเพื่อกรองข้อมูล'}
      </p>
    </div>
  );
}

// BAR CHART: ทดลอง vs รูปธรรม
function TypeBarChart({data}){
  if(!data.length)return null;
  const max=Math.max(...data.flatMap(d=>[d.ทดลอง??0,d.รูปธรรม??0]),1);
  const H=130,BW=22,GAP=4,GG=18;
  const svgW=data.length*(BW*2+GAP+GG)+GG*2;
  return(
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${H+50}`} width="100%" style={{minWidth:180}}>
        {data.map((d,gi)=>{
          const x=gi*(BW*2+GAP+GG)+GG;
          const hT=(d.ทดลอง??0)/max*H,hR=(d.รูปธรรม??0)/max*H;
          return(
            <g key={gi}>
              <rect x={x} y={H-hT} width={BW} height={hT} fill="#555555" rx="2"/>
              <rect x={x+BW+GAP} y={H-hR} width={BW} height={hR} fill="#B91C1C" rx="2"/>
              {d.ทดลอง>0&&<text x={x+BW/2} y={H-hT-4} textAnchor="middle" fontSize="10" fill="#333" fontWeight="700">{d.ทดลอง}</text>}
              {d.รูปธรรม>0&&<text x={x+BW+GAP+BW/2} y={H-hR-4} textAnchor="middle" fontSize="10" fill="#333" fontWeight="700">{d.รูปธรรม}</text>}
              <text x={x+BW+GAP/2} y={H+14} textAnchor="middle" fontSize="9" fill="#666">{d.label}</text>
            </g>
          );
        })}
        <rect x={GG} y={H+24} width={12} height={12} fill="#555555" rx="1"/>
        <text x={GG+15} y={H+34} fontSize="10" fill="#444">ทดลอง</text>
        <rect x={GG+62} y={H+24} width={12} height={12} fill="#B91C1C" rx="1"/>
        <text x={GG+77} y={H+34} fontSize="10" fill="#444">รูปธรรม</text>
      </svg>
    </div>
  );
}

// KPI CARD: label above + big number in colored box
function KPICard({label,value,bg,large=true}){
  return(
    <div>
      <div className="text-xs font-bold text-gray-700 mb-1 leading-tight">{label}</div>
      <div className={`font-extrabold text-white text-center rounded px-2 ${large?'text-4xl py-3':'text-3xl py-2'}`} style={{background:bg}}>
        {typeof value==='number'?value.toLocaleString():value}
      </div>
    </div>
  );
}

function Badge({text,color}){
  return<span className="px-2 py-0.5 rounded-full text-xs font-semibold text-white whitespace-nowrap" style={{background:color}}>{text||'-'}</span>;
}

const PAGES=[
  {id:'overview',label:'ภาพรวม',icon:'📊'},
  {id:'projects',label:'รายชื่อโครงการ',icon:'📁'},
  {id:'mentors', label:'พี่เลี้ยง',icon:'👤'},
  {id:'mapping', label:'Mapping',icon:'🗺️'},
];
const MENTOR_PER_PAGE=10;

export default function Dashboard(){
  const[rows,setRows]=useState([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[region,setRegion]=useState('ทั้งหมด');
  const[province,setProvince]=useState('ทั้งหมด');
  const[issue,setIssue]=useState('ทั้งหมด');
  const[page,setPage]=useState('overview');
  const[menuOpen,setMenuOpen]=useState(false);
  const[search,setSearch]=useState('');
  const[mentorPage,setMentorPage]=useState(0);

  useEffect(()=>{
    fetch(CSV_URL)
      .then(r=>{if(!r.ok)throw new Error();return r.text();})
      .then(t=>{setRows(parseCSV(t));setLoading(false);})
      .catch(()=>{setError('ไม่สามารถโหลดข้อมูลได้ — ตรวจสอบสิทธิ์การแชร์ Google Sheets');setLoading(false);});
  },[]);

  const allProvinces=useMemo(()=>[...new Set(rows.map(getProvince).filter(Boolean))].sort(),[rows]);
  const allIssues=useMemo(()=>[...new Set(rows.map(getIssue).filter(Boolean))].sort(),[rows]);

  const filtered=useMemo(()=>rows.filter(r=>{
    if(region!=='ทั้งหมด'&&getRegion(r)!==region)return false;
    if(province!=='ทั้งหมด'&&getProvince(r)!==province)return false;
    if(issue!=='ทั้งหมด'&&getIssue(r)!==issue)return false;
    if(search){const q=search.toLowerCase();if(!getProject(r).toLowerCase().includes(q)&&!getMentor(r).toLowerCase().includes(q)&&!getProvince(r).toLowerCase().includes(q))return false;}
    return true;
  }),[rows,region,province,issue,search]);

  const totalLeaders=filtered.reduce((s,r)=>s+getLeaders(r),0);
  const totalTargetP=filtered.reduce((s,r)=>s+getTargetP(r),0);
  const totalTargetG=filtered.reduce((s,r)=>s+getTargetG(r),0);
  const mentorSet=[...new Set(filtered.map(getMentor).filter(Boolean))];

  const pieRegion=REGIONS.map(reg=>({label:reg,value:filtered.filter(r=>getRegion(r)===reg).length})).filter(d=>d.value>0);

  const barData=REGIONS.map(reg=>{
    const rs=filtered.filter(r=>getRegion(r)===reg);
    return{
      label:reg.replace('ภาคเหนือ','เหนือ').replace('ภาคอีสาน','อีสาน').replace('กทม.ตะวันออก','กทม.').replace('กลางตะวันตก','กลาง'),
      ทดลอง:rs.filter(r=>getBudget(r)>0&&getBudget(r)<=70000).length,
      รูปธรรม:rs.filter(r=>getBudget(r)>70000).length,
    };
  }).filter(d=>d.ทดลอง>0||d.รูปธรรม>0);

  const projectRows=filtered.map((r,i)=>({
    no:i+1,rowNo:getRowNo(r),name:getProject(r),region:getRegion(r),
    subReg:getSubReg(r),province:getProvince(r),issue:getIssue(r),status:getStatus(r),
    budget:getBudget(r),leaders:getLeaders(r),targetP:getTargetP(r),targetG:getTargetG(r),
    progress:getProgress(r),mentor:getMentor(r),mentorNick:getMentorNick(r),
    lat:getLat(r),lon:getLon(r),type:getProjectType(getBudget(r)),
  }));

  const mentorRows=mentorSet.map((m,i)=>{
    const ps=filtered.filter(r=>getMentor(r)===m);
    const nick=ps.length>0?getMentorNick(ps[0]):m;
    return{no:i+1,name:m,nick,region:getRegion(ps[0]||{}),count:ps.length,
      provinces:[...new Set(ps.map(getProvince))].join(', '),
      leaders:ps.reduce((s,r)=>s+getLeaders(r),0)};
  });

  const mapRows=projectRows.filter(r=>r.lat&&r.lon);
  const statusColor=s=>s&&s.includes('กำลัง')?'#2563EB':s&&s.includes('เสร็จ')?'#16A34A':'#9CA3AF';

  const mentorPageTotal=Math.max(1,Math.ceil(mentorRows.length/MENTOR_PER_PAGE));
  const safeMP=Math.min(mentorPage,mentorPageTotal-1);
  const pagedMentors=mentorRows.slice(safeMP*MENTOR_PER_PAGE,(safeMP+1)*MENTOR_PER_PAGE);
  const mentorFrom=mentorRows.length>0?safeMP*MENTOR_PER_PAGE+1:0;
  const mentorTo=Math.min((safeMP+1)*MENTOR_PER_PAGE,mentorRows.length);

  const changeRegion=val=>{setRegion(val);setProvince('ทั้งหมด');setMentorPage(0);};

  return(
    <div className="min-h-screen flex flex-col bg-white">

      {/* HEADER */}
      <header style={{background:'linear-gradient(90deg,#BF8B00 0%,#FFD700 30%,#FFE44D 50%,#FFD700 70%,#BF8B00 100%)'}}>
        <div className="max-w-screen-2xl mx-auto px-3 py-2 flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-1.5 invisible pointer-events-none">
            {[1,2,3].map(n=><div key={n} style={{width:50,height:50}}/>)}
          </div>
          <h1 className="flex-1 text-center text-lg sm:text-2xl lg:text-3xl font-extrabold text-[#2C1000] tracking-wide leading-tight drop-shadow-sm">
            คนรุ่นใหม่คืนถิ่น MOVEMENTคนรุ่นใหม่3
          </h1>
          <div className="flex items-center gap-1.5 shrink-0">
            {['logo-codi.jpg','logo-sss.png','logo-sanuk6.png'].map((f,i)=>(
              <div key={i} className="bg-white rounded-full p-0.5 shadow-md">
                <Image src={`/images/${f}`} alt="" width={50} height={50} className="rounded-full object-contain"/>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* NAV */}
      <nav className="bg-[#1B3A8C] text-white shadow-md sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto px-3 flex items-center min-h-[40px] gap-1">
          <div className="hidden md:flex gap-1 py-1 shrink-0">
            {PAGES.map(p=>(
              <button key={p.id} onClick={()=>setPage(p.id)}
                className={`px-3 py-1 rounded text-xs font-bold whitespace-nowrap transition-all ${page===p.id?'bg-white text-[#1B3A8C] shadow':'hover:bg-white/20'}`}>
                {p.icon} {p.label}
              </button>
            ))}
          </div>
          <div className="flex-1 flex flex-wrap gap-1.5 justify-end py-1 overflow-hidden">
            <select value={region} onChange={e=>changeRegion(e.target.value)}
              className="bg-white/10 border border-white/25 text-white rounded px-2 py-0.5 text-xs focus:outline-none">
              <option value="ทั้งหมด" className="text-black">🌏 ทุกภาค</option>
              {REGIONS.map(r=><option key={r} value={r} className="text-black">{r}</option>)}
            </select>
            <select value={province} onChange={e=>setProvince(e.target.value)}
              className="bg-white/10 border border-white/25 text-white rounded px-2 py-0.5 text-xs focus:outline-none">
              <option value="ทั้งหมด" className="text-black">📍 ทุกจังหวัด</option>
              {allProvinces.map(p=><option key={p} value={p} className="text-black">{p}</option>)}
            </select>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ค้นหา..."
              className="bg-white/10 border border-white/25 text-white placeholder-white/50 rounded px-2 py-0.5 text-xs focus:outline-none w-24 md:w-32"/>
          </div>
          <button className="md:hidden px-2 py-1 text-sm shrink-0" onClick={()=>setMenuOpen(!menuOpen)}>☰</button>
        </div>
        {menuOpen&&(
          <div className="md:hidden px-3 pb-2 flex flex-col gap-1 border-t border-white/20">
            {PAGES.map(p=>(
              <button key={p.id} onClick={()=>{setPage(p.id);setMenuOpen(false);}}
                className={`text-left px-3 py-2 rounded text-sm font-bold ${page===p.id?'bg-white text-[#1B3A8C]':'hover:bg-white/20'}`}>
                {p.icon} {p.label}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* MAIN */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-3 py-4">

        {loading&&(
          <div className="flex justify-center items-center h-64">
            <div className="text-center"><div className="animate-spin text-5xl mb-3">⏳</div><p className="text-gray-500">กำลังโหลดข้อมูล...</p></div>
          </div>
        )}
        {error&&!loading&&(
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-6 text-center">
            <p className="text-amber-700 font-semibold">⚠️ {error}</p>
            <p className="text-sm text-gray-500 mt-2">กรุณาแชร์ Google Sheets เป็น "ทุกคนที่มีลิ้งค์" (ผู้ดู) แล้วรีเฟรช</p>
          </div>
        )}

        {!loading&&!error&&(
          <>
            {/* ═══ OVERVIEW ═══ */}
            {page==='overview'&&(
              <div className="space-y-4">

                {/* 3-COLUMN */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,2.6fr)_minmax(0,3.4fr)] gap-4 items-start">

                  {/* LEFT: โครงการ + pie */}
                  <div className="space-y-3">
                    <KPICard label="จำนวนโครงการ" value={filtered.length} bg="#8B5E3C"/>
                    <div className="flex justify-center">
                      <Image src="/images/char1.png" alt="" width={90} height={108} className="object-contain drop-shadow-md"/>
                    </div>
                    <p className="text-sm font-bold text-gray-700">แบ่งภาค</p>
                    <div className="flex justify-center">
                      <PieChart
                        data={pieRegion}
                        size={200}
                        activeRegion={region!=='ทั้งหมด'?region:null}
                        onSliceClick={label=>changeRegion(region===label?'ทั้งหมด':label)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                      {REGIONS.filter(reg=>pieRegion.some(p=>p.label===reg)).map(reg=>(
                        <div key={reg} className="flex items-center gap-1.5 text-xs text-gray-700">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{background:REGION_COLORS[reg]}}/>
                          <span>{reg}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* MIDDLE: แกนนำ + targets + bar */}
                  <div className="space-y-3">
                    <KPICard label="จำนวนแกนนำคนรุ่นใหม่" value={totalLeaders} bg="#D45D00"/>
                    <div className="flex justify-center">
                      <Image src="/images/char2.png" alt="" width={90} height={108} className="object-contain drop-shadow-md"/>
                    </div>
                    <KPICard label="กลุ่มเป้าหมาย (คน)" value={totalTargetP} bg="#15803D"/>
                    <KPICard label="กลุ่มเป้าหมาย (กลุ่มองค์กร...)" value={totalTargetG} bg="#16A34A" large={false}/>
                    <div className="pt-1">
                      <TypeBarChart data={barData}/>
                    </div>
                  </div>

                  {/* RIGHT: พี่เลี้ยง + filter + table */}
                  <div className="space-y-3">
                    <KPICard label="จำนวนพี่เลี้ยง" value={mentorRows.length} bg="#4D5C1A"/>
                    <div className="flex items-stretch border border-gray-300 rounded overflow-hidden">
                      <span className="px-3 py-1.5 bg-gray-50 border-r border-gray-300 text-xs font-bold text-gray-600 flex items-center">ภาค</span>
                      <select value={region} onChange={e=>changeRegion(e.target.value)}
                        className="flex-1 px-2 py-1.5 text-xs text-gray-700 bg-white focus:outline-none">
                        <option value="ทั้งหมด">ทั้งหมด</option>
                        {REGIONS.map(r=><option key={r} value={r}>{r}</option>)}
                      </select>
                      <span className="px-2 text-gray-400 flex items-center pointer-events-none text-xs">▾</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800 mb-1.5">รายชื่อพี่เลี้ยง</p>
                      <div className="border border-gray-200 rounded overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-100 border-b border-gray-200">
                              <th className="px-2 py-2 text-left text-gray-500 font-semibold w-8"></th>
                              <th className="px-2 py-2 text-left text-gray-700 font-bold">พี่เลี้ยง <span className="text-gray-400 font-normal">↑</span></th>
                              <th className="px-2 py-2 text-left text-gray-700 font-bold">ภาค <span className="text-gray-400 font-normal">↑</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedMentors.map((m,i)=>(
                              <tr key={i} className={`border-b border-gray-100 last:border-0 ${i%2===0?'bg-white':'bg-gray-50'}`}>
                                <td className="px-2 py-1.5 text-gray-400 text-right">{mentorFrom+i}.</td>
                                <td className="px-2 py-1.5 font-semibold text-gray-800" title={m.name}>{m.nick}</td>
                                <td className="px-2 py-1.5 text-gray-600">{m.region}</td>
                              </tr>
                            ))}
                            {pagedMentors.length===0&&(
                              <tr><td colSpan="3" className="text-center py-6 text-gray-400">ไม่มีข้อมูล</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center justify-end gap-2 mt-1.5 text-xs text-gray-500">
                        <span className="font-medium">{mentorFrom} - {mentorTo} / {mentorRows.length}</span>
                        <button onClick={()=>setMentorPage(p=>Math.max(0,p-1))} disabled={safeMP===0}
                          className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center disabled:opacity-30 hover:bg-gray-100">‹</button>
                        <button onClick={()=>setMentorPage(p=>Math.min(mentorPageTotal-1,p+1))} disabled={safeMP>=mentorPageTotal-1}
                          className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center disabled:opacity-30 hover:bg-gray-100">›</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* BOTTOM: project table */}
                <div className="border border-gray-200 rounded overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-100 border-b border-gray-200">
                          <th className="px-3 py-2 text-left text-gray-600 font-semibold w-14">ที่</th>
                          <th className="px-3 py-2 text-left text-gray-600 font-semibold">โครงการ</th>
                          <th className="px-3 py-2 text-left text-gray-600 font-semibold w-28 whitespace-nowrap">ประเภทโ...</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectRows.map((p,i)=>(
                          <tr key={i} className={`border-b border-gray-100 last:border-0 ${i%2===0?'bg-white':'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                            <td className="px-3 py-2 text-gray-500">{p.rowNo||p.no}</td>
                            <td className="px-3 py-2 text-gray-800">{p.name}</td>
                            <td className="px-3 py-2 font-semibold" style={{color:TYPE_COLOR[p.type]??'#94A3B8'}}>{p.type}</td>
                          </tr>
                        ))}
                        {projectRows.length===0&&<tr><td colSpan="3" className="text-center py-10 text-gray-400">ไม่พบโครงการ</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ PROJECTS ═══ */}
            {page==='projects'&&(
              <div className="bg-white rounded-2xl shadow p-4">
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
                          <td className="px-2 py-2 font-medium max-w-xs"><div className="truncate" title={p.name}>{p.name}</div>{p.subReg&&<div className="text-xs text-gray-400">{p.subReg}</div>}</td>
                          <td className="px-2 py-2"><Badge text={p.region} color={REGION_COLORS[p.region]??'#94A3B8'}/></td>
                          <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{p.province}</td>
                          <td className="px-2 py-2 max-w-[120px]"><div className="truncate text-xs" title={p.issue}>{p.issue}</div></td>
                          <td className="px-2 py-2"><Badge text={p.status} color={statusColor(p.status)}/></td>
                          <td className="px-2 py-2 text-center font-bold text-[#F97316]">{p.leaders||'-'}</td>
                          <td className="px-2 py-2 text-center font-bold text-[#1D4ED8]">{p.targetP||'-'}</td>
                          <td className="px-2 py-2">{p.progress>0&&(<div className="flex items-center gap-1"><div className="flex-1 bg-gray-200 rounded h-2"><div className="h-2 rounded" style={{width:`${Math.min(p.progress,100)}%`,background:'#1B3A8C'}}/></div><span className="text-xs font-bold text-gray-600">{p.progress}%</span></div>)}</td>
                          <td className="px-2 py-2 text-gray-600 text-xs whitespace-nowrap" title={p.mentor}>{p.mentorNick}</td>
                          <td className="px-2 py-2 text-right text-xs text-gray-500 whitespace-nowrap">{p.budget?`฿${(p.budget/1000).toLocaleString()}K`:'-'}</td>
                        </tr>
                      ))}
                      {projectRows.length===0&&<tr><td colSpan="11" className="text-center py-10 text-gray-400">ไม่พบโครงการ</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ═══ MENTORS ═══ */}
            {page==='mentors'&&(
              <div className="bg-white rounded-2xl shadow p-4">
                <h3 className="font-bold text-gray-800 mb-4">👤 รายชื่อพี่เลี้ยง ({mentorRows.length} คน)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#0F766E] text-white">
                        {['ที่','ชื่อเล่น','ชื่อ-สกุล','ภาค','จังหวัดที่รับผิดชอบ','โครงการ','แกนนำรวม'].map(h=>(
                          <th key={h} className="px-3 py-2 text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mentorRows.map((m,i)=>(
                        <tr key={i} className={i%2===0?'bg-gray-50':'bg-white'}>
                          <td className="px-3 py-2 text-gray-400 text-center">{m.no}</td>
                          <td className="px-3 py-2 font-extrabold text-[#1B3A8C]">{m.nick}</td>
                          <td className="px-3 py-2 font-medium text-gray-800">{m.name}</td>
                          <td className="px-3 py-2"><Badge text={m.region} color={REGION_COLORS[m.region]??'#94A3B8'}/></td>
                          <td className="px-3 py-2 text-gray-600 text-xs">{m.provinces}</td>
                          <td className="px-3 py-2 text-center font-bold text-[#1B3A8C]">{m.count}</td>
                          <td className="px-3 py-2 text-center font-bold text-[#F97316]">{m.leaders||'-'}</td>
                        </tr>
                      ))}
                      {mentorRows.length===0&&<tr><td colSpan="7" className="text-center py-10 text-gray-400">ไม่พบข้อมูลพี่เลี้ยง</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ═══ MAPPING ═══ */}
            {page==='mapping'&&(
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {REGIONS.map(reg=>{
                    const cnt=filtered.filter(r=>getRegion(r)===reg).length;
                    return(<div key={reg} className="rounded-xl text-white p-3 shadow text-center" style={{background:REGION_COLORS[reg]}}><div className="text-2xl font-extrabold">{cnt}</div><div className="text-xs font-semibold opacity-90 mt-0.5">{reg}</div></div>);
                  })}
                </div>
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
                            const lat=getLat(r),lon=getLon(r);
                            return(<li key={i} className="text-xs text-gray-700 border-b border-gray-100 pb-1.5 last:border-0">
                              <div className="font-medium truncate" title={getProject(r)}>{i+1}. {getProject(r)}</div>
                              <div className="text-gray-400 mt-0.5 flex items-center gap-2">
                                <span>📍 {getProvince(r)}</span>
                                {lat&&lon&&<a href={`https://maps.google.com/?q=${lat},${lon}`} target="_blank" rel="noreferrer" className="text-blue-500 underline">แผนที่</a>}
                              </div>
                            </li>);
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
                {mapRows.length>0&&(
                  <div className="bg-white rounded-2xl shadow p-4">
                    <h3 className="font-bold text-gray-800 mb-3">📌 โครงการที่มีพิกัด ({mapRows.length} โครงการ)</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-gray-100">{['ชื่อโครงการ','จังหวัด','Latitude','Longitude','Google Maps'].map(h=><th key={h} className="px-2 py-1.5 text-left">{h}</th>)}</tr></thead>
                        <tbody>
                          {mapRows.map((r,i)=>(
                            <tr key={i} className={i%2===0?'bg-gray-50':'bg-white'}>
                              <td className="px-2 py-1.5 max-w-xs truncate" title={r.name}>{r.name}</td>
                              <td className="px-2 py-1.5">{r.province}</td>
                              <td className="px-2 py-1.5 font-mono">{r.lat}</td>
                              <td className="px-2 py-1.5 font-mono">{r.lon}</td>
                              <td className="px-2 py-1.5"><a href={`https://maps.google.com/?q=${r.lat},${r.lon}`} target="_blank" rel="noreferrer" className="bg-[#1B3A8C] text-white rounded px-2 py-0.5 hover:bg-[#0F2663] transition-colors">📍 ดูแผนที่</a></td>
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

      <footer className="text-center py-3 text-xs text-gray-400 border-t border-gray-100">
        รายงาน Movement คนรุ่นใหม่คืนถิ่น · สำนัก 6 สสส. · ข้อมูล ณ วันที่โหลด
      </footer>
    </div>
  );
}
