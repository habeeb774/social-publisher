import { scrypt,randomBytes,randomUUID,timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { neon } from "@neondatabase/serverless";
import type { NextRequest } from "next/server";
import { sessionFrom } from "../request-auth";
import { currentUser } from "../rbac";
import { TEAM_COOKIE,verifyTeamToken,teamToken } from "./team-token";
import type { CommentRole } from "./permissions";
const db=()=>{if(!process.env.DATABASE_URL)throw new Error("DATABASE_UNAVAILABLE");return neon(process.env.DATABASE_URL);};
const derive=promisify(scrypt);
export async function hashTeamPassword(password:string){const salt=randomBytes(16).toString("hex");const hash=await derive(password,salt,64) as Buffer;return `scrypt:${salt}:${hash.toString("hex")}`;}
export async function checkTeamPassword(password:string,stored:string){const [type,salt,hex]=stored.split(":");if(type!=="scrypt"||!salt||!hex||hex.length!==128)return false;const hash=await derive(password,salt,64) as Buffer;return timingSafeEqual(hash,Buffer.from(hex,"hex"));}
export async function commentsPrincipal(request:NextRequest){
  // Main-app sessions keep their RBAC role: only admins act as comments admin.
  const session=await sessionFrom(request);
  if(session){
    const user=await currentUser(request);
    // Do not fall back to a team cookie after a revoked main-app session.
    if(!user)return null;
    return {id:user.id==="env-admin"?"system-admin":user.id,email:user.email,role:(user.role==="admin"?"admin":user.role==="editor"?"editor":"viewer") as CommentRole,systemAdmin:user.role==="admin"};
  }
  const token=await verifyTeamToken(request.cookies.get(TEAM_COOKIE)?.value);if(!token)return null;
  const [member]=await db()`SELECT u.id,u.email,u.role FROM users u JOIN comment_team_members m ON m.user_id=u.id WHERE u.id=${token.id}::uuid AND u.is_active AND m.active AND m.session_version=${token.version}`;
  return member&&["admin","editor","viewer"].includes(String(member.role))?{id:String(member.id),email:String(member.email),role:member.role as CommentRole,systemAdmin:false}:null;
}
export async function loginCommentTeam(email:string,password:string){const [member]=await db()`SELECT u.id,m.password_hash,m.session_version FROM users u JOIN comment_team_members m ON m.user_id=u.id WHERE lower(u.email)=${email.toLowerCase()} AND u.is_active AND m.active`;const valid=await checkTeamPassword(password,member?String(member.password_hash):await hashTeamPassword("dummy-invalid-password"));if(!member||!valid)return null;return teamToken(String(member.id),Number(member.session_version));}
export async function listCommentTeam(){return db()`SELECT u.id,u.name,u.email,u.role,m.active FROM users u JOIN comment_team_members m ON m.user_id=u.id ORDER BY u.name`;
}
export async function createCommentTeam(input:{email:string;name:string;password:string;role:CommentRole}){
  if(input.email.toLowerCase()===(process.env.ADMIN_EMAIL??"").toLowerCase())throw new Error("ADMIN_ACCOUNT_RESERVED");const id=randomUUID();const hash=await hashTeamPassword(input.password);const sql=db();
  await sql.transaction([sql`INSERT INTO users(id,email,name,role) VALUES(${id},${input.email.toLowerCase()},${input.name},${input.role})`,sql`INSERT INTO comment_team_members(user_id,password_hash) VALUES(${id},${hash})`]);return {id};
}
export async function changeCommentTeam(id:string,role:CommentRole,active:boolean){const sql=db();await sql.transaction([sql`UPDATE users SET role=${role},updated_at=now() WHERE id=${id}::uuid AND EXISTS(SELECT 1 FROM comment_team_members WHERE user_id=${id}::uuid)`,sql`UPDATE comment_team_members SET active=${active},session_version=session_version+1 WHERE user_id=${id}::uuid`]);return {ok:true};}
