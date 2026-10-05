export const TEAM_COOKIE="sp_comment_team";
const secret=()=>process.env.AUTH_SECRET||process.env.ADMIN_PASSWORD||"";
async function signature(payload:string){if(!secret())throw new Error("AUTH_SECRET_MISSING");const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret()),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`comments-team:${payload}`))),b=>b.toString(16).padStart(2,"0")).join("");}
export async function teamToken(userId:string,version:number,now=Date.now()){const payload=`v1.${userId}.${Math.floor(now/1000)+28800}.${version}`;return `${payload}.${await signature(payload)}`;}
export async function verifyTeamToken(value:string|undefined,now=Date.now()){
  if(!value||!secret())return null;const parts=value.split(".");if(parts.length!==5)return null;const [v,id,expires,version,mac]=parts;
  if(v!=="v1"||!/^[-a-f0-9]{36}$/.test(id)||!/^\d+$/.test(expires)||!/^\d+$/.test(version)||!/^[a-f0-9]{64}$/.test(mac))return null;
  const expiration=Number(expires),seconds=Math.floor(now/1000);if(expiration<=seconds||expiration>seconds+28800)return null;
  const expected=await signature(parts.slice(0,4).join("."));let difference=0;for(let i=0;i<64;i++)difference|=mac.charCodeAt(i)^expected.charCodeAt(i);return difference?null:{id,version:Number(version)};
}
