import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { create, type Font } from "fontkit";
import { cardTextUnits, isArabicCardText } from "./tech-news-card-text";

type Measure = (text: string, size: number) => number;

let fontData: Promise<Buffer> | undefined;
// Cloudflare Workers have no filesystem for public/, so fall back to fetching the font as a static asset.
async function readFontFile() {
  try { return await readFile(join(process.cwd(), "public", "Tajawal-Regular.ttf")); }
  catch {
    const appUrl = (process.env.APP_URL?.trim() || "https://sp.leanpix.site").replace(/\/$/, "");
    const response = await fetch(`${appUrl}/Tajawal-Regular.ttf`);
    if (!response.ok) throw new Error(`FONT_UNAVAILABLE_${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
}
const loadFont = () => (fontData ??= readFontFile().catch((error) => { fontData = undefined; throw error; }));

/**
 * The image engine sizes Arabic words with the unjoined (isolated) letter widths, which are far wider
 * than the joined word it actually draws, leaving ragged gaps. Words are measured with real shaping here
 * and given that width explicitly.
 */
function shapedMeasure(data: Buffer): Measure {
  const font = create(data) as Font;
  return (text, size) => Math.ceil(font.layout(text).advanceWidth / font.unitsPerEm * size);
}

function CardText({ text, size, measure, color = "#fff" }: { text: string; size: number; measure: Measure; color?: string }) {
  if (!isArabicCardText(text)) return <div style={{ display:"flex", fontSize:size, lineHeight:1.3, color, width:"100%", overflowWrap:"break-word" }}>{text}</div>;
  return <div style={{display:"flex",flexDirection:"row-reverse",flexWrap:"wrap",columnGap:size*.28,rowGap:12,width:"100%",fontSize:size,lineHeight:1.35,color}}>
    {cardTextUnits(text).map((word,i) => <div key={i} style={{display:"flex",width:measure(word,size)}}>{word}</div>)}
  </div>;
}
export type CardBrand = { kicker: string; label: string; page: string; accent: string; bar: string; background: string; line: string };
const techBrand: CardBrand = { kicker: "TECH NEWS", label: "أخبار التقنية", page: "صفحة حبيب", accent: "#67e8f9", bar: "#818cf8", background: "linear-gradient(145deg,#061021,#102446)", line: "#29476d" };
/** `story` renders a 1080x1920 vertical card for Facebook Stories; the default is a square post image. */
export async function renderTechNewsCard(title: string, source: string, brand: CardBrand = techBrand, format: "post" | "story" = "post") {
  const data = await loadFont();
  const measure = shapedMeasure(data);
  const arabic = isArabicCardText(title);
  const size = (title.length > 120 ? 48 : title.length > 80 || arabic ? 56 : 64) + (format === "story" ? 8 : 0);
  return new ImageResponse(<div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",padding:format === "story" ? "250px 84px" : "76px 84px",background:brand.background,color:"#fff",fontFamily:"Tajawal",fontWeight:400}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",borderBottom:`2px solid ${brand.line}`,paddingBottom:32}}><div style={{display:"flex",fontSize:28,letterSpacing:3,color:brand.accent}}>{brand.kicker}</div><div style={{display:"flex",width:210}}><CardText text={brand.page} size={24} measure={measure} color="#cbd5e1" /></div></div>
    <div style={{display:"flex",flexDirection:"column",justifyContent:"center",flexGrow:1,gap:36,width:"100%"}}>
      <CardText text={brand.label} size={30} measure={measure} color={brand.accent} />
      <CardText text={title} size={size} measure={measure} />
      <div style={{display:"flex",height:5,width:140,background:brand.bar,alignSelf:arabic ? "flex-end" : "flex-start"}} />
      <CardText text={source} size={25} measure={measure} color="#cbd5e1" />
    </div>
    <div style={{display:"flex",fontSize:22,color:"#94a3b8",borderTop:`2px solid ${brand.line}`,paddingTop:28}}>{format === "story" ? <CardText text={`تابع ${brand.page}`} size={30} measure={measure} color={brand.accent} /> : "sp.leanpix.site"}</div>
  </div>, {width:1080,height:format === "story" ? 1920 : 1080,fonts:[{name:"Tajawal",data,weight:400,style:"normal"}],headers:{"Cache-Control":"public, max-age=0, s-maxage=86400, stale-while-revalidate=604800", "Content-Type":"image/png"}});
}
