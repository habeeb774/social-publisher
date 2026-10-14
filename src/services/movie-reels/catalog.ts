import {createHash} from "node:crypto";
import {sql} from "drizzle-orm";

export const CATALOG_POLICY_VERSION=1;
export const CATALOG_POLICY_KEY="movie_autopilot_policy";
export const catalogKey=(movieId:string)=>`movie_autopilot_asset:${movieId}`;
export const LICENSE_URL="https://creativecommons.org/licenses/by/3.0/";
export const CATALOG={
 "big-buck-bunny":{title:"Big Buck Bunny",sourceUrl:"https://download.blender.org/peach/bigbuckbunny_movies/big_buck_bunny_720p_h264.mov.zip",
  licensePage:"https://peach.blender.org/about/",credit:"(c) copyright 2008, Blender Foundation / www.bigbuckbunny.org",archive:true,subtitlesUrl:null},
 "tears-of-steel":{title:"Tears of Steel",sourceUrl:"https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov",
  licensePage:"https://mango.blender.org/sharing/",credit:"(CC) Blender Foundation | mango.blender.org",archive:false,
  subtitlesUrl:"https://download.blender.org/demo/movies/ToS/subtitles/TOS-en.srt"},
} as const;
export type CatalogId=keyof typeof CATALOG;
export const catalogIds=Object.keys(CATALOG) as CatalogId[];
export function catalogAttribution(id:CatalogId){const film=CATALOG[id];return `${film.title}\n${film.credit}\nالمصدر: ${film.licensePage}\nالترخيص: CC BY 3.0 — ${LICENSE_URL}\nتعديلات: مقتطفات قصيرة، إعادة تأطير عمودي وترجمة عربية عند وجود حوار.`;}
export async function licenseEvidence(id:CatalogId,fetcher:typeof fetch=fetch){
 const film=CATALOG[id],response=await fetcher(film.licensePage,{redirect:"error",signal:AbortSignal.timeout(20000),cache:"no-store"});
 if(!response.ok||!response.body)throw new Error("CATALOG_LICENSE_UNAVAILABLE");
 const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>200000){await reader.cancel();throw new Error("CATALOG_LICENSE_TOO_LARGE");}chunks.push(part.value);}
 const html=Buffer.concat(chunks).toString("utf8");
 const text=html.replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/&#124;/g,"|").replace(/\s+/g," ");
 if(!/creativecommons\.org\/licenses\/by\/3\.0\//i.test(html)||!text.includes(id==="big-buck-bunny"?"copyright 2008":"Blender Foundation | mango.blender.org"))throw new Error("CATALOG_LICENSE_CHANGED");
 return {url:film.licensePage,license:LICENSE_URL,checkedAt:new Date().toISOString(),sha256:createHash("sha256").update(html).digest("hex"),snapshot:html};
}
/** Applies only to registered catalogue assets. A paused/reconfigured policy must not authorize pending sends. */
export const catalogPublicationGate=()=>sql`NOT EXISTS(SELECT 1 FROM settings ca WHERE ca.key='movie_autopilot_asset:'||m.id::text)
 OR EXISTS(SELECT 1 FROM settings ca,settings cp WHERE ca.key='movie_autopilot_asset:'||m.id::text AND cp.key='movie_autopilot_policy'
  AND cp.value::jsonb->>'enabled'='true' AND cp.value::jsonb->>'version'='1' AND cp.value::jsonb->>'ownerId'=m.owner_user_id::text
  AND ca.value::jsonb->>'state'='ready' AND ca.value::jsonb->>'sourceKey'=m.source_storage_key
  AND ca.value::jsonb->>'rightsRevision'=m.rights_revision::text
  AND position(ca.value::jsonb->>'attribution' in c.description)>0)`;
