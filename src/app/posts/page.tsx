import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { posts, facebookPages } from "@/db/schema";
import { AppShell } from "../ui/app-shell";
import { EmptyState } from "../ui/empty-state";

export const dynamic = "force-dynamic";
const labels: Record<string,string> = {draft:"مسودة", scheduled:"مجدول", publishing:"جارٍ النشر", published:"منشور", failed:"فشل", cancelled:"ملغي", archived:"مؤرشف"};
const format = (value: Date | null) => value ? new Intl.DateTimeFormat("ar-SA", {timeZone:"Asia/Riyadh", dateStyle:"medium",timeStyle:"short"}).format(value) : "—";
export default async function Posts(){
  let rows: Array<{post: typeof posts.$inferSelect; pageName: string | null}> = [];
  let failed = false;
  try { rows = await getDb().select({post:posts,pageName:facebookPages.name}).from(posts).leftJoin(facebookPages,eq(posts.pageId,facebookPages.id)).orderBy(desc(posts.createdAt)); } catch { failed = true; }
  return <AppShell title="المنشورات"><div className="page-intro"><div><h2>كل محتواك في مكان واحد</h2><p>إدارة المحتوى المجدول والمنشور والمسودات · {rows.length} منشور</p></div><Link className="primary-button" href="/posts/new">＋ منشور جديد</Link></div><div className="panel-card table-card posts-table">{failed ? <div role="alert" className="banner">تعذر تحميل المنشورات من قاعدة البيانات. أعد تحميل الصفحة للمحاولة.</div> : rows.length ? <div style={{overflowX:"auto"}}><table style={{width:"100%",textAlign:"right",borderCollapse:"collapse"}}><thead><tr>{["المحتوى","الصفحة","موعد النشر (الرياض)","الحالة","الإجراء"].map(label=><th key={label} style={{padding:16}}>{label}</th>)}</tr></thead><tbody>{rows.map(({post,pageName})=><tr key={post.id}><td style={{padding:16,whiteSpace:"pre-wrap"}}>{post.content}</td><td style={{padding:16}}>{pageName ?? "صفحة غير متاحة"}</td><td style={{padding:16}}>{format(post.scheduledAt)}</td><td style={{padding:16}}>{labels[post.status]}{post.lastError&&<small style={{display:"block",color:"#c2410c"}}>{post.lastError}</small>}</td><td style={{padding:16}}><Link href={`/posts/${post.id}`}>التفاصيل</Link></td></tr>)}</tbody></table></div> : <EmptyState title="لا توجد منشورات بعد" description="ابدأ بإنشاء أول منشور وجدولته." action={<Link className="primary-button" href="/posts/new">إنشاء أول منشور</Link>}/>}</div></AppShell>;
}
