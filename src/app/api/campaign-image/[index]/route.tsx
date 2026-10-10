import { ImageResponse } from "next/og";
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { getCampaignVisual } from "@/content/campaign-visuals";

type StyledProps = { style?: Record<string, unknown>; children?: ReactNode };
/**
 * The image engine (Satori) only supports flex layout: a div with several children needs display:flex,
 * and display:grid is rejected (the response is then an empty PNG). Expand components and normalize every
 * div so no scene can silently produce a broken image.
 */
function normalizeLayout(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(normalizeLayout);
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<StyledProps>;
  if (typeof el.type === "function") return normalizeLayout((el.type as (p: StyledProps) => ReactNode)(el.props));
  const kids = Children.toArray(el.props.children).map(normalizeLayout);
  let style = el.props.style;
  // Rasterized blur/shadow filters dominated CPU time. Keep the geometry and
  // colors, but render lighting with gradients instead of expensive filters.
  if (style && (style.boxShadow || style.filter)) {
    const { boxShadow, filter, ...rest } = style;
    void boxShadow; void filter;
    style = rest;
  }
  if (el.type === "div") {
    const display = style?.display;
    if (display === "grid") {
      const { gridTemplateColumns, gridTemplateRows, ...rest } = style ?? {};
      void gridTemplateColumns; void gridTemplateRows;
      style = { ...rest, display: "flex", flexWrap: "wrap", alignContent: "stretch" };
    } else if (kids.length > 1 && display !== "flex" && display !== "contents" && display !== "none") {
      style = { ...style, display: "flex" };
    }
  }
  return cloneElement(el, { style }, ...kids);
}

export const runtime = "nodejs";

type Palette = { accent: string; accent2: string; glow: string };
type SceneProps = Palette & { n: number; evening: boolean };

const PALETTES: Record<string, Palette> = {
  "استراتيجية": { accent: "#38bdf8", accent2: "#6366f1", glow: "#1d4ed8" },
  "تقنية": { accent: "#22d3ee", accent2: "#2563eb", glow: "#0891b2" },
  "بيانات": { accent: "#2dd4bf", accent2: "#0ea5e9", glow: "#0f766e" },
  "مبيعات": { accent: "#60a5fa", accent2: "#8b5cf6", glow: "#4f46e5" },
  "مالية": { accent: "#34d399", accent2: "#3b82f6", glow: "#059669" },
  "تجارة إلكترونية": { accent: "#22d3ee", accent2: "#14b8a6", glow: "#0f766e" },
  "تجربة العميل": { accent: "#67e8f9", accent2: "#8b5cf6", glow: "#7c3aed" },
  "خدمة العملاء": { accent: "#38bdf8", accent2: "#2dd4bf", glow: "#0284c7" },
  "إدارة": { accent: "#818cf8", accent2: "#38bdf8", glow: "#4f46e5" },
  "مستندات": { accent: "#7dd3fc", accent2: "#a78bfa", glow: "#6d28d9" },
  "عمليات": { accent: "#2dd4bf", accent2: "#60a5fa", glow: "#0f766e" },
  "موثوقية": { accent: "#38bdf8", accent2: "#a78bfa", glow: "#4338ca" },
  "حوكمة": { accent: "#60a5fa", accent2: "#c084fc", glow: "#7e22ce" },
  "أمان": { accent: "#22d3ee", accent2: "#818cf8", glow: "#3730a3" },
  "استمرارية": { accent: "#2dd4bf", accent2: "#38bdf8", glow: "#0e7490" },
  "جودة": { accent: "#60a5fa", accent2: "#2dd4bf", glow: "#0369a1" },
  "قياس": { accent: "#38bdf8", accent2: "#34d399", glow: "#047857" },
  "تكلفة": { accent: "#34d399", accent2: "#60a5fa", glow: "#059669" },
  "ذكاء اصطناعي": { accent: "#22d3ee", accent2: "#a855f7", glow: "#6d28d9" },
  "تسويق": { accent: "#38bdf8", accent2: "#c084fc", glow: "#7e22ce" },
  "محتوى": { accent: "#22d3ee", accent2: "#6366f1", glow: "#4338ca" },
  "تحليلات": { accent: "#2dd4bf", accent2: "#60a5fa", glow: "#0284c7" },
  "موارد بشرية": { accent: "#38bdf8", accent2: "#a78bfa", glow: "#6d28d9" },
  "مشتريات": { accent: "#34d399", accent2: "#38bdf8", glow: "#0e7490" },
  "توسع": { accent: "#22d3ee", accent2: "#818cf8", glow: "#4f46e5" },
};

const glass = {
  background: "rgba(255,255,255,.045)",
  border: "1px solid rgba(255,255,255,.10)",
};

function Dot({ x, y, color, size = 18 }: { x: number; y: number; color: string; size?: number }) {
  return <div style={{ position: "absolute", left: x, top: y, width: size, height: size, borderRadius: 999, background: color, boxShadow: `0 0 34px ${color}` }} />;
}
function Line({ x, y, w, rotate = 0, color }: { x: number; y: number; w: number; rotate?: number; color: string }) {
  return <div style={{ position: "absolute", left: x, top: y, width: w, height: 3, borderRadius: 9, background: color, opacity: .42, transform: `rotate(${rotate}deg)`, transformOrigin: "left center" }} />;
}
function Card({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children?: React.ReactNode }) {
  return <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 30, display: "flex", ...glass }}>{children}</div>;
}

function WorkflowScene({ accent, accent2, evening }: SceneProps) {
  const pts = evening
    ? [[160,250],[360,180],[540,310],[760,210],[890,410],[680,590],[430,540],[230,690]]
    : [[150,220],[330,350],[530,180],[760,300],[900,520],[680,680],[420,610],[220,760]];
  return <div style={{ position:"absolute", inset:0, display:"flex" }}>
    {pts.slice(1).map((p,i) => {
      const a=pts[i]; const dx=p[0]-a[0]; const dy=p[1]-a[1]; const len=Math.sqrt(dx*dx+dy*dy);
      return <Line key={"l"+i} x={a[0]} y={a[1]} w={len} rotate={Math.atan2(dy,dx)*180/Math.PI} color={i%2?accent:accent2}/>;
    })}
    {pts.map((p,i)=><Dot key={i} x={p[0]-12} y={p[1]-12} color={i%2?accent:accent2} size={24}/>)}
    <Card x={280} y={820} w={520} h={190}>
      <div style={{display:"flex",gap:24,padding:32,width:"100%"}}>
        {[0,1,2].map(i=><div key={i} style={{flex:1,borderRadius:22,padding:20,display:"flex",flexDirection:"column",gap:14,...glass}}>
          <div style={{width:"48%",height:8,borderRadius:9,background:i%2?accent:accent2}}/>
          <div style={{width:"78%",height:5,borderRadius:9,background:"rgba(255,255,255,.14)"}}/>
          <div style={{width:"62%",height:5,borderRadius:9,background:"rgba(255,255,255,.08)"}}/>
        </div>)}
      </div>
    </Card>
  </div>;
}

function BridgeScene({ accent, accent2 }: SceneProps) {
  return <div style={{position:"absolute",inset:0,display:"flex"}}>
    <Card x={110} y={260} w={290} h={430}><div style={{padding:34,display:"flex",flexDirection:"column",gap:22,width:"100%"}}>
      {[.8,.55,.7,.45].map((w,i)=><div key={i} style={{width:(w*100)+"%",height:12,borderRadius:12,background:i===0?accent:"rgba(255,255,255,.10)"}}/> )}
    </div></Card>
    <Card x={680} y={260} w={290} h={430}><div style={{padding:34,display:"flex",flexDirection:"column",gap:22,width:"100%"}}>
      {[.6,.8,.5,.68].map((w,i)=><div key={i} style={{width:(w*100)+"%",height:12,borderRadius:12,background:i===1?accent2:"rgba(255,255,255,.10)"}}/> )}
    </div></Card>
    {[0,1,2].map(i=><Line key={i} x={405} y={340+i*95} w={270} color={i%2?accent2:accent}/>)}
    {[0,1,2].map(i=><Dot key={i} x={520+i*16} y={330+i*95} color={i%2?accent2:accent} size={26}/>)}
    <div style={{position:"absolute",left:470,top:770,width:140,height:140,borderRadius:999,border:`3px solid ${accent}`,boxShadow:`0 0 70px ${accent}55`,display:"flex"}}/>
  </div>;
}

function FunnelScene({ accent, accent2 }: SceneProps) {
  return <div style={{position:"absolute",inset:0,display:"flex"}}>
    {[0,1,2,3].map(i=><div key={i} style={{position:"absolute",left:180+i*75,top:180+i*125,width:720-i*150,height:92,borderRadius:30,background:i%2?accent2:accent,opacity:.13+i*.04,border:`1px solid ${i%2?accent2:accent}66`}}/> )}
    <div style={{position:"absolute",left:440,top:720,width:200,height:200,borderRadius:999,border:`24px solid ${accent}55`,boxShadow:`0 0 90px ${accent}44`}}/>
    {[0,1,2,3,4].map(i=><Dot key={i} x={170+i*175} y={130+(i%2)*40} color={i%2?accent:accent2} size={22}/>)}
  </div>;
}

function DataScene({ accent, accent2 }: SceneProps) {
  return <div style={{position:"absolute",inset:0,display:"flex"}}>
    <Card x={120} y={220} w={360} h={650}><div style={{padding:34,width:"100%",display:"flex",flexDirection:"column",gap:18}}>
      {Array.from({length:9},(_,i)=><div key={i} style={{display:"flex",gap:14}}>
        <div style={{width:16,height:16,borderRadius:5,background:i%3===0?accent2:"rgba(255,255,255,.12)"}}/>
        <div style={{width:(48+(i%4)*10)+"%",height:10,borderRadius:10,background:"rgba(255,255,255,.10)"}}/>
      </div>)}
    </div></Card>
    <div style={{position:"absolute",left:520,top:360,width:150,height:300,clipPath:"polygon(0 0,100% 0,65% 48%,65% 100%,35% 100%,35% 48%)",background:`linear-gradient(180deg,${accent}aa,${accent2}55)`}}/>
    <Card x={720} y={330} w={250} h={420}><div style={{padding:28,width:"100%",display:"flex",flexDirection:"column",gap:22}}>
      {[.9,.72,.82,.56,.68].map((w,i)=><div key={i} style={{width:(w*100)+"%",height:12,borderRadius:10,background:i<2?accent:"rgba(255,255,255,.11)"}}/> )}
    </div></Card>
  </div>;
}

function SupportScene({ accent, accent2 }: SceneProps) {
  return <div style={{position:"absolute",inset:0,display:"flex"}}>
    <Card x={90} y={180} w={900} h={780}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:265,borderRight:"1px solid rgba(255,255,255,.08)",display:"flex",flexDirection:"column",padding:26,gap:18}}>
        {[0,1,2,3,4,5].map(i=><div key={i} style={{height:78,borderRadius:22,background:i===1?`${accent}20`:"rgba(255,255,255,.035)",border:i===1?`1px solid ${accent}66`:"1px solid rgba(255,255,255,.05)",display:"flex",alignItems:"center",padding:16,gap:14}}>
          <div style={{width:34,height:34,borderRadius:999,background:i%2?accent:accent2,opacity:.75}}/><div style={{width:110,height:7,borderRadius:9,background:"rgba(255,255,255,.12)"}}/>
        </div>)}
      </div>
      <div style={{position:"absolute",left:310,right:35,top:50,bottom:50,display:"flex",flexDirection:"column",gap:26}}>
        <div style={{alignSelf:"flex-start",width:390,height:125,borderRadius:"28px 28px 28px 8px",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.09)"}}/>
        <div style={{alignSelf:"flex-end",width:330,height:112,borderRadius:"28px 28px 8px 28px",background:`${accent}28`,border:`1px solid ${accent}66`}}/>
        <div style={{alignSelf:"flex-start",width:460,height:145,borderRadius:"28px 28px 28px 8px",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.09)"}}/>
        <div style={{marginTop:"auto",height:72,borderRadius:22,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)"}}/>
      </div>
    </Card>
  </div>;
}

function SecurityScene({ accent, accent2 }: SceneProps) {
  return <div style={{position:"absolute",inset:0,display:"flex"}}>
    {[420,330,240].map((s,i)=><div key={i} style={{position:"absolute",left:540-s/2,top:505-s/2,width:s,height:s,borderRadius:999,border:`${i===0?2:1}px solid ${i%2?accent2:accent}`,opacity:.22+i*.1}}/>)}
    <div style={{position:"absolute",left:395,top:270,width:290,height:360,clipPath:"polygon(50% 0,92% 18%,86% 68%,50% 100%,14% 68%,8% 18%)",background:`linear-gradient(160deg,${accent}55,${accent2}28)`,border:`2px solid ${accent}`,boxShadow:`0 0 110px ${accent}44`,display:"flex"}}/>
    <div style={{position:"absolute",left:485,top:390,width:110,height:100,borderRadius:24,border:`8px solid ${accent2}`}}/>
    <div style={{position:"absolute",left:465,top:450,width:150,height:130,borderRadius:24,background:"#081729",border:`2px solid ${accent}`}}/>
    {[0,1,2,3].map(i=><Dot key={i} x={[220,840,180,880][i]} y={[320,360,760,720][i]} color={i%2?accent:accent2} size={22}/>)}
  </div>;
}

function ReliabilityScene({ accent, accent2 }: SceneProps) {
  return <div style={{position:"absolute",inset:0,display:"flex"}}>
    <div style={{position:"absolute",left:215,top:240,width:650,height:650,borderRadius:999,border:"2px solid rgba(255,255,255,.08)"}}/>
    <div style={{position:"absolute",left:300,top:325,width:480,height:480,borderRadius:999,border:`10px solid ${accent}44`,borderTopColor:accent,borderRightColor:accent2,transform:"rotate(25deg)",boxShadow:`0 0 90px ${accent}22`}}/>
    <div style={{position:"absolute",left:478,top:505,width:124,height:124,borderRadius:36,background:`${accent2}22`,border:`2px solid ${accent2}`,display:"flex"}}/>
    {[0,1,2].map(i=><Card key={i} x={120+i*360} y={930} w={250} h={120}><div style={{margin:"auto",width:"62%",height:8,borderRadius:10,background:i===1?accent2:accent,opacity:.8}}/></Card>)}
  </div>;
}

function AnalyticsScene({ accent, accent2 }: SceneProps) {
  return <div style={{position:"absolute",inset:0,display:"flex"}}>
    <Card x={95} y={175} w={890} h={760}>
      <div style={{position:"absolute",left:60,right:60,top:70,height:110,display:"flex",gap:24}}>
        {[0,1,2,3].map(i=><div key={i} style={{flex:1,borderRadius:24,...glass,display:"flex",alignItems:"flex-end",padding:22}}>
          <div style={{width:(45+i*11)+"%",height:10,borderRadius:8,background:i%2?accent2:accent}}/>
        </div>)}
      </div>
      <div style={{position:"absolute",left:70,bottom:80,width:520,height:420,borderLeft:"2px solid rgba(255,255,255,.08)",borderBottom:"2px solid rgba(255,255,255,.08)"}}>
        {[0,1,2,3,4,5].map(i=><div key={i} style={{position:"absolute",left:28+i*78,bottom:0,width:42,height:80+((i*73)%280),borderRadius:"14px 14px 0 0",background:`linear-gradient(180deg,${i%2?accent2:accent},${i%2?accent2:accent}33)`}}/>)}
      </div>
      <div style={{position:"absolute",right:70,bottom:90,width:220,height:220,borderRadius:999,border:`28px solid ${accent}44`,borderTopColor:accent,borderRightColor:accent2}}/>
    </Card>
  </div>;
}

function CalendarScene({ accent, accent2 }: SceneProps) {
  return <div style={{position:"absolute",inset:0,display:"flex"}}>
    <Card x={120} y={170} w={840} h={820}>
      <div style={{position:"absolute",left:42,right:42,top:45,height:42,display:"flex",gap:18}}>
        {[0,1,2,3].map(i=><div key={i} style={{width:120+i*20,height:12,borderRadius:10,background:i===0?accent:"rgba(255,255,255,.09)"}}/>)}
      </div>
      <div style={{position:"absolute",left:45,right:45,top:135,bottom:45,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gridTemplateRows:"repeat(4,1fr)",gap:18}}>
        {Array.from({length:16},(_,i)=><div key={i} style={{width:168,height:138,boxSizing:"border-box",borderRadius:24,...glass,display:"flex",padding:18,alignItems:"flex-end"}}>
          {(i%5===0||i%7===0)&&<div style={{width:"78%",height:32,borderRadius:12,background:i%2?`${accent}33`:`${accent2}33`,border:`1px solid ${i%2?accent:accent2}66`}}/>}
        </div>)}
      </div>
    </Card>
  </div>;
}

function EcommerceScene({ accent, accent2 }: SceneProps) {
  return <div style={{position:"absolute",inset:0,display:"flex"}}>
    <div style={{position:"absolute",left:90,top:250,width:360,height:360,borderRadius:46,...glass,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:190,height:160,borderRadius:24,background:`${accent}22`,border:`2px solid ${accent}`,transform:"rotate(-6deg)"}}/>
    </div>
    <Line x={455} y={430} w={210} color={accent2}/>
    <Dot x={548} y={416} color={accent2} size={26}/>
    <div style={{position:"absolute",left:670,top:290,width:300,height:210,borderRadius:34,...glass,display:"flex"}}>
      <div style={{position:"absolute",left:48,bottom:46,width:165,height:84,borderRadius:18,background:`${accent2}25`,border:`2px solid ${accent2}`}}/>
      <div style={{position:"absolute",left:188,bottom:70,width:70,height:60,borderRadius:"10px 22px 10px 10px",background:`${accent}30`,border:`2px solid ${accent}`}}/>
      {[125,230].map((x,i)=><div key={i} style={{position:"absolute",left:x,bottom:26,width:36,height:36,borderRadius:999,background:"#071525",border:`5px solid ${i?accent:accent2}`}}/>)}
    </div>
    {[0,1,2].map(i=><Card key={i} x={170+i*260} y={760} w={220} h={150}><div style={{margin:"auto",width:70,height:70,borderRadius:22,background:i%2?`${accent2}22`:`${accent}22`,border:`2px solid ${i%2?accent2:accent}`}}/></Card>)}
  </div>;
}

function DocumentScene({ accent, accent2 }: SceneProps) {
  return <div style={{position:"absolute",inset:0,display:"flex"}}>
    {[0,1,2].map(i=><div key={i} style={{position:"absolute",left:170+i*58,top:230+i*48,width:420,height:570,borderRadius:34,background:"#0b1a2d",border:"1px solid rgba(255,255,255,.10)",transform:`rotate(${-8+i*7}deg)`,boxShadow:"0 28px 80px rgba(0,0,0,.25)",display:"flex",flexDirection:"column",padding:46,gap:24}}>
      {[.75,.48,.82,.62,.7].map((w,j)=><div key={j} style={{width:(w*100)+"%",height:j===0?14:8,borderRadius:9,background:j===0?(i%2?accent2:accent):"rgba(255,255,255,.11)"}}/>)}
    </div>)}
    <Card x={720} y={330} w={250} h={410}><div style={{margin:"auto",width:130,height:130,borderRadius:32,background:`${accent2}22`,border:`2px solid ${accent2}`,boxShadow:`0 0 60px ${accent2}22`}}/></Card>
    <Line x={610} y={520} w={110} color={accent}/>
  </div>;
}

function AICoreScene({ accent, accent2 }: SceneProps) {
  const points=[[540,215],[760,300],[850,515],[760,730],[540,820],[320,730],[230,515],[320,300]];
  return <div style={{position:"absolute",inset:0,display:"flex"}}>
    {points.map((p,i)=><Line key={"l"+i} x={540} y={520} w={Math.hypot(p[0]-540,p[1]-520)} rotate={Math.atan2(p[1]-520,p[0]-540)*180/Math.PI} color={i%2?accent2:accent}/>)}
    {points.map((p,i)=><Dot key={i} x={p[0]-13} y={p[1]-13} color={i%2?accent2:accent} size={26}/>)}
    <div style={{position:"absolute",left:390,top:370,width:300,height:300,borderRadius:82,background:`radial-gradient(circle at 35% 30%,${accent}66,${accent2}20 55%,rgba(5,14,28,.9) 72%)`,border:`2px solid ${accent}88`,boxShadow:`0 0 120px ${accent}44`,display:"flex"}}/>
    {[0,1,2,3].map(i=><div key={i} style={{position:"absolute",left:455+(i%2)*90,top:435+Math.floor(i/2)*90,width:58,height:58,borderRadius:999,border:`2px solid ${i%2?accent2:accent}`,background:"#071626"}}/>)}
  </div>;
}

function QueueScene({ accent, accent2 }: SceneProps) {
  return <div style={{position:"absolute",inset:0,display:"flex"}}>
    {[0,1,2,3].map(i=><Card key={i} x={120+i*45} y={220+i*105} w={480} h={150}><div style={{padding:26,width:"100%",display:"flex",alignItems:"center",gap:20}}>
      <div style={{width:56,height:56,borderRadius:18,background:i%2?`${accent2}22`:`${accent}22`,border:`2px solid ${i%2?accent2:accent}`}}/>
      <div style={{width:"60%",height:10,borderRadius:9,background:"rgba(255,255,255,.11)"}}/>
    </div></Card>)}
    <Line x={640} y={560} w={120} color={accent}/>
    <div style={{position:"absolute",left:770,top:390,width:220,height:340,borderRadius:48,...glass,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:110,height:110,borderRadius:999,border:`18px solid ${accent}44`,borderTopColor:accent,borderRightColor:accent2}}/>
    </div>
  </div>;
}

function sceneKind(category: string, title: string, evening: boolean) {
  const s = (category + " " + title).toLowerCase();
  let kind =
    /webhook|api|تكامل|جسر|ربط/.test(s) ? "bridge" :
    /crm|lead|مبيعات|عرض|proposal|تأهيل/.test(s) ? "funnel" :
    /بيانات|تطبيع|استخراج|مزامنة|تكرار|مصدر حقيقة|نماذج/.test(s) ? "data" :
    /تعليق|رد|عميل|خدمة|تذكرة|شكوى|دعم|inbox/.test(s) ? "support" :
    /أمان|صلاحية|سر|token|audit|حساسة/.test(s) ? "security" :
    /retry|موثوق|فشل|استثناء|idempotency|logs|تنبيه|rollback|backup|استمرارية/.test(s) ? "reliability" :
    /تحليل|قياس|dashboard|تقرير|أفضل وقت|metric|kpi/.test(s) ? "analytics" :
    /تقويم|محتوى|حملة|نشر|جدولة/.test(s) ? "calendar" :
    /متجر|طلب|شحن|مخزون|مرتجع|شراء|دفع|فاتورة|مالية|مصاريف/.test(s) ? "commerce" :
    /مستند|pdf|وثيقة|عقد/.test(s) ? "document" :
    /ai|ذكاء|prompt|rag|agent|نموذج|model|context|هلوسة/.test(s) ? "ai" :
    /queue|دفعات|rate limit|طابور|أولوية/.test(s) ? "queue" : "workflow";

  if (evening) {
    const alternate: Record<string,string> = {
      bridge:"queue", funnel:"analytics", data:"document", support:"workflow",
      security:"reliability", reliability:"security", analytics:"calendar",
      calendar:"workflow", commerce:"funnel", document:"data", ai:"bridge",
      queue:"reliability", workflow:"analytics",
    };
    kind = alternate[kind] ?? kind;
  }
  return kind;
}

function Scene(props: SceneProps & { kind: string }) {
  if (props.kind === "bridge") return <BridgeScene {...props}/>;
  if (props.kind === "funnel") return <FunnelScene {...props}/>;
  if (props.kind === "data") return <DataScene {...props}/>;
  if (props.kind === "support") return <SupportScene {...props}/>;
  if (props.kind === "security") return <SecurityScene {...props}/>;
  if (props.kind === "reliability") return <ReliabilityScene {...props}/>;
  if (props.kind === "analytics") return <AnalyticsScene {...props}/>;
  if (props.kind === "calendar") return <CalendarScene {...props}/>;
  if (props.kind === "commerce") return <EcommerceScene {...props}/>;
  if (props.kind === "document") return <DocumentScene {...props}/>;
  if (props.kind === "ai") return <AICoreScene {...props}/>;
  if (props.kind === "queue") return <QueueScene {...props}/>;
  return <WorkflowScene {...props}/>;
}

export async function GET(_request: Request, context: { params: Promise<{ index: string }> }) {
  const { index } = await context.params;
  const n = Math.max(1, Math.min(180, Number(index) || 1));
  const post = getCampaignVisual(n);
  const palette = PALETTES[post.category] ?? PALETTES["تقنية"];
  const kind = sceneKind(post.category, post.title, post.slot === "evening");

  return new ImageResponse(
    normalizeLayout(<div style={{
      width:"100%", height:"100%", display:"flex", position:"relative", overflow:"hidden",
      background:"linear-gradient(155deg,#040b16 0%,#071525 52%,#081a2f 100%)",
    }}>
      <div style={{position:"absolute",inset:0,opacity:.34,backgroundImage:"linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px)",backgroundSize:"54px 54px"}}/>
      <div style={{position:"absolute",width:620+(n%5)*34,height:620+(n%5)*34,borderRadius:999,top:-290+(n%7)*18,left:-250+(n%9)*22,background:`radial-gradient(circle,${palette.accent},transparent 70%)`,opacity:.14}}/>
      <div style={{position:"absolute",width:700+(n%4)*42,height:700+(n%4)*42,borderRadius:999,bottom:-380+(n%6)*16,right:-300+(n%8)*24,background:`radial-gradient(circle,${palette.accent2},transparent 70%)`,opacity:.17}}/>
      <div style={{position:"absolute",left:70+((n*47)%880),top:90+((n*83)%960),width:18+(n%4)*5,height:18+(n%4)*5,borderRadius:999,background:palette.accent,boxShadow:`0 0 46px ${palette.accent}`,opacity:.72}}/>
      <div style={{position:"absolute",left:90+((n*71)%820),top:120+((n*59)%900),width:12+(n%5)*4,height:12+(n%5)*4,borderRadius:999,background:palette.accent2,boxShadow:`0 0 38px ${palette.accent2}`,opacity:.62}}/>
      <Scene {...palette} n={n} evening={post.slot==="evening"} kind={kind}/>
      <div style={{position:"absolute",left:58,right:58,bottom:48,height:8,borderRadius:20,background:`linear-gradient(90deg,${palette.accent},${palette.accent2},transparent)`,opacity:.45}}/>
    </div>) as ReactElement,
    {
      width:1080,
      height:1350,
      headers:{
        "Cache-Control":"public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
        "Content-Type":"image/png",
      },
    },
  );
}
