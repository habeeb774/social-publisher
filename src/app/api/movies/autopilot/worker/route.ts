import {NextRequest,NextResponse} from "next/server";
import {createHash,timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {blockCatalog,catalogHeartbeat,catalogUploadParts,finishCatalogUpload,initCatalogUpload,leaseCatalog} from "@/services/movie-reels/autopilot";
const lease={movieId:z.uuid(),token:z.uuid()};
const input=z.discriminatedUnion("action",[
 z.object({action:z.literal("lease")}).strict(),z.object({action:z.literal("heartbeat"),...lease}).strict(),
 z.object({action:z.literal("init"),...lease,size:z.number().int().min(1000).max(800*1024**2)}).strict(),
 z.object({action:z.literal("parts"),...lease,numbers:z.array(z.number().int().positive()).min(1).max(10)}).strict(),
 z.object({action:z.literal("complete"),...lease,parts:z.array(z.object({number:z.number().int().positive(),etag:z.string().min(1).max(200)}).strict()).min(1).max(100),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({action:z.literal("fail"),...lease,error:z.string().max(200)}).strict(),
]);
const digest=(value:string)=>createHash("sha256").update(value).digest();
export async function POST(request:NextRequest){
 const secret=process.env.MOVIE_WORKER_SECRET?.trim()??"",bearer=(request.headers.get("authorization")??"").replace(/^Bearer\s+/i,"").trim();
 if(secret.length<32||!timingSafeEqual(digest(secret),digest(bearer)))return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
  const raw=await request.text();if(raw.length>20000)return NextResponse.json({error:"TOO_LARGE"},{status:413});const body=input.parse(JSON.parse(raw));
  switch(body.action){
   case "lease":return NextResponse.json({job:await leaseCatalog()});
   case "heartbeat":await catalogHeartbeat(body.movieId,body.token);return NextResponse.json({ok:true});
   case "init":return NextResponse.json(await initCatalogUpload(body.movieId,body.token,body.size));
   case "parts":return NextResponse.json({parts:await catalogUploadParts(body.movieId,body.token,body.numbers)});
   case "complete":await finishCatalogUpload(body.movieId,body.token,body.parts,body.sourceSha256);return NextResponse.json({ok:true});
   case "fail":await blockCatalog(body.movieId,body.token,body.error);return NextResponse.json({ok:true});
  }
 }catch(error){const message=error instanceof Error?error.message:"UNAVAILABLE";const code=message==="LEASE_LOST"?409:error instanceof z.ZodError||error instanceof SyntaxError?400:503;
  return NextResponse.json({error:code===409?"LEASE_LOST":code===400?"INVALID_REQUEST":"AUTOPILOT_WORKER_UNAVAILABLE"},{status:code});}
}
