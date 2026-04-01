'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
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
// column AX — header จริง = "เป็นโครงการที่น่าสนใจ", ค่า: "พัฒนาอีกนิด" / "น่าสนใจ ทำสื่อ" / "ว่าง"
const getAssess   =r=>g(r,'เป็นโครงการที่น่าสนใจ');
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

// BAR CHART: ทดลอง vs รูปธรรม — fixed 5-region layout + clickable
const BAR_LABELS={'ภาคเหนือ':'เหนือ','ใต้':'ใต้','ภาคอีสาน':'อีสาน','กทม.ตะวันออก':'กทม.','กลางตะวันตก':'กลาง'};
function TypeBarChart({data,globalMax=1,onBarClick,activeRegion}){
  const[hovReg,setHovReg]=useState(null);
  const H=130,BW=22,GAP=4,GG=18;
  const totalW=REGIONS.length*(BW*2+GAP+GG)+GG*2;
  const max=Math.max(globalMax,1);
  return(
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${totalW} ${H+50}`} width={totalW} style={{maxWidth:'100%',display:'block'}}>
        {REGIONS.map((reg,gi)=>{
          const lbl=BAR_LABELS[reg]||reg;
          const d=data.find(d=>d.label===lbl)||{label:lbl,ทดลอง:0,รูปธรรม:0};
          const hasData=data.some(d=>d.label===lbl&&(d.ทดลอง>0||d.รูปธรรม>0));
          const isActive=activeRegion===reg;
          const isHov=hovReg===reg&&hasData;
          const x=gi*(BW*2+GAP+GG)+GG;
          const hT=(d.ทดลอง??0)/max*H;
          const hR=(d.รูปธรรม??0)/max*H;
          return(
            <g key={gi}
              style={{opacity:hasData?1:0.18,transition:'opacity 0.5s ease',cursor:hasData?'pointer':'default'}}
              onMouseEnter={()=>hasData&&setHovReg(reg)}
              onMouseLeave={()=>setHovReg(null)}
              onClick={()=>hasData&&onBarClick&&onBarClick(reg)}>
              {/* hit-area transparent */}
              <rect x={x-3} y={0} width={BW*2+GAP+6} height={H+16} fill="transparent"/>
              {/* hover/active bg highlight */}
              {(isActive||isHov)&&hasData&&(
                <rect x={x-3} y={2} width={BW*2+GAP+6} height={H-2} fill={isActive?'#1B3A8C':'#DBEAFE'} rx="4" opacity={isActive?0.12:0.6}/>
              )}
              <rect x={x} y={H-hT} width={BW} height={Math.max(hT,0)} fill={isHov?'#333':'#555555'} rx="2"/>
              <rect x={x+BW+GAP} y={H-hR} width={BW} height={Math.max(hR,0)} fill={isHov?'#991111':'#B91C1C'} rx="2"/>
              {d.ทดลอง>0&&<text x={x+BW/2} y={H-hT-4} textAnchor="middle" fontSize="10" fill={hasData?'#333':'#bbb'} fontWeight="700">{d.ทดลอง}</text>}
              {d.รูปธรรม>0&&<text x={x+BW+GAP+BW/2} y={H-hR-4} textAnchor="middle" fontSize="10" fill={hasData?'#333':'#bbb'} fontWeight="700">{d.รูปธรรม}</text>}
              <text x={x+BW+GAP/2} y={H+13} textAnchor="middle"
                fontSize={isActive?10:9} fontWeight={isActive?'800':'normal'}
                fill={isActive?'#1B3A8C':hasData?'#555':'#bbb'}>{lbl}</text>
              {/* active underline */}
              {isActive&&<rect x={x-1} y={H+17} width={BW*2+GAP+2} height={2} fill="#1B3A8C" rx="1"/>}
            </g>
          );
        })}
        <rect x={GG} y={H+26} width={12} height={12} fill="#555555" rx="1"/>
        <text x={GG+15} y={H+36} fontSize="10" fill="#444">ทดลอง</text>
        <rect x={GG+62} y={H+26} width={12} height={12} fill="#B91C1C" rx="1"/>
        <text x={GG+77} y={H+36} fontSize="10" fill="#444">รูปธรรม</text>
        {/* hint */}
        <text x={totalW/2} y={H+46} textAnchor="middle" fontSize="8" fill="#aaa">คลิกเพื่อกรองภาค</text>
      </svg>
    </div>
  );
}

// สีตามเปอร์เซ็นต์ความก้าวหน้า (แดง→เขียว)
const PROG_COLORS={
  10:'#DC2626',20:'#EF4444',30:'#F97316',40:'#FB923C',
  50:'#EAB308',60:'#84CC16',70:'#22C55E',80:'#16A34A',90:'#15803D',100:'#166534'
};
function progColor(p){
  const keys=Object.keys(PROG_COLORS).map(Number).sort((a,b)=>a-b);
  const k=keys.find(k=>k>=p)||keys[keys.length-1];
  return PROG_COLORS[k]||'#94A3B8';
}

// PROGRESS HISTOGRAM: bar chart grouped by progress % — clickable
function ProgressHistogram({data,onBarClick,activeBar}){
  const[hovBar,setHovBar]=useState(null);
  if(!data.length)return<p className="text-gray-400 text-sm py-8 text-center">ไม่มีข้อมูลความก้าวหน้า</p>;
  const max=Math.max(...data.map(d=>d.count),1);
  const H=160,BW=44,GAP=16,PL=42;
  const totalW=PL+data.length*(BW+GAP)+GAP;
  const yTicks=[0,10,20,30].filter(v=>v<=Math.ceil(max/10)*10);
  const hasActive=activeBar!==null&&activeBar!==undefined;
  return(
    <div style={{maxWidth:totalW,width:'100%',margin:'0 auto'}}>
      <svg viewBox={`0 0 ${totalW} ${H+55}`} width="100%" style={{display:'block'}}>
        {/* Y gridlines + labels */}
        {yTicks.map(v=>{
          const y=H-(v/Math.ceil(max/10)*10)*H;
          return(<g key={v}>
            <line x1={PL-4} y1={y} x2={totalW} y2={y} stroke="#e5e7eb" strokeWidth="1"/>
            <text x={PL-7} y={y+4} textAnchor="end" fontSize="10" fill="#9ca3af">{v}</text>
          </g>);
        })}
        {/* Y-axis label */}
        <text transform="rotate(-90)" x={-(H/2)} y={11} textAnchor="middle" fontSize="9" fill="#6b7280">จำนวนโครงการ</text>
        {/* Bars */}
        {data.map((d,i)=>{
          const x=PL+i*(BW+GAP)+GAP;
          const h=Math.max((d.count/max)*H,2);
          const col=progColor(d.value);
          const isActive=activeBar===d.value;
          const isHov=hovBar===i;
          const dimmed=hasActive&&!isActive;
          return(
            <g key={i} style={{cursor:'pointer',transition:'opacity 0.2s'}}
              onMouseEnter={()=>setHovBar(i)} onMouseLeave={()=>setHovBar(null)}
              onClick={()=>onBarClick&&onBarClick(isActive?null:d.value)}
              opacity={dimmed?0.3:1}>
              {/* hover/active bg */}
              {(isActive||isHov)&&<rect x={x-4} y={H-h-8} width={BW+8} height={h+8} fill={isActive?'#1B3A8C':col} rx="5" opacity="0.12"/>}
              <rect x={x} y={H-h} width={BW} height={h} fill={col} rx="3"
                stroke={isActive?'#1B3A8C':'none'} strokeWidth={isActive?2:0}
                style={{filter:isHov&&!isActive?'brightness(1.15)':'none'}}/>
              <text x={x+BW/2} y={H-h-5} textAnchor="middle" fontSize="11" fill={isActive?'#1B3A8C':'#374151'} fontWeight="700">{d.count}</text>
              <text x={x+BW/2} y={H+14} textAnchor="middle" fontSize={isActive?11:10} fontWeight={isActive?'800':'normal'} fill={isActive?'#1B3A8C':'#6b7280'}>{d.value}</text>
              {isActive&&<rect x={x} y={H+17} width={BW} height={2} fill="#1B3A8C" rx="1"/>}
            </g>
          );
        })}
        {/* X-axis label */}
        <text x={PL+data.length*(BW+GAP)/2} y={H+30} textAnchor="middle" fontSize="10" fill="#6b7280">ความก้าวหน้า (%)</text>
        {/* hint */}
        <text x={PL+data.length*(BW+GAP)/2} y={H+46} textAnchor="middle" fontSize="8" fill="#aaa">คลิกเพื่อกรองโครงการ</text>
        {/* Baseline */}
        <line x1={PL-4} y1={H} x2={totalW} y2={H} stroke="#9ca3af" strokeWidth="1.5"/>
      </svg>
    </div>
  );
}

// LEAFLET MAP — โหลด Leaflet จาก CDN ใน useEffect
function LeafletMap({pins,activeRegion}){
  const containerRef=useRef(null);
  const mapRef=useRef(null);
  const layerRef=useRef(null);
  const[ready,setReady]=useState(false);

  // init map ครั้งเดียว
  useEffect(()=>{
    let alive=true;
    if(!document.getElementById('lfcss')){
      const lnk=document.createElement('link');
      lnk.id='lfcss';lnk.rel='stylesheet';
      lnk.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(lnk);
    }
    const loadL=()=>new Promise((res,rej)=>{
      if(window.L){res();return;}
      const s=document.createElement('script');
      s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload=res;s.onerror=rej;
      document.head.appendChild(s);
    });
    loadL().then(()=>{
      if(!alive||!containerRef.current||mapRef.current)return;
      const L=window.L;
      const map=L.map(containerRef.current,{center:[15.0,101.5],zoom:6,zoomControl:true});
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        attribution:'© <a href="https://openstreetmap.org">OpenStreetMap</a>',maxZoom:19
      }).addTo(map);
      layerRef.current=L.layerGroup().addTo(map);
      mapRef.current=map;
      setReady(true);
    });
    return()=>{alive=false;if(mapRef.current){mapRef.current.remove();mapRef.current=null;layerRef.current=null;}};
  },[]);

  // อัปเดต markers เมื่อ pins/activeRegion เปลี่ยน
  useEffect(()=>{
    if(!ready||!layerRef.current)return;
    const L=window.L;
    layerRef.current.clearLayers();
    pins.forEach(pin=>{
      const color=REGION_COLORS[pin.region]||'#888';
      const isAct=activeRegion&&pin.region===activeRegion;
      const dim=activeRegion&&!isAct;
      const sz=isAct?14:10;
      const icon=L.divIcon({
        className:'',
        html:`<div style="width:${sz}px;height:${sz}px;background:${color};border:2.5px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35);opacity:${dim?0.35:1};transition:all .2s"></div>`,
        iconSize:[sz,sz],iconAnchor:[sz/2,sz/2],
      });
      const mk=L.marker([pin.lat,pin.lon],{icon}).addTo(layerRef.current);
      const gUrl=`https://www.google.com/maps?q=${pin.lat},${pin.lon}`;
      const aUrl=`maps://maps.apple.com/?q=${pin.lat},${pin.lon}`;
      mk.bindPopup(`<div style="min-width:200px;font-family:sans-serif;line-height:1.5">
        <div style="font-weight:700;font-size:13px;color:#1B3A8C;margin-bottom:5px">${pin.name}</div>
        <div style="font-size:12px;color:#555">📍 ${pin.province}</div>
        <div style="font-size:12px;color:${color};font-weight:600">🗺️ ${pin.region}</div>
        ${pin.mentor?`<div style="font-size:12px;color:#555">👤 ${pin.mentor}</div>`:''}
        ${pin.progress?`<div style="margin-top:6px"><div style="background:#e5e7eb;border-radius:4px;height:6px;overflow:hidden"><div style="background:${color};height:6px;width:${pin.progress}%"></div></div><div style="font-size:10px;color:#888;margin-top:2px">ความก้าวหน้า ${pin.progress}%</div></div>`:''}
        <div style="margin-top:10px;display:flex;gap:6px">
          <a href="${gUrl}" target="_blank" rel="noreferrer"
            style="flex:1;display:flex;align-items:center;justify-content:center;gap:4px;padding:6px 8px;background:#1B3A8C;color:#fff;border-radius:8px;font-size:11px;font-weight:600;text-decoration:none">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            Google Maps
          </a>
          <a href="${aUrl}" target="_blank" rel="noreferrer"
            style="flex:1;display:flex;align-items:center;justify-content:center;gap:4px;padding:6px 8px;background:#555;color:#fff;border-radius:8px;font-size:11px;font-weight:600;text-decoration:none">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            Apple Maps
          </a>
        </div>
      </div>`,{maxWidth:280});
    });
  },[ready,pins,activeRegion]);

  return(
    <div style={{position:'relative'}}>
      <div ref={containerRef} style={{height:'min(45vh,480px)',minHeight:280,width:'100%'}}/>
      {!ready&&(
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'#f8fafc'}}>
          <div style={{textAlign:'center'}}><div style={{fontSize:32,marginBottom:8}}>🗺️</div><div style={{color:'#94a3b8',fontSize:14}}>กำลังโหลดแผนที่...</div></div>
        </div>
      )}
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
  {id:'overview', label:'ภาพรวม',       icon:'📊'},
  {id:'assess',   label:'ประเมินโครงการ',icon:'📈'},
  {id:'mapping',  label:'mapping',       icon:'🗺️'},
  {id:'network',  label:'ภาคีคนรุ่นใหม่',icon:'🤝', soon:true},
  {id:'quality',  label:'สรุปเชิงคุณภาพ',icon:'📝', soon:true},
];
const MENTOR_PER_PAGE=10;

export default function Dashboard(){
  const[rows,setRows]=useState([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[region,setRegion]=useState('ทั้งหมด');
  const[province,setProvince]=useState('ทั้งหมด');
  const[issue,setIssue]=useState('ทั้งหมด');
  const[fadeKey,setFadeKey]=useState(0);
  const[page,setPage]=useState('overview');
  const[menuOpen,setMenuOpen]=useState(false);
  const[search,setSearch]=useState('');
  const[mentorPage,setMentorPage]=useState(0);
  const[mentorFilter,setMentorFilter]=useState('');
  const[expandedIdx,setExpandedIdx]=useState(null);
  const[assessFilter,setAssessFilter]=useState(''); // 'dev' | 'int' | ''
  const[progressFilter,setProgressFilter]=useState(null); // number | null
  const[expandedAssessIdx,setExpandedAssessIdx]=useState(null);

  useEffect(()=>{
    fetch(CSV_URL)
      .then(r=>{if(!r.ok)throw new Error();return r.text();})
      .then(t=>{setRows(parseCSV(t));setLoading(false);})
      .catch(()=>{setError('ไม่สามารถโหลดข้อมูลได้ — ตรวจสอบสิทธิ์การแชร์ Google Sheets');setLoading(false);});
  },[]);

  const allProvinces=useMemo(()=>[...new Set(rows.map(getProvince).filter(Boolean))].sort(),[rows]);
  const allIssues=useMemo(()=>[...new Set(rows.map(getIssue).filter(Boolean))].sort(),[rows]);

  // filteredBase: กรองทุกอย่างยกเว้น mentorFilter — ใช้สร้างตารางพี่เลี้ยง
  const filteredBase=useMemo(()=>rows.filter(r=>{
    if(region!=='ทั้งหมด'&&getRegion(r)!==region)return false;
    if(province!=='ทั้งหมด'&&getProvince(r)!==province)return false;
    if(issue!=='ทั้งหมด'&&getIssue(r)!==issue)return false;
    if(search){const q=search.toLowerCase();if(!getProject(r).toLowerCase().includes(q)&&!getMentor(r).toLowerCase().includes(q)&&!getProvince(r).toLowerCase().includes(q))return false;}
    return true;
  }),[rows,region,province,issue,search]);

  // assessTableBase: กรองทุกอย่างยกเว้น region — ใช้สำหรับตาราง assess (แสดงทุกภาคเสมอ)
  const assessTableBase=useMemo(()=>rows.filter(r=>{
    if(province!=='ทั้งหมด'&&getProvince(r)!==province)return false;
    if(issue!=='ทั้งหมด'&&getIssue(r)!==issue)return false;
    if(search){const q=search.toLowerCase();if(!getProject(r).toLowerCase().includes(q)&&!getMentor(r).toLowerCase().includes(q)&&!getProvince(r).toLowerCase().includes(q))return false;}
    return true;
  }),[rows,province,issue,search]);

  // filtered: กรองรวม mentorFilter + assessFilter — ใช้ KPI, charts, project table
  const filtered=useMemo(()=>{
    let f=filteredBase;
    if(mentorFilter)f=f.filter(r=>getMentor(r)===mentorFilter);
    if(assessFilter==='dev')f=f.filter(r=>getAssess(r).includes('พัฒนา'));
    if(assessFilter==='int')f=f.filter(r=>getAssess(r).includes('น่าสนใจ')||getAssess(r).includes('เป็นโครงการ'));
    return f;
  },[filteredBase,mentorFilter,assessFilter]);

  const totalLeaders=filtered.reduce((s,r)=>s+getLeaders(r),0);
  const totalTargetP=filtered.reduce((s,r)=>s+getTargetP(r),0);
  const totalTargetG=filtered.reduce((s,r)=>s+getTargetG(r),0);
  // mentorSet ใช้ filteredBase (ไม่กรองพี่เลี้ยง) — ให้ตารางพี่เลี้ยงแสดงครบเสมอ
  const mentorSet=[...new Set(filteredBase.map(getMentor).filter(Boolean))];

  // pie chart ใช้ทุกแถว (ไม่ filter) เพื่อให้วงกลมแสดงครบทุกภาคเสมอ
  // การ filter ทำหน้าที่ highlight ชิ้นที่ active เท่านั้น
  const pieRegion=REGIONS.map(reg=>({label:reg,value:rows.filter(r=>getRegion(r)===reg).length})).filter(d=>d.value>0);

  // barData: ส่งทุก region ให้ TypeBarChart ตัดสินใจ dim เอง
  const _BL={'ภาคเหนือ':'เหนือ','ใต้':'ใต้','ภาคอีสาน':'อีสาน','กทม.ตะวันออก':'กทม.','กลางตะวันตก':'กลาง'};
  const barData=REGIONS.map(reg=>{
    const rs=filtered.filter(r=>getRegion(r)===reg);
    return{
      label:_BL[reg]||reg,
      ทดลอง:rs.filter(r=>getBudget(r)>0&&getBudget(r)<=70000).length,
      รูปธรรม:rs.filter(r=>getBudget(r)>70000).length,
    };
  });
  // globalBarMax: ใช้ ALL rows เพื่อให้สเกลแท่งสม่ำเสมอเสมอ
  const globalBarMax=useMemo(()=>Math.max(...REGIONS.map(reg=>{
    const rs=rows.filter(r=>getRegion(r)===reg);
    return Math.max(rs.filter(r=>getBudget(r)>0&&getBudget(r)<=70000).length,rs.filter(r=>getBudget(r)>70000).length);
  }),1),[rows]);

  const projectRows=filtered.map((r,i)=>({
    no:i+1,rowNo:getRowNo(r),name:getProject(r),region:getRegion(r),
    subReg:getSubReg(r),province:getProvince(r),issue:getIssue(r),status:getStatus(r),
    budget:getBudget(r),leaders:getLeaders(r),targetP:getTargetP(r),targetG:getTargetG(r),
    progress:getProgress(r),mentor:getMentor(r),mentorNick:getMentorNick(r),
    lat:getLat(r),lon:getLon(r),type:getProjectType(getBudget(r)),
  }));

  const mentorRows=mentorSet.map((m,i)=>{
    const ps=filteredBase.filter(r=>getMentor(r)===m); // ใช้ filteredBase เพื่อแสดงครบ
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

  const changeRegion=val=>{setFadeKey(k=>k+1);setRegion(val);setProvince('ทั้งหมด');setMentorFilter('');setAssessFilter('');setMentorPage(0);setExpandedIdx(null);};
  const changeMentor=name=>{setMentorFilter(prev=>prev===name?'':name);setAssessFilter('');setMentorPage(0);setExpandedIdx(null);};

  // คลิก cell ในตาราง assess: filter ภาค + ประเภท พร้อมกัน
  const changeAssess=(reg,type)=>{
    setFadeKey(k=>k+1);
    if(region===reg&&assessFilter===type){setRegion('ทั้งหมด');setAssessFilter('');}
    else{setRegion(reg);setAssessFilter(type);}
    setProvince('ทั้งหมด');setMentorFilter('');setMentorPage(0);setExpandedIdx(null);
  };

  return(
    <div className="min-h-screen bg-white overflow-x-hidden">
      <style>{`
        @keyframes krmFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes krmFadeIn2{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .krm-fade{animation-duration:0.45s;animation-timing-function:cubic-bezier(.22,.68,0,1.2);animation-fill-mode:both}
      `}</style>

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

      {/* NAV — sticky top, ใช้ได้ทั้ง mobile + desktop */}
      <nav className="bg-[#1B3A8C] text-white shadow-md sticky top-0 z-[1500]">
        <div className="max-w-screen-2xl mx-auto px-2 overflow-x-auto scrollbar-none"
          style={{scrollbarWidth:'none',msOverflowStyle:'none'}}>
          <div className="flex items-center min-h-[48px] gap-1 w-max min-w-full py-1.5 px-1">
            {PAGES.map(p=>{
              const navClick=()=>{
                if(p.soon)return;
                setPage(p.id);setRegion('ทั้งหมด');setProvince('ทั้งหมด');setMentorFilter('');setAssessFilter('');setSearch('');setExpandedIdx(null);setMentorPage(0);setProgressFilter(null);setExpandedAssessIdx(null);setFadeKey(k=>k+1);
              };
              const isAct=page===p.id;
              return(
                <button key={p.id} onClick={navClick}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold whitespace-nowrap transition-all duration-200 active:scale-95 text-xs
                    ${isAct?'bg-white text-[#1B3A8C] shadow-md':'text-white/75 hover:bg-white/15 hover:text-white'}
                    ${p.soon?'opacity-50 cursor-not-allowed':''}`}>
                  <span className="text-base leading-none">{p.icon}</span>
                  <span>{p.label}</span>
                  {p.soon&&<span className="absolute -top-1.5 -right-1 bg-amber-400 text-[#1B3A8C] text-[8px] font-extrabold px-1.5 py-0.5 rounded-full leading-none">soon</span>}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* MAIN */}
      <main className="max-w-screen-2xl mx-auto w-full px-3 py-4">

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

                {/* 3-COLUMN — fade เมื่อ filter เปลี่ยน */}
                <div className="krm-fade space-y-4" style={{animationName:fadeKey%2===0?'krmFadeIn':'krmFadeIn2'}}>
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
                      <TypeBarChart
                        data={barData}
                        globalMax={globalBarMax}
                        activeRegion={region!=='ทั้งหมด'?region:null}
                        onBarClick={reg=>changeRegion(region===reg?'ทั้งหมด':reg)}
                      />
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
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-sm font-bold text-gray-800">รายชื่อพี่เลี้ยง</p>
                        {mentorFilter&&(
                          <button onClick={()=>changeMentor(mentorFilter)}
                            className="flex items-center gap-1 text-xs font-semibold text-[#1B3A8C] bg-[#1B3A8C]/10 px-2 py-0.5 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors">
                            ✕ {mentorRows.find(m=>m.name===mentorFilter)?.nick||mentorFilter}
                          </button>
                        )}
                      </div>
                      <div className="border border-gray-200 rounded overflow-hidden">
                        {/* sticky header */}
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 z-10">
                            <tr className="bg-gray-100 border-b border-gray-200">
                              <th className="px-2 py-2 text-left text-gray-500 font-semibold w-8"></th>
                              <th className="px-2 py-2 text-left text-gray-700 font-bold">พี่เลี้ยง</th>
                              <th className="px-2 py-2 text-left text-gray-700 font-bold">ภาค</th>
                            </tr>
                          </thead>
                        </table>
                        {/* scrollable body */}
                        <div className="overflow-y-auto" style={{maxHeight:'320px',WebkitOverflowScrolling:'touch'}}>
                          <table className="w-full text-xs">
                            <tbody>
                              {mentorRows.map((m,i)=>{
                                const isActive=mentorFilter===m.name;
                                return(
                                  <tr key={i} onClick={()=>changeMentor(m.name)}
                                    className={`border-b border-gray-100 last:border-0 cursor-pointer transition-all duration-150 active:opacity-70
                                      ${isActive?'bg-[#1B3A8C] text-white':i%2===0?'bg-white hover:bg-blue-50':'bg-gray-50 hover:bg-blue-50'}`}>
                                    <td className={`px-2 py-2.5 text-right ${isActive?'text-blue-200':'text-gray-400'}`}>{i+1}.</td>
                                    <td className={`px-2 py-2.5 font-semibold ${isActive?'text-white':'text-gray-800'}`} title={m.name}>
                                      {isActive&&<span className="mr-1 opacity-80">👤</span>}{m.nick}
                                    </td>
                                    <td className={`px-2 py-2.5 ${isActive?'text-blue-200':'text-gray-600'}`}>{m.region}</td>
                                  </tr>
                                );
                              })}
                              {mentorRows.length===0&&(
                                <tr><td colSpan="3" className="text-center py-6 text-gray-400">ไม่มีข้อมูล</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-xs text-gray-400">
                        <span>{mentorFilter?'':'คลิกชื่อเพื่อกรองข้อมูล'}</span>
                        <span className="font-medium text-gray-500">{mentorRows.length} คน</span>
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
                        {projectRows.flatMap((p,i)=>{
                          const isExp=expandedIdx===i;
                          return[
                            <tr key={`r${i}`}
                              onClick={()=>setExpandedIdx(isExp?null:i)}
                              className={`border-b border-gray-100 cursor-pointer transition-colors
                                ${isExp?'bg-blue-50 border-b-0':i%2===0?'bg-white':'bg-gray-50'} hover:bg-blue-50`}>
                              <td className="px-3 py-2 text-gray-400 w-10">{p.rowNo||p.no}</td>
                              <td className="px-3 py-2 text-gray-800">
                                <div className="flex items-start gap-1.5">
                                  <span className={`mt-0.5 text-xs shrink-0 transition-transform ${isExp?'rotate-90':''} text-gray-300`}>▶</span>
                                  <span>{p.name}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2 font-semibold whitespace-nowrap" style={{color:TYPE_COLOR[p.type]??'#94A3B8'}}>{p.type}</td>
                            </tr>,
                            isExp&&(
                              <tr key={`e${i}`} className="bg-blue-50 border-b border-blue-100">
                                <td className="px-3 py-2 text-gray-300 text-xs text-right align-top">└</td>
                                <td colSpan="2" className="px-3 pb-3 pt-1">
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-gray-700">
                                    <div><span className="text-gray-400">📍 จังหวัด </span><span className="font-medium">{p.province||'-'}</span></div>
                                    <div><span className="text-gray-400">🗺️ ภาค </span><span className="font-medium" style={{color:REGION_COLORS[p.region]??'#555'}}>{p.region||'-'}</span></div>
                                    <div><span className="text-gray-400">👤 พี่เลี้ยง </span><span className="font-semibold text-[#1B3A8C]">{p.mentorNick||'-'}</span></div>
                                    <div><span className="text-gray-400">💰 งบประมาณ </span><span className="font-medium">{p.budget?`฿${p.budget.toLocaleString()}`:'-'}</span></div>
                                    {p.issue&&<div className="col-span-2"><span className="text-gray-400">🏷️ ประเด็น </span>{p.issue}</div>}
                                    {p.status&&<div><span className="text-gray-400">📋 สถานะ </span>{p.status}</div>}
                                    {p.leaders>0&&<div><span className="text-gray-400">👥 แกนนำ </span><span className="font-semibold text-[#F97316]">{p.leaders} คน</span></div>}
                                    {p.targetP>0&&<div><span className="text-gray-400">🎯 กลุ่มเป้าหมาย </span><span className="font-semibold text-[#1D4ED8]">{p.targetP} คน</span></div>}
                                    {p.progress>0&&(
                                      <div className="col-span-2 flex items-center gap-2 mt-0.5">
                                        <span className="text-gray-400">📊 ความคืบหน้า </span>
                                        <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[140px]">
                                          <div className="h-2 rounded-full transition-all" style={{width:`${Math.min(p.progress,100)}%`,background:'#1B3A8C'}}/>
                                        </div>
                                        <span className="font-bold text-[#1B3A8C]">{p.progress}%</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          ].filter(Boolean);
                        })}
                        {projectRows.length===0&&<tr><td colSpan="3" className="text-center py-10 text-gray-400">ไม่พบโครงการ</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
                </div>{/* /krm-fade */}
              </div>
            )}

            {/* ═══ ประเมินโครงการ ═══ */}
            {page==='assess'&&(()=>{
              // ใช้ filtered ทั้งหมดสำหรับ histogram source (ไม่กรอง progress ซ้ำ)
              const allProgRows=filtered.filter(r=>getProgress(r)>0);
              // กรองเพิ่มถ้ามี progressFilter
              const progRows=progressFilter!==null?allProgRows.filter(r=>getProgress(r)===progressFilter):allProgRows;
              // Histogram: group by progress value จาก allProgRows (แสดงครบทุกค่าเสมอ)
              const grp={};
              allProgRows.forEach(r=>{const p=getProgress(r);grp[p]=(grp[p]||0)+1;});
              const histData=Object.entries(grp).map(([v,c])=>({value:parseInt(v),count:c})).sort((a,b)=>a.value-b.value);
              // classify จาก column AX ของชีท (ไม่ใช้ % อีกต่อไป)
              const isDev=r=>{const a=getAssess(r);return a.includes('พัฒนา');};
              const isInt=r=>{const a=getAssess(r);return a.includes('น่าสนใจ')||a.includes('เป็นโครงการ');};
              const maxBar=Math.max(...REGIONS.map(reg=>{
                const rs=assessTableBase.filter(r=>getRegion(r)===reg);
                return Math.max(rs.filter(isDev).length,rs.filter(isInt).length);
              }),1);
              const totalDev=assessTableBase.filter(isDev).length;
              const totalInt=assessTableBase.filter(isInt).length;
              return(
                <div className="space-y-4">
                  <div className="krm-fade space-y-4" style={{animationName:fadeKey%2===0?'krmFadeIn':'krmFadeIn2'}}>
                  {/* TOP ROW — histogram left, breakdown table right — fade on filter change */}
                  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(320px,1.4fr)] xl:grid-cols-[minmax(0,3fr)_minmax(360px,1.4fr)] gap-4 items-stretch">
                    {/* Left: histogram — same height as right card */}
                    <div className="bg-white rounded-xl shadow p-6 flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-gray-800 text-base">ประเมินความก้าวหน้าโครงการ</h3>
                        {progressFilter!==null&&(
                          <button onClick={()=>{setProgressFilter(null);setExpandedAssessIdx(null);}}
                            className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[#1B3A8C]/10 text-[#1B3A8C] hover:bg-red-50 hover:text-red-500 transition-colors whitespace-nowrap">
                            ✕ {progressFilter}%
                          </button>
                        )}
                      </div>
                      <div className="flex-1 flex items-center">
                      <ProgressHistogram data={histData} activeBar={progressFilter}
                        onBarClick={v=>{setProgressFilter(v);setExpandedAssessIdx(null);setFadeKey(k=>k+1);}}/>
                      </div>
                    </div>
                    {/* Right: region breakdown table — คลิกเพื่อ filter */}
                    <div className="bg-white rounded-xl shadow p-6">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-bold text-gray-800 text-base leading-snug">โครงการที่น่าสนใจ/ทำสื่อ/ถอดบทเรียน</h3>
                        {(region!=='ทั้งหมด'||assessFilter)&&(
                          <button onClick={()=>{setFadeKey(k=>k+1);setRegion('ทั้งหมด');setAssessFilter('');}}
                            className="ml-2 shrink-0 flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[#1B3A8C]/10 text-[#1B3A8C] hover:bg-red-50 hover:text-red-500 transition-colors whitespace-nowrap">
                            ✕ {region!=='ทั้งหมด'?region:''}{assessFilter==='dev'?' · พัฒนาอีกนิด':assessFilter==='int'?' · น่าสนใจ ทำสื่อ':''}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mb-4">
                        {!assessFilter&&region==='ทั้งหมด'?'คลิกช่องเพื่อกรองข้อมูล':
                         assessFilter==='dev'?`แสดงเฉพาะ "พัฒนาอีกนิด"${region!=='ทั้งหมด'?' · '+region:''}`:
                         `แสดงเฉพาะ "น่าสนใจ ทำสื่อ"${region!=='ทั้งหมด'?' · '+region:''}`}
                      </p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b-2 border-gray-200">
                            <th className="text-left py-2 font-semibold text-gray-600 pr-4">ภาค</th>
                            <th className="text-left py-2 font-semibold text-gray-600 px-2" colSpan="2">พัฒนาอีกนิด</th>
                            <th className="text-left py-2 font-semibold text-gray-600 px-2 whitespace-nowrap" colSpan="2">น่าสนใจ ทำสื่อ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {REGIONS.map(reg=>{
                            const rs=assessTableBase.filter(r=>getRegion(r)===reg);
                            const dev=rs.filter(isDev).length;
                            const intr=rs.filter(isInt).length;
                            if(!dev&&!intr)return null;
                            const regColor=REGION_COLORS[reg]??'#555';
                            const isDevActive=region===reg&&assessFilter==='dev';
                            const isIntActive=region===reg&&assessFilter==='int';
                            const isRowActive=region===reg&&!assessFilter;
                            // dim แถวที่ไม่ใช่ภาคที่ active (เมื่อมี filter อยู่)
                            const hasFilter=region!=='ทั้งหมด'||assessFilter;
                            const isDimmed=hasFilter&&!isDevActive&&!isIntActive&&!isRowActive;
                            return(
                              <tr key={reg} className={`border-b border-gray-100 transition-all duration-200 ${isRowActive||isDevActive||isIntActive?'bg-gray-50':''}`}
                                style={{
                                  opacity:isDimmed?0.35:1,
                                  ...(isDevActive||isIntActive||isRowActive)?{borderLeft:`3px solid ${regColor}`}:{}
                                }}>
                                {/* ชื่อภาค — คลิก filter แค่ภาค */}
                                <td className="py-2.5 pr-3 cursor-pointer select-none"
                                  onClick={()=>changeRegion(isRowActive?'ทั้งหมด':reg)}>
                                  <div className="flex items-center gap-1.5">
                                    {(isDevActive||isIntActive||isRowActive)&&<span className="w-2 h-2 rounded-full shrink-0" style={{background:regColor}}/>}
                                    <span className="font-semibold whitespace-nowrap hover:underline" style={{color:regColor}}>{reg}</span>
                                  </div>
                                </td>
                                {/* พัฒนาอีกนิด cell — คลิก filter ภาค+dev */}
                                <td colSpan="2" className="py-2 pr-2 min-w-0">
                                  <div onClick={()=>dev>0&&changeAssess(reg,'dev')}
                                    className={`flex items-center gap-1.5 rounded-lg px-2 py-1 transition-all duration-150 overflow-hidden
                                      ${isDevActive?'bg-orange-100 ring-1 ring-orange-300':dev>0?'cursor-pointer hover:bg-orange-50':''}`}>
                                    <span className={`font-bold w-6 shrink-0 text-right text-sm ${isDevActive?'text-orange-600':dev>0?'text-gray-800':'text-gray-300'}`}>{dev||0}</span>
                                    {dev>0&&<div className="h-3.5 rounded transition-all shrink-0" style={{width:`${Math.round((dev/maxBar)*60)}px`,background:isDevActive?'#F97316':'#22D3EE',minWidth:4}}/>}
                                  </div>
                                </td>
                                {/* น่าสนใจ ทำสื่อ cell — คลิก filter ภาค+int */}
                                <td colSpan="2" className="py-2 pr-2 min-w-0">
                                  <div onClick={()=>intr>0&&changeAssess(reg,'int')}
                                    className={`flex items-center gap-1.5 rounded-lg px-2 py-1 transition-all duration-150 overflow-hidden
                                      ${isIntActive?'bg-green-100 ring-1 ring-green-300':intr>0?'cursor-pointer hover:bg-green-50':''}`}>
                                    <span className={`font-bold w-6 shrink-0 text-right text-sm ${isIntActive?'text-green-700':intr>0?'text-gray-800':'text-gray-300'}`}>{intr||0}</span>
                                    {intr>0&&<div className="h-3.5 rounded transition-all shrink-0" style={{width:`${Math.round((intr/maxBar)*60)}px`,background:isIntActive?'#16A34A':'#22D3EE',minWidth:4}}/>}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-200 bg-gray-50">
                            <td className="py-3 pr-4 font-bold text-gray-800">รวมทั้งหมด</td>
                            <td className="py-3 pl-2 font-extrabold text-gray-900 text-base" colSpan="2">{totalDev}</td>
                            <td className="py-3 pl-2 font-extrabold text-gray-900 text-base" colSpan="2">{totalInt}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* BOTTOM: project list */}
                  <div className="bg-white rounded-xl shadow overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="font-bold text-gray-800 text-sm">รายชื่อโครงการ ({progRows.length} โครงการ)</h3>
                      <span className="text-xs text-gray-400">เรียงตามภาค</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200 text-xs">
                            <th className="px-3 py-2 text-left text-gray-500 font-semibold w-12">ที่</th>
                            <th className="px-3 py-2 text-left text-gray-700 font-bold">โครงการ</th>
                            <th className="px-3 py-2 text-left text-gray-700 font-bold">ภาค</th>
                            <th className="px-3 py-2 text-left text-gray-700 font-bold w-44">ความก้าวหน้า</th>
                            <th className="px-3 py-2 text-left text-gray-700 font-bold whitespace-nowrap">ประเมิน (AX)</th>
                            <th className="px-3 py-2 text-left text-gray-700 font-bold">พี่เลี้ยง</th>
                          </tr>
                        </thead>
                        <tbody>
                          {progRows.flatMap((r,i)=>{
                            const prog=getProgress(r);
                            const col=progColor(prog);
                            const assess=getAssess(r);
                            const assessCol=assess.includes('พัฒนา')?'#F97316':assess.includes('น่าสนใจ')||assess.includes('เป็นโครงการ')?'#16A34A':'#9CA3AF';
                            const isExp=expandedAssessIdx===i;
                            return[
                              <tr key={`r${i}`}
                                onClick={()=>setExpandedAssessIdx(isExp?null:i)}
                                className={`border-b border-gray-100 cursor-pointer transition-colors
                                  ${isExp?'bg-blue-50 border-b-0':i%2===0?'bg-white':'bg-gray-50'} hover:bg-blue-50`}>
                                <td className="px-3 py-2 text-gray-400">{getRowNo(r)||i+1}</td>
                                <td className="px-3 py-2 text-gray-800 text-sm">
                                  <div className="flex items-start gap-1.5">
                                    <span className={`mt-0.5 text-xs shrink-0 transition-transform ${isExp?'rotate-90':''} text-gray-300`}>▶</span>
                                    <span>{getProject(r)}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2"><Badge text={getRegion(r)} color={REGION_COLORS[getRegion(r)]??'#94A3B8'}/></td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-28 bg-gray-200 rounded-full h-2.5 overflow-hidden">
                                      <div className="h-2.5 rounded-full transition-all" style={{width:`${Math.min(prog,100)}%`,background:col}}/>
                                    </div>
                                    <span className="text-xs font-bold w-9 text-right" style={{color:col}}>{prog}%</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-xs font-semibold whitespace-nowrap" style={{color:assessCol}}>{assess||<span className="text-gray-300">-</span>}</td>
                                <td className="px-3 py-2 text-gray-600 text-xs font-semibold">{getMentorNick(r)}</td>
                              </tr>,
                              isExp&&(
                                <tr key={`e${i}`} className="bg-blue-50 border-b border-blue-100">
                                  <td className="px-3 py-2 text-gray-300 text-xs text-right align-top">└</td>
                                  <td colSpan="5" className="px-3 pb-3 pt-1">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-xs text-gray-700">
                                      <div><span className="text-gray-400">📍 จังหวัด </span><span className="font-medium">{getProvince(r)||'-'}</span></div>
                                      <div><span className="text-gray-400">🗺️ ภาค </span><span className="font-medium" style={{color:REGION_COLORS[getRegion(r)]??'#555'}}>{getRegion(r)||'-'}</span></div>
                                      <div><span className="text-gray-400">👤 พี่เลี้ยง </span><span className="font-semibold text-[#1B3A8C]">{getMentorNick(r)||'-'}</span></div>
                                      <div><span className="text-gray-400">💰 งบประมาณ </span><span className="font-medium">{getBudget(r)?`฿${getBudget(r).toLocaleString()}`:'-'}</span></div>
                                      {getIssue(r)&&<div className="col-span-2"><span className="text-gray-400">🏷️ ประเด็น </span>{getIssue(r)}</div>}
                                      {getStatus(r)&&<div><span className="text-gray-400">📋 สถานะ </span>{getStatus(r)}</div>}
                                      {getLeaders(r)>0&&<div><span className="text-gray-400">👥 แกนนำ </span><span className="font-semibold text-[#F97316]">{getLeaders(r)} คน</span></div>}
                                      {getTargetP(r)>0&&<div><span className="text-gray-400">🎯 กลุ่มเป้าหมาย </span><span className="font-semibold text-[#1D4ED8]">{getTargetP(r)} คน</span></div>}
                                    </div>
                                  </td>
                                </tr>
                              )
                            ].filter(Boolean);
                          })}
                          {progRows.length===0&&<tr><td colSpan="6" className="text-center py-10 text-gray-400">ไม่มีข้อมูลความก้าวหน้า</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  </div>{/* /krm-fade */}
                </div>
              );
            })()}

            {/* ═══ MAPPING ═══ */}
            {page==='mapping'&&(()=>{
              const pins=filtered.filter(r=>getLat(r)&&getLon(r)).map(r=>({
                lat:getLat(r),lon:getLon(r),name:getProject(r),province:getProvince(r),
                region:getRegion(r),mentor:getMentorNick(r),progress:getProgress(r),
              }));
              const noCoord=filtered.filter(r=>!getLat(r)||!getLon(r));
              return(
                <div className="space-y-4">
                  {/* Region stat chips — clickable */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {REGIONS.map(reg=>{
                      const cnt=filtered.filter(r=>getRegion(r)===reg).length;
                      const pinCnt=pins.filter(p=>p.region===reg).length;
                      const isAct=region===reg;
                      return(
                        <div key={reg} onClick={()=>changeRegion(isAct?'ทั้งหมด':reg)}
                          className={`rounded-2xl text-white p-3 shadow-md text-center cursor-pointer select-none transition-all duration-200 active:scale-95
                            ${isAct?'ring-4 ring-white ring-offset-2 scale-105 shadow-xl':'hover:scale-102 hover:shadow-lg'}`}
                          style={{background:REGION_COLORS[reg]}}>
                          <div className="text-3xl font-extrabold leading-none">{cnt}</div>
                          <div className="text-xs font-semibold opacity-90 mt-1 leading-tight">{reg}</div>
                          <div className="text-xs opacity-70 mt-0.5">📌 {pinCnt} หมุด</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Map card */}
                  <div className="bg-white rounded-2xl shadow-md overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-800">📌 แผนที่โครงการ</h3>
                        <span className="bg-[#1B3A8C] text-white text-xs font-bold px-2 py-0.5 rounded-full">{pins.length} หมุด</span>
                        {region!=='ทั้งหมด'&&(
                          <button onClick={()=>changeRegion('ทั้งหมด')}
                            className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#1B3A8C]/10 text-[#1B3A8C] hover:bg-red-50 hover:text-red-500 transition-colors">
                            ✕ {region}
                          </button>
                        )}
                      </div>
                      {noCoord.length>0&&<span className="text-xs text-amber-500">⚠️ {noCoord.length} โครงการไม่มีพิกัด</span>}
                    </div>
                    <LeafletMap pins={pins} activeRegion={region!=='ทั้งหมด'?region:null}/>
                    {/* Legend */}
                    <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-2">
                      {REGIONS.filter(reg=>pins.some(p=>p.region===reg)).map(reg=>(
                        <button key={reg} onClick={()=>changeRegion(region===reg?'ทั้งหมด':reg)}
                          className={`flex items-center gap-1.5 text-xs transition-all ${region===reg?'font-bold':'text-gray-600 hover:text-gray-900'}`}>
                          <span className="w-3 h-3 rounded-full shrink-0" style={{background:REGION_COLORS[reg],outline:region===reg?`2px solid ${REGION_COLORS[reg]}`:''}}/>
                          {reg} ({pins.filter(p=>p.region===reg).length})
                        </button>
                      ))}
                      <span className="text-xs text-gray-400 ml-auto">คลิกหมุดเพื่อดูรายละเอียด</span>
                    </div>
                  </div>

                  {/* No-coord table */}
                  {noCoord.length>0&&(
                    <div className="bg-white rounded-2xl shadow-md overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <h3 className="font-bold text-gray-800 text-sm">⚠️ โครงการที่ยังไม่มีพิกัด ({noCoord.length})</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead><tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-3 py-2 text-left text-gray-500 font-semibold">โครงการ</th>
                            <th className="px-3 py-2 text-left text-gray-500 font-semibold">จังหวัด</th>
                            <th className="px-3 py-2 text-left text-gray-500 font-semibold">ภาค</th>
                          </tr></thead>
                          <tbody>
                            {noCoord.map((r,i)=>(
                              <tr key={i} className={`border-b border-gray-100 ${i%2===0?'bg-white':'bg-gray-50'}`}>
                                <td className="px-3 py-2 text-gray-700">{getProject(r)}</td>
                                <td className="px-3 py-2 text-gray-500">📍 {getProvince(r)}</td>
                                <td className="px-3 py-2"><Badge text={getRegion(r)} color={REGION_COLORS[getRegion(r)]??'#94A3B8'}/></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ═══ COMING SOON PAGES ═══ */}
            {(page==='network'||page==='quality')&&(
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="text-6xl mb-4">{page==='network'?'🤝':'📝'}</div>
                <h2 className="text-2xl font-extrabold text-[#1B3A8C] mb-2">
                  {page==='network'?'ภาคีคนรุ่นใหม่':'สรุปข้อมูลเชิงคุณภาพ'}
                </h2>
                <p className="text-gray-400 text-sm max-w-xs">หน้านี้อยู่ระหว่างการพัฒนา จะเปิดให้ใช้งานเร็วๆ นี้</p>
                <div className="mt-6 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-amber-600 text-xs font-semibold">
                  <span>⏳</span> Coming Soon
                </div>
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
