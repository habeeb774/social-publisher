import { ImageResponse } from "next/og";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { posts } from "@/db/schema";

export const runtime = "nodejs";

function extract(content: string) {
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  const title = (lines.find((line) => !line.startsWith("📡") && !line.startsWith("خبر تقني") && !line.startsWith("🔗") && !line.startsWith("المصدر:") && !line.startsWith("#")) ?? "آخر أخبار التكنولوجيا").slice(0, 120);
  const source = (lines.find((line) => line.startsWith("المصدر:")) ?? "المصدر: تقنية").replace("المصدر:", "").trim();
  return { title, source };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [post] = await getDb().select({ content: posts.content }).from(posts).where(eq(posts.id, id)).limit(1);
  const { title, source } = extract(post?.content ?? "");
  const seed = Array.from(id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const accent = seed % 2 ? "#22d3ee" : "#60a5fa";
  const accent2 = seed % 3 ? "#7c3aed" : "#14b8a6";

  return new ImageResponse(
    <div style={{
      width:"100%",height:"100%",display:"flex",position:"relative",overflow:"hidden",
      background:"linear-gradient(145deg,#030712 0%,#071426 50%,#0b1f3a 100%)",
      color:"#fff",fontFamily:"Arial, sans-serif",
    }}>
      <div style={{position:"absolute",inset:0,opacity:.22,backgroundImage:"linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px)",backgroundSize:"54px 54px"}}/>
      <div style={{position:"absolute",width:520,height:520,borderRadius:999,top:-230,left:-170,background:accent,opacity:.18,filter:"blur(24px)"}}/>
      <div style={{position:"absolute",width:620,height:620,borderRadius:999,bottom:-300,right:-220,background:accent2,opacity:.2,filter:"blur(28px)"}}/>

      <div style={{position:"absolute",left:90,right:90,top:88,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{width:18,height:18,borderRadius:999,background:accent,boxShadow:`0 0 34px ${accent}`}}/>
          <div style={{fontSize:34,fontWeight:800,letterSpacing:1.5}}>TECH NEWS</div>
        </div>
        <div style={{fontSize:24,opacity:.74}}>صفحة حبيب</div>
      </div>

      <div style={{position:"absolute",left:88,right:88,top:210,bottom:180,display:"flex",flexDirection:"column",justifyContent:"center",gap:30}}>
        <div style={{fontSize:28,fontWeight:700,color:accent}}>آخر أخبار التكنولوجيا</div>
        <div style={{fontSize:54,lineHeight:1.22,fontWeight:800,maxWidth:880}}>{title}</div>
        <div style={{display:"flex",alignItems:"center",gap:14,fontSize:25,opacity:.72}}>
          <div style={{width:90,height:4,borderRadius:20,background:accent2}}/>
          {source}
        </div>
      </div>

      <div style={{position:"absolute",left:90,right:90,bottom:78,height:4,borderRadius:20,background:`linear-gradient(90deg,${accent},${accent2},transparent)`,opacity:.75}}/>
    </div>,
    {
      width:1080,
      height:1080,
      headers:{
        "Cache-Control":"public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
        "Content-Type":"image/png",
      },
    },
  );
}
