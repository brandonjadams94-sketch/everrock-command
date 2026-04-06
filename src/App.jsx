import { useState, useEffect, useRef } from "react";
import * as THREE from "three";
import { X, ChevronRight, ChevronLeft, Play, Pause, MapPin, Globe, Layers } from "lucide-react";
import { Dashboard } from "./Dashboard";

const F = "'DM Sans', sans-serif";
const MO = "'Fira Code', monospace";
const C = {
  void:"#030308",surf:"rgba(8,8,18,0.94)",glass:"rgba(12,12,28,0.8)",
  brd:"rgba(255,255,255,0.04)",txt:"#c8c8d8",brt:"#eeeef4",mut:"#4a4a62",dim:"#1e1e30",
  acc:"#00d4ff",accD:"rgba(0,212,255,0.12)",
  grn:"#00e87b",red:"#ff2d55",amb:"#ffb800",pur:"#8b5cf6",
};
const TC={deal:C.grn,rfp:C.acc,market:C.red,signal:C.amb,ops:C.pur,alert:C.red,scan:C.acc,analysis:C.red,entity:C.pur};

const EV=[
  {id:1,lat:34.005,lng:-118.152,city:"Bell Gardens",type:"deal",label:"Round-N-Round Coin Laundry",sev:"high",det:"$440K under contract — utility verified, 21-23% cap rate",tm:"Closing",ask:440,noi:"$7.7-8.5K/mo"},
  {id:2,lat:33.977,lng:-118.155,city:"Bell Gardens",type:"deal",label:"Alligator Laundry",sev:"med",det:"6020 Florence Ave — 36.5% CoC est, spoke site",tm:"Evaluating",coc:36.5},
  {id:3,lat:33.493,lng:-111.926,city:"Scottsdale",type:"deal",label:"Postal Solutions Inc",sev:"med",det:"$0 down, 50/50 rev split — virtual mailbox growth",tm:"Negotiating"},
  {id:4,lat:32.775,lng:-117.071,city:"San Diego",type:"rfp",label:"SDSU RFP 7074",sev:"high",det:"Student Housing Laundry — submitted via PlanetBids",tm:"Awaiting Award"},
  {id:5,lat:34.069,lng:-118.352,city:"Hollywood",type:"ops",label:"BotBuilt Launch",sev:"high",det:"75/25 Alena Solutions — dental + home svcs, 12 leads",tm:"Active"},
  {id:6,lat:40.712,lng:-74.006,city:"New York",type:"market",label:"SPX Volatility",sev:"low",det:"VIX above 20 — monitoring iron condor entry",tm:"Live"},
  {id:7,lat:51.507,lng:-0.128,city:"London",type:"market",label:"BOE Rate Hold",sev:"low",det:"Sterling stable — no position change",tm:"4h ago"},
  {id:8,lat:35.682,lng:139.692,city:"Tokyo",type:"market",label:"Nikkei Selloff",sev:"med",det:"Yen carry trade — watching SPX contagion",tm:"1h ago"},
  {id:9,lat:38.907,lng:-77.037,city:"DC",type:"signal",label:"Fed Minutes Hawkish",sev:"high",det:"Rate cut prob declining — Polymarket 72% hold",tm:"30m ago"},
  {id:10,lat:37.335,lng:-121.893,city:"San Jose",type:"rfp",label:"SJSU Vending RFP",sev:"med",det:"Campus vending services — deadline May 15",tm:"Open"},
  {id:11,lat:34.237,lng:-118.529,city:"Northridge",type:"rfp",label:"CSUN Laundry",sev:"high",det:"Student housing laundry — pre-bid Apr 20",tm:"New"},
  {id:12,lat:37.872,lng:-122.259,city:"Berkeley",type:"rfp",label:"UC Berkeley Facilities",sev:"low",det:"Mixed services — laundry component",tm:"Open"},
];

const HT=[
  {lat:34.005,lng:-118.152,i:0.95,lb:"Bell Gardens Core",sc:79,zp:"90201"},
  {lat:33.977,lng:-118.177,i:0.85,lb:"South Gate",sc:72,zp:"90280"},
  {lat:33.990,lng:-118.125,i:0.80,lb:"Downey",sc:68,zp:"90240"},
  {lat:34.001,lng:-118.190,i:0.75,lb:"Huntington Park",sc:77,zp:"90255"},
  {lat:33.993,lng:-118.163,i:0.70,lb:"Maywood",sc:65,zp:"90270"},
  {lat:33.982,lng:-118.102,i:0.60,lb:"Pico Rivera",sc:61,zp:"90660"},
  {lat:33.899,lng:-118.220,i:0.55,lb:"Compton",sc:58,zp:"90220"},
  {lat:33.928,lng:-118.187,i:0.50,lb:"Lynwood",sc:55,zp:"90262"},
  {lat:34.023,lng:-118.202,i:0.65,lb:"East LA",sc:63,zp:"90022"},
  {lat:34.005,lng:-118.170,i:0.85,lb:"Commerce",sc:71,zp:"90040"},
  {lat:33.998,lng:-118.093,i:0.50,lb:"Whittier",sc:54,zp:"90601"},
  {lat:33.965,lng:-118.250,i:0.35,lb:"South LA",sc:45,zp:"90001"},
];

const LS=[
  {nm:"Clean Machine",ask:290,sc:81,coc:34,bk:"LoopNet",lat:33.984,lng:-118.199},
  {nm:"El Pueblo Lavanderia",ask:310,sc:77,coc:31,bk:"LoopNet",lat:34.001,lng:-118.148},
  {nm:"Sparkle Clean",ask:380,sc:72,coc:28,bk:"BizBuySell",lat:34.023,lng:-118.168},
  {nm:"Super Wash N Dry",ask:520,sc:65,coc:22,bk:"BizBen",lat:33.786,lng:-118.189},
  {nm:"Fresh & Clean",ask:445,sc:69,coc:24,bk:"BizBen",lat:33.989,lng:-118.314},
  {nm:"Coin-Op Express",ask:195,sc:58,coc:19,bk:"BizBuySell",lat:33.969,lng:-118.291},
];

const TL=[
  {dt:"2025-03",lb:"La Blanca — utility reveals 80% overstatement",tp:"analysis"},
  {dt:"2025-03",lb:"SDSU pre-bid visit — sole attendee",tp:"rfp"},
  {dt:"2025-03",lb:"University Laundry Services LLC formed",tp:"entity"},
  {dt:"2025-04",lb:"SDSU RFP 7074 submitted",tp:"rfp"},
  {dt:"2025-06",lb:"Round-N-Round identified — Bell Gardens hub",tp:"deal"},
  {dt:"2025-09",lb:"BotBuilt concept — AI automation",tp:"ops"},
  {dt:"2025-12",lb:"Signal Trader Phase 1 complete",tp:"signal"},
  {dt:"2026-01",lb:"Float Holdings LLC formed",tp:"entity"},
  {dt:"2026-02",lb:"BotBuilt term sheet — 75/25 Alena",tp:"ops"},
  {dt:"2026-03",lb:"Round-N-Round under contract $440K",tp:"deal"},
  {dt:"2026-03",lb:"Alligator Laundry — spoke site",tp:"deal"},
  {dt:"2026-04",lb:"Postal Solutions — Scottsdale",tp:"deal"},
  {dt:"2026-04",lb:"Command Center deployed",tp:"ops"},
];

const FD=[
  {tp:"alert",tx:"SDSU RFP 7074 — awaiting evaluation",tm:"2h"},
  {tp:"deal",tx:"Round-N-Round utility verified — confirmed",tm:"4h"},
  {tp:"scan",tx:"2 new university laundry bids (CSUN, SJSU)",tm:"6h"},
  {tp:"market",tx:"VIX 21.4 (+10.8%) — iron condor zone",tm:"12m"},
  {tp:"scan",tx:"Clean Machine scored 81 — Bell Gardens corridor",tm:"8h"},
  {tp:"signal",tx:"FED_RATE signal — LONG position (paper)",tm:"1d"},
  {tp:"deal",tx:"BotBuilt: 3 dental leads from campaign",tm:"1d"},
  {tp:"market",tx:"Polymarket: Fed hold 72% — +EV detected",tm:"2d"},
];

const v3=(lat,lng,r)=>{const p=(90-lat)*Math.PI/180,t=(lng+180)*Math.PI/180;return new THREE.Vector3(-(r*Math.sin(p)*Math.cos(t)),r*Math.cos(p),r*Math.sin(p)*Math.sin(t));};

// ═══ 3D GLOBE ═══
const GlobeView=()=>{
  const ref=useRef(null);
  const ms=useRef({d:false,lx:0,ly:0});
  const rt=useRef({x:0.3,y:-1.8});
  const ar=useRef(true);

  useEffect(()=>{
    if(!ref.current)return;
    const W=ref.current.clientWidth,H=ref.current.clientHeight;
    const sc=new THREE.Scene();
    const cm=new THREE.PerspectiveCamera(45,W/H,0.1,1000);cm.position.z=3.2;
    const rn=new THREE.WebGLRenderer({antialias:true,alpha:true});rn.setSize(W,H);rn.setPixelRatio(Math.min(devicePixelRatio,2));rn.setClearColor(0,0);
    ref.current.appendChild(rn.domElement);

    const gl=new THREE.Mesh(new THREE.SphereGeometry(1,48,48),new THREE.MeshPhongMaterial({color:0x080818,emissive:0x020210,specular:0x111133,shininess:20,transparent:true,opacity:0.92}));
    sc.add(gl);
    sc.add(new THREE.Mesh(new THREE.SphereGeometry(1.02,48,48),new THREE.MeshPhongMaterial({color:0x00d4ff,transparent:true,opacity:0.03,side:THREE.BackSide})));

    const gg=new THREE.Group();
    for(let i=-60;i<=60;i+=30){const p=[];for(let j=0;j<=360;j+=5)p.push(v3(i,j,1.003));gg.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),new THREE.LineBasicMaterial({color:0x00d4ff,transparent:true,opacity:0.025})));}
    for(let j=-180;j<=180;j+=40){const p=[];for(let i=-90;i<=90;i+=5)p.push(v3(i,j,1.003));gg.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),new THREE.LineBasicMaterial({color:0x00d4ff,transparent:true,opacity:0.025})));}
    sc.add(gg);

    const ng=new THREE.Group();
    EV.forEach(ev=>{
      const pos=v3(ev.lat,ev.lng,1.012);const col=parseInt((TC[ev.type]||"#ffffff").replace("#",""),16);
      const dot=new THREE.Mesh(new THREE.SphereGeometry(0.009,12,12),new THREE.MeshBasicMaterial({color:col}));dot.position.copy(pos);ng.add(dot);
      const rg=new THREE.Mesh(new THREE.RingGeometry(0.016,0.022,24),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.7,side:THREE.DoubleSide}));rg.position.copy(pos);rg.lookAt(new THREE.Vector3(0,0,0));ng.add(rg);
      if(ev.sev==="high"){const pu=new THREE.Mesh(new THREE.RingGeometry(0.022,0.033,24),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.4,side:THREE.DoubleSide}));pu.position.copy(pos);pu.lookAt(new THREE.Vector3(0,0,0));pu.userData={pulse:true};ng.add(pu);}
      if(ev.type==="deal"||ev.type==="rfp"||ev.type==="ops"){const b=new THREE.Mesh(new THREE.CylinderGeometry(0.001,0.001,0.08,4),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.2}));const bp=v3(ev.lat,ev.lng,1.05);b.position.copy(bp);b.lookAt(new THREE.Vector3(0,0,0));b.rotateX(Math.PI/2);ng.add(b);}
    });
    sc.add(ng);

    const hg=new THREE.Group();
    HT.forEach(z=>{
      const pos=v3(z.lat,z.lng,1.005);const sz=0.02+z.i*0.04;const hue=0.35-z.i*0.35;
      const hm=new THREE.Mesh(new THREE.CircleGeometry(sz,24),new THREE.MeshBasicMaterial({color:new THREE.Color().setHSL(hue,1,0.5),transparent:true,opacity:z.i*0.25,side:THREE.DoubleSide}));hm.position.copy(pos);hm.lookAt(new THREE.Vector3(0,0,0));hg.add(hm);
      const gm=new THREE.Mesh(new THREE.CircleGeometry(sz*1.8,24),new THREE.MeshBasicMaterial({color:new THREE.Color().setHSL(hue,1,0.5),transparent:true,opacity:z.i*0.08,side:THREE.DoubleSide}));gm.position.copy(pos);gm.lookAt(new THREE.Vector3(0,0,0));hg.add(gm);
    });
    LS.forEach(l=>{
      const pos=v3(l.lat,l.lng,1.008);const col=l.sc>=75?0x00e87b:l.sc>=60?0xffb800:0xff2d55;
      const d=new THREE.Mesh(new THREE.SphereGeometry(0.005,6,6),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.6}));d.position.copy(pos);hg.add(d);
    });
    sc.add(hg);

    const ag=new THREE.Group();
    const laD=EV.filter(e=>Math.abs(e.lat-34)<1&&e.lng<-117);
    for(let i=0;i<laD.length;i++)for(let j=i+1;j<laD.length;j++){
      const s=v3(laD[i].lat,laD[i].lng,1.01),e=v3(laD[j].lat,laD[j].lng,1.01);
      const mid=s.clone().add(e).multiplyScalar(0.5).normalize().multiplyScalar(1.07);
      ag.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(s,mid,e).getPoints(30)),new THREE.LineBasicMaterial({color:0x00e87b,transparent:true,opacity:0.12})));
    }
    const hub=EV[0];
    EV.filter(e=>Math.abs(e.lat-hub.lat)>2||Math.abs(e.lng-hub.lng)>2).forEach(ev=>{
      const s=v3(hub.lat,hub.lng,1.01),e2=v3(ev.lat,ev.lng,1.01);
      const d=s.distanceTo(e2);const mid=s.clone().add(e2).multiplyScalar(0.5).normalize().multiplyScalar(1+d*0.18);
      const col=parseInt((TC[ev.type]||"#ffffff").replace("#",""),16);
      ag.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(s,mid,e2).getPoints(40)),new THREE.LineBasicMaterial({color:col,transparent:true,opacity:0.07})));
    });
    sc.add(ag);

    const pg=new THREE.Group();const pd=[];
    ag.children.forEach((arc,idx)=>{if(idx%3!==0)return;const pos=arc.geometry.attributes.position;const cnt=pos.count;for(let p=0;p<2;p++){const pm=new THREE.Mesh(new THREE.SphereGeometry(0.003,4,4),new THREE.MeshBasicMaterial({color:arc.material.color.getHex(),transparent:true,opacity:0.7}));pg.add(pm);pd.push({m:pm,p:pos,c:cnt,o:p*(cnt/2),s:0.3+Math.random()*0.4});}});
    sc.add(pg);

    sc.add(new THREE.AmbientLight(0x222244,0.5));
    const dl=new THREE.DirectionalLight(0x00d4ff,0.3);dl.position.set(5,3,5);sc.add(dl);
    const sv=[];for(let i=0;i<1500;i++)sv.push((Math.random()-0.5)*50,(Math.random()-0.5)*50,(Math.random()-0.5)*50);
    sc.add(new THREE.Points(new THREE.BufferGeometry().setAttribute("position",new THREE.Float32BufferAttribute(sv,3)),new THREE.PointsMaterial({color:0xffffff,size:0.015,transparent:true,opacity:0.3})));

    let t=0,frame;
    const anim=()=>{frame=requestAnimationFrame(anim);t+=0.01;
      if(ar.current&&!ms.current.d)rt.current.y+=0.0008;
      [gl,ng,hg,ag,gg,pg].forEach(g=>{g.rotation.x=rt.current.x;g.rotation.y=rt.current.y;});
      ng.children.forEach(c=>{if(c.userData.pulse){const s=1+Math.sin(t*3)*0.5;c.scale.set(s,s,s);c.material.opacity=0.4*(1-(s-1)/0.5);}});
      pd.forEach(p=>{p.o=(p.o+p.s)%p.c;const i=Math.floor(p.o)*3;const a=p.p.array;if(i+2<a.length){p.m.position.set(a[i],a[i+1],a[i+2]);p.m.position.applyEuler(new THREE.Euler(rt.current.x,rt.current.y,0));}});
      rn.render(sc,cm);};
    anim();

    const el=rn.domElement;
    const oD=e=>{ms.current={d:true,lx:e.clientX,ly:e.clientY};ar.current=false;};
    const oU=()=>{ms.current.d=false;setTimeout(()=>ar.current=true,4000);};
    const oM=e=>{if(!ms.current.d)return;rt.current.y+=(e.clientX-ms.current.lx)*0.005;rt.current.x+=(e.clientY-ms.current.ly)*0.005;rt.current.x=Math.max(-1.2,Math.min(1.2,rt.current.x));ms.current.lx=e.clientX;ms.current.ly=e.clientY;};
    const oW=e=>{cm.position.z=Math.max(1.5,Math.min(6,cm.position.z+e.deltaY*0.002));};
    el.addEventListener("mousedown",oD);el.addEventListener("mouseup",oU);el.addEventListener("mousemove",oM);el.addEventListener("wheel",oW);
    const oR=()=>{if(!ref.current)return;cm.aspect=ref.current.clientWidth/ref.current.clientHeight;cm.updateProjectionMatrix();rn.setSize(ref.current.clientWidth,ref.current.clientHeight);};
    window.addEventListener("resize",oR);
    return()=>{cancelAnimationFrame(frame);el.removeEventListener("mousedown",oD);el.removeEventListener("mouseup",oU);el.removeEventListener("mousemove",oM);el.removeEventListener("wheel",oW);window.removeEventListener("resize",oR);if(ref.current&&rn.domElement)ref.current.removeChild(rn.domElement);rn.dispose();};
  },[]);

  return <div ref={ref} style={{width:"100%",height:"100%",cursor:"grab"}}/>;
};

// ═══ UNIFIED APP ═══
export default function App(){
  const [view,setView]=useState("globe"); // "globe" or "grid"
  const [sel,setSel]=useState(null);
  const [time,setTime]=useState(new Date());
  const [ff,setFf]=useState("all");
  const [lt,setLt]=useState("intel");
  const [ti,setTi]=useState(TL.length-1);
  const [play,setPlay]=useState(false);

  useEffect(()=>{const i=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(i);},[]);
  useEffect(()=>{if(!play)return;const i=setInterval(()=>{setTi(p=>{if(p>=TL.length-1){setPlay(false);return p;}return p+1;});},1500);return()=>clearInterval(i);},[play]);

  const se=EV.find(e=>e.id===sel);
  const fd=ff==="all"?FD:FD.filter(f=>f.tp===ff);

  // ─── GRID VIEW = full operational dashboard ───
  if(view==="grid") return <Dashboard />;

  // ─── GLOBE VIEW = Palantir intelligence view ───
  return(
    <div style={{background:C.void,width:"100vw",height:"100vh",overflow:"hidden",position:"relative",fontFamily:F}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Fira+Code:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.brd};border-radius:2px}`}</style>

      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 40% 50%,rgba(0,212,255,0.025),transparent 65%)",pointerEvents:"none"}}/>

      {/* TOP BAR */}
      <div style={{position:"absolute",top:0,left:0,right:0,height:44,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",background:"linear-gradient(180deg,rgba(3,3,8,0.97),transparent)",zIndex:50,borderBottom:`1px solid ${C.brd}`}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:C.grn,boxShadow:`0 0 10px ${C.grn}`,animation:"pulse 2s infinite"}}/>
          <span style={{fontFamily:MO,fontSize:11,fontWeight:600,letterSpacing:5,color:C.acc}}>EVERROCK</span>
          <span style={{fontFamily:MO,fontSize:11,letterSpacing:5,color:C.mut}}>COMMAND</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {/* View toggle */}
          <div style={{display:"flex",gap:1,marginRight:8}}>
            {[{id:"globe",icon:Globe,label:"GLOBE"},{id:"grid",icon:Layers,label:"OPS DESK"}].map(v=>(
              <button key={v.id} onClick={()=>setView(v.id)}
                style={{background:view===v.id?C.accD:"transparent",border:`1px solid ${view===v.id?`${C.acc}30`:"transparent"}`,color:view===v.id?C.acc:C.mut,padding:"5px 12px",borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",gap:5,fontFamily:MO,fontSize:8,letterSpacing:1.5}}>
                <v.icon size={11}/>{v.label}
              </button>
            ))}
          </div>
          {/* Metrics */}
          {[{l:"DEALS",v:"5",c:C.grn},{l:"PIPELINE",v:"$1.4M",c:C.brt},{l:"RFPs",v:"3",c:C.acc},{l:"SCANNER",v:"6",c:C.amb}].map((m,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:5,padding:"0 10px",borderRight:i<3?`1px solid ${C.brd}`:"none"}}>
              <span style={{fontFamily:MO,fontSize:8,color:C.mut,letterSpacing:2}}>{m.l}</span>
              <span style={{fontFamily:F,fontSize:14,fontWeight:700,color:m.c}}>{m.v}</span>
            </div>
          ))}
          <div style={{width:1,height:20,background:C.brd}}/>
          <span style={{fontFamily:MO,fontSize:10,color:C.mut}}>{time.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
          <span style={{fontFamily:MO,fontSize:10,color:C.acc,fontWeight:500}}>{time.toLocaleTimeString("en-US",{hour12:false})}</span>
        </div>
      </div>

      {/* GLOBE */}
      <div style={{position:"absolute",inset:0,zIndex:1}}><GlobeView/></div>

      {/* LEFT PANEL */}
      <div style={{position:"absolute",left:0,top:44,bottom:44,width:280,background:`linear-gradient(90deg,${C.surf} 88%,transparent)`,backdropFilter:"blur(16px)",borderRight:`1px solid ${C.brd}`,zIndex:10,display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",borderBottom:`1px solid ${C.brd}`,flexShrink:0}}>
          {[{id:"intel",l:"INTEL"},{id:"heat",l:"ACQ MAP"},{id:"tl",l:"TIMELINE"}].map(t=>(
            <button key={t.id} onClick={()=>setLt(t.id)} style={{flex:1,background:lt===t.id?C.accD:"transparent",border:"none",borderBottom:lt===t.id?`1px solid ${C.acc}`:"1px solid transparent",color:lt===t.id?C.acc:C.mut,padding:"10px 4px",cursor:"pointer",fontFamily:MO,fontSize:7,letterSpacing:1.5}}>{t.l}</button>
          ))}
        </div>
        <div style={{flex:1,overflow:"auto",padding:"12px 12px 12px 16px"}}>
          {lt==="intel"&&["high","med","low"].map(sev=>(
            <div key={sev}>
              <div style={{fontFamily:MO,fontSize:7,color:C.mut,letterSpacing:3,margin:"10px 0 6px"}}>{sev==="high"?"▲ HIGH PRIORITY":sev==="med"?"● MONITORING":"○ TRACKING"}</div>
              {EV.filter(e=>e.sev===sev).map(ev=>(
                <div key={ev.id} onClick={()=>setSel(sel===ev.id?null:ev.id)} style={{padding:"8px 10px",background:sel===ev.id?C.accD:"transparent",border:`1px solid ${sel===ev.id?`${C.acc}30`:C.brd}`,borderLeft:`2px solid ${TC[ev.type]}`,borderRadius:6,marginBottom:3,cursor:"pointer",transition:"all 0.2s"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontFamily:F,fontSize:11,fontWeight:500,color:C.brt}}>{ev.label}</span>
                    {ev.sev==="high"&&<div style={{width:4,height:4,borderRadius:"50%",background:TC[ev.type],boxShadow:`0 0 6px ${TC[ev.type]}`,animation:"pulse 2s infinite"}}/>}
                  </div>
                  <div style={{fontFamily:MO,fontSize:9,color:C.mut,marginTop:2}}>{ev.city} · {ev.tm}</div>
                </div>
              ))}
            </div>
          ))}
          {lt==="heat"&&<>
            <div style={{fontFamily:MO,fontSize:7,color:C.mut,letterSpacing:3,marginBottom:4}}>LA COUNTY ACQUISITION ZONES</div>
            <div style={{fontFamily:F,fontSize:10,color:C.txt,marginBottom:12,lineHeight:1.5}}>Heat = hub proximity × density × deal score</div>
            {[...HT].sort((a,b)=>b.i-a.i).map((z,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:`1px solid ${C.brd}`}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:`hsl(${126-z.i*126},100%,50%)`,opacity:0.7}}/>
                <span style={{fontFamily:F,fontSize:10,color:C.txt,flex:1}}>{z.lb}</span>
                <span style={{fontFamily:MO,fontSize:9,color:z.i>0.7?C.grn:z.i>0.5?C.amb:C.mut,fontWeight:600}}>{z.sc}</span>
              </div>
            ))}
            <div style={{fontFamily:MO,fontSize:7,color:C.mut,letterSpacing:3,marginTop:16,marginBottom:6}}>SCANNER HITS</div>
            {LS.sort((a,b)=>b.sc-a.sc).map((l,i)=>(
              <div key={i} style={{padding:"6px 0",borderBottom:`1px solid ${C.brd}`,display:"flex",justifyContent:"space-between"}}>
                <div><div style={{fontFamily:F,fontSize:10,color:C.brt}}>{l.nm}</div><div style={{fontFamily:MO,fontSize:9,color:C.mut}}>{l.bk} · ${l.ask}K</div></div>
                <div style={{textAlign:"right"}}><div style={{fontFamily:MO,fontSize:14,fontWeight:700,color:l.sc>=75?C.grn:l.sc>=60?C.amb:C.red}}>{l.sc}</div><div style={{fontFamily:MO,fontSize:8,color:C.mut}}>{l.coc}%</div></div>
              </div>
            ))}
          </>}
          {lt==="tl"&&<>
            <div style={{fontFamily:MO,fontSize:7,color:C.mut,letterSpacing:3,marginBottom:4}}>DEAL PROGRESSION</div>
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              <button onClick={()=>{setTi(0);setPlay(true);}} style={{background:C.accD,border:`1px solid ${C.acc}30`,color:C.acc,padding:"5px 12px",borderRadius:4,cursor:"pointer",fontFamily:MO,fontSize:8,display:"flex",alignItems:"center",gap:4}}><Play size={9}/>REPLAY</button>
              {play&&<button onClick={()=>setPlay(false)} style={{background:C.glass,border:`1px solid ${C.brd}`,color:C.mut,padding:"5px 12px",borderRadius:4,cursor:"pointer",fontFamily:MO,fontSize:8,display:"flex",alignItems:"center",gap:4}}><Pause size={9}/>PAUSE</button>}
            </div>
            {TL.map((ev,i)=>{const col=TC[ev.tp]||C.mut;const act=i<=ti;return(
              <div key={i} onClick={()=>setTi(i)} style={{display:"flex",gap:8,cursor:"pointer",opacity:act?1:0.2,transition:"opacity 0.5s"}}>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:12}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:act?col:C.dim,border:i===ti?`2px solid ${C.brt}`:"none",flexShrink:0}}/>
                  {i<TL.length-1&&<div style={{width:1,flex:1,background:act?`${col}40`:C.dim,minHeight:16}}/>}
                </div>
                <div style={{paddingBottom:10}}><div style={{fontFamily:MO,fontSize:8,color:act?col:C.dim}}>{ev.dt}</div><div style={{fontFamily:F,fontSize:10,color:act?C.txt:C.dim,lineHeight:1.4,marginTop:1}}>{ev.lb}</div></div>
              </div>
            );})}
          </>}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div style={{position:"absolute",right:0,top:44,bottom:44,width:300,background:`linear-gradient(270deg,${C.surf} 88%,transparent)`,backdropFilter:"blur(16px)",borderLeft:`1px solid ${C.brd}`,zIndex:10,display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px 6px 12px",borderBottom:`1px solid ${C.brd}`,flexShrink:0}}>
          <span style={{fontFamily:MO,fontSize:7,color:C.mut,letterSpacing:3}}>LIVE FEED</span>
          <div style={{display:"flex",gap:2}}>{["all","deal","scan","market","alert"].map(f=>(<button key={f} onClick={()=>setFf(f)} style={{background:ff===f?C.accD:"transparent",border:"none",color:ff===f?C.acc:C.mut,padding:"2px 6px",borderRadius:3,cursor:"pointer",fontFamily:MO,fontSize:7,letterSpacing:1,textTransform:"uppercase"}}>{f}</button>))}</div>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"6px 16px 6px 12px"}}>
          {fd.map((item,i)=>(
            <div key={i} style={{padding:"7px 0",borderBottom:`1px solid ${C.brd}`,display:"flex",gap:8,animation:`fadeUp 0.3s ease ${i*0.04}s both`}}>
              <div style={{width:4,height:4,borderRadius:"50%",background:TC[item.tp]||C.txt,marginTop:5,flexShrink:0,boxShadow:`0 0 6px ${TC[item.tp]||C.txt}`}}/>
              <div><div style={{fontFamily:F,fontSize:11,color:C.txt,lineHeight:1.4}}>{item.tx}</div><div style={{fontFamily:MO,fontSize:8,color:C.mut,marginTop:2}}>{item.tm}</div></div>
            </div>
          ))}
          <div style={{fontFamily:MO,fontSize:7,color:C.mut,letterSpacing:3,marginTop:16,marginBottom:6}}>ALL POSITIONS</div>
          {EV.map(ev=>(
            <div key={ev.id} onClick={()=>setSel(sel===ev.id?null:ev.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:`1px solid ${C.brd}`,cursor:"pointer",opacity:sel===ev.id?1:0.7}}>
              <div style={{width:4,height:4,borderRadius:"50%",background:TC[ev.type],boxShadow:`0 0 4px ${TC[ev.type]}`}}/>
              <span style={{fontFamily:F,fontSize:10,color:C.txt,flex:1}}>{ev.label}</span>
              <span style={{fontFamily:MO,fontSize:8,color:C.mut}}>{ev.city}</span>
            </div>
          ))}
        </div>
      </div>

      {/* DETAIL PANEL */}
      {se&&(
        <div style={{position:"absolute",right:320,top:56,width:360,background:C.surf,backdropFilter:"blur(24px)",border:`1px solid ${C.brd}`,borderLeft:`2px solid ${TC[se.type]}`,borderRadius:10,zIndex:100,animation:"slideIn 0.3s ease"}}>
          <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.brd}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:7,height:7,borderRadius:"50%",background:TC[se.type],boxShadow:`0 0 10px ${TC[se.type]}`}}/><span style={{fontFamily:MO,fontSize:8,color:TC[se.type],letterSpacing:2,textTransform:"uppercase"}}>{se.type}</span></div>
            <X size={13} color={C.mut} style={{cursor:"pointer"}} onClick={()=>setSel(null)}/>
          </div>
          <div style={{padding:14}}>
            <div style={{fontFamily:F,fontSize:16,fontWeight:600,color:C.brt,lineHeight:1.3,marginBottom:3}}>{se.label}</div>
            <div style={{fontFamily:MO,fontSize:10,color:C.mut,marginBottom:12,display:"flex",alignItems:"center",gap:5}}><MapPin size={9}/>{se.city}</div>
            <div style={{fontFamily:F,fontSize:12,color:C.txt,lineHeight:1.6,marginBottom:14}}>{se.det}</div>
            {(se.ask||se.noi||se.coc)&&(
              <div style={{display:"flex",gap:10,marginBottom:14}}>
                {se.ask&&<div style={{flex:1,background:C.glass,borderRadius:6,padding:8,border:`1px solid ${C.brd}`,textAlign:"center"}}><div style={{fontFamily:MO,fontSize:7,color:C.mut,letterSpacing:2}}>ASK</div><div style={{fontFamily:F,fontSize:16,fontWeight:700,color:C.brt}}>${se.ask}K</div></div>}
                {se.noi&&<div style={{flex:1,background:C.glass,borderRadius:6,padding:8,border:`1px solid ${C.brd}`,textAlign:"center"}}><div style={{fontFamily:MO,fontSize:7,color:C.mut,letterSpacing:2}}>NOI/MO</div><div style={{fontFamily:F,fontSize:13,fontWeight:600,color:C.grn}}>{se.noi}</div></div>}
                {se.coc&&<div style={{flex:1,background:C.glass,borderRadius:6,padding:8,border:`1px solid ${C.brd}`,textAlign:"center"}}><div style={{fontFamily:MO,fontSize:7,color:C.mut,letterSpacing:2}}>CoC</div><div style={{fontFamily:F,fontSize:16,fontWeight:700,color:C.grn}}>{se.coc}%</div></div>}
              </div>
            )}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontFamily:MO,fontSize:9,color:C.mut}}>{se.tm}</span>
              <span style={{fontFamily:MO,fontSize:8,color:TC[se.type],padding:"2px 8px",borderRadius:3,background:`${TC[se.type]}12`,border:`1px solid ${TC[se.type]}20`}}>{se.sev==="high"?"HIGH":"MONITOR"}</span>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM BAR */}
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:44,background:C.surf,borderTop:`1px solid ${C.brd}`,zIndex:50,display:"flex",alignItems:"center"}}>
        <div style={{width:280,display:"flex",alignItems:"center",justifyContent:"center",gap:12,padding:"0 12px",borderRight:`1px solid ${C.brd}`,height:"100%"}}>
          {[{l:"SCANNERS",v:"2 LIVE",c:C.grn},{l:"SIGNALS",v:"3",c:C.amb}].map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:3,height:3,borderRadius:"50%",background:s.c,boxShadow:`0 0 4px ${s.c}`}}/><span style={{fontFamily:MO,fontSize:7,color:C.mut,letterSpacing:1}}>{s.l}</span><span style={{fontFamily:MO,fontSize:7,color:s.c}}>{s.v}</span></div>))}
        </div>
        <div style={{flex:1,display:"flex",alignItems:"center",gap:6,padding:"0 16px",height:"100%"}}>
          <button onClick={()=>setTi(Math.max(0,ti-1))} style={{background:"none",border:"none",color:C.mut,cursor:"pointer",padding:2}}><ChevronLeft size={12}/></button>
          <div style={{flex:1,position:"relative",height:16,display:"flex",alignItems:"center"}}>
            <div style={{position:"absolute",left:0,right:0,height:1,background:C.dim}}/>
            <div style={{position:"absolute",left:0,width:`${(ti/(TL.length-1))*100}%`,height:1,background:C.acc,transition:"width 0.5s"}}/>
            {TL.map((_,i)=>{const pct=(i/(TL.length-1))*100;const col=TC[TL[i].tp]||C.mut;return <div key={i} onClick={()=>setTi(i)} style={{position:"absolute",left:`${pct}%`,width:i===ti?8:4,height:i===ti?8:4,borderRadius:"50%",background:i<=ti?col:C.dim,border:i===ti?`1px solid ${C.brt}`:"none",transform:"translate(-50%,-50%)",top:"50%",cursor:"pointer",transition:"all 0.3s",zIndex:i===ti?2:1}}/>;
            })}
          </div>
          <button onClick={()=>setTi(Math.min(TL.length-1,ti+1))} style={{background:"none",border:"none",color:C.mut,cursor:"pointer",padding:2}}><ChevronRight size={12}/></button>
          <div style={{fontFamily:MO,fontSize:8,color:C.acc,minWidth:180,textAlign:"right",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{TL[ti]?.lb}</div>
        </div>
        <div style={{width:300,display:"flex",alignItems:"center",justifyContent:"center",gap:12,padding:"0 12px",borderLeft:`1px solid ${C.brd}`,height:"100%"}}>
          {[{l:"DEALS",v:"5",c:C.grn},{l:"RFPs",v:"3",c:C.acc},{l:"ZONES",v:"14",c:C.amb}].map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontFamily:MO,fontSize:7,color:C.mut,letterSpacing:1}}>{s.l}</span><span style={{fontFamily:MO,fontSize:8,color:s.c,fontWeight:600}}>{s.v}</span></div>))}
        </div>
      </div>
    </div>
  );
}
