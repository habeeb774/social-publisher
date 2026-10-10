import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cardTextRows, isArabicCardText } from "./tech-news-card-text";

function CardText({ text, size, color = "#fff" }: { text: string; size: number; color?: string }) {
  const arabic = isArabicCardText(text);
  if (!arabic) return <div style={{ display:"flex", fontSize:size, lineHeight:1.3, color, width:"100%", overflowWrap:"break-word" }}>{text}</div>;
  const rows = cardTextRows(text, Math.floor(850/(size*.64)));
  return <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%"}}>{rows.map((row,index) => <div key={index} style={{display:"flex",flexDirection:"row-reverse",justifyContent:"flex-start",gap:size*.24,width:"100%",fontSize:size,lineHeight:1.35,color}}>{row.map((word,i) => <span key={i}>{word}</span>)}</div>)}</div>;
}
export async function renderTechNewsCard(title: string, source: string) {
  const arabic = isArabicCardText(title);
  const size = title.length > 120 ? 48 : title.length > 80 || arabic ? 56 : 64;
  return new ImageResponse(<div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",padding:"76px 84px",background:"linear-gradient(145deg,#061021,#102446)",color:"#fff",fontFamily:"Tajawal",fontWeight:400}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",borderBottom:"2px solid #29476d",paddingBottom:32}}><div style={{display:"flex",fontSize:28,letterSpacing:3,color:"#67e8f9"}}>TECH NEWS</div><div style={{display:"flex",width:210}}><CardText text="صفحة حبيب" size={24} color="#cbd5e1" /></div></div>
    <div style={{display:"flex",flexDirection:"column",justifyContent:"center",flexGrow:1,gap:36,width:"100%"}}>
      <CardText text="أخبار التقنية" size={30} color="#67e8f9" />
      <CardText text={title} size={size} />
      <div style={{display:"flex",height:5,width:140,background:"#818cf8",alignSelf:arabic ? "flex-end" : "flex-start"}} />
      <CardText text={source} size={25} color="#cbd5e1" />
    </div>
    <div style={{display:"flex",fontSize:22,color:"#94a3b8",borderTop:"2px solid #29476d",paddingTop:28}}>sp.leanpix.site</div>
  </div>, {width:1080,height:1080,fonts:[{name:"Tajawal",data:await readFile(join(process.cwd(),"public","Tajawal-Regular.ttf")),weight:400,style:"normal"}],headers:{"Cache-Control":"public, max-age=0, s-maxage=86400, stale-while-revalidate=604800", "Content-Type":"image/png"}});
}
