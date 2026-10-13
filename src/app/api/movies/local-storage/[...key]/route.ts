import {NextResponse} from "next/server";
import {localMovieStorage,verifyLocalRequest} from "@/services/movie-reels/local-storage";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Ctx={params:Promise<{key:string[]}>};
// Dev-only driver endpoint: authorization is the HMAC-signed URL; no cookies are used.
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Expose-Headers":"ETag"};
const deny=(status:number,error:string)=>NextResponse.json({error},{status,headers:cors});

async function open(req:Request,ctx:Ctx){
  if(process.env.MOVIE_STORAGE_DRIVER!=="local"||process.env.NODE_ENV==="production")return deny(404,"NOT_FOUND");
  const storage=localMovieStorage(),key=(await ctx.params).key.join("/");
  try{return {storage,key,signed:verifyLocalRequest(storage.cfg,req.method,key,new URL(req.url).searchParams)};}
  catch{return deny(403,"MOVIE_LOCAL_SIGNATURE_INVALID");}
}

export async function PUT(req:Request,ctx:Ctx){
  const r=await open(req,ctx);if(r instanceof Response)return r;
  try{
    const body=new Uint8Array(await req.arrayBuffer());
    const etag=r.signed.op==="part"?await r.storage.putPart(r.key,r.signed.upload!,r.signed.part!,r.signed.size!,body):await r.storage.putClip(r.key,body);
    return new NextResponse(null,{status:200,headers:{...cors,ETag:etag}});
  }catch{return deny(400,"MOVIE_LOCAL_WRITE_FAILED");}
}

export async function GET(req:Request,ctx:Ctx){
  const r=await open(req,ctx);if(r instanceof Response)return r;
  try{
    const {bytes,type}=await r.storage.readObject(r.key);
    const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.get("range")||"");
    const base={...cors,"Content-Type":type,"Accept-Ranges":"bytes"};
    if(range){
      const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):bytes.length-1,bytes.length-1);
      if(start>end)return new NextResponse(null,{status:416,headers:{...cors,"Content-Range":`bytes */${bytes.length}`}});
      return new NextResponse(new Uint8Array(bytes.subarray(start,end+1)),{status:206,headers:{...base,"Content-Range":`bytes ${start}-${end}/${bytes.length}`}});
    }
    return new NextResponse(new Uint8Array(bytes),{status:200,headers:{...base,"Content-Length":String(bytes.length)}});
  }catch{return deny(404,"NOT_FOUND");}
}

export function OPTIONS(){return new NextResponse(null,{status:204,headers:{...cors,"Access-Control-Allow-Methods":"GET,PUT,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Range"}});}
