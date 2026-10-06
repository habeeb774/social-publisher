import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, posts, publicationAttempts, schedulerRuns } from "@/db/schema";
import { isGraphConfigured } from "./facebook-graph";
import { storageProvider } from "./storage";
import { getSetting } from "./settings-store";

export type SetupStep = { key: string; label: string; done: boolean; optional?: boolean; href: string; help: string };

/** Setup steps derived from real system state (nothing is self-reported). */
export async function setupProgress() {
  const db = getDb();
  let dbOk = true;
  let pageCount = 0, postCount = 0, lastRun: Date | null = null, testedOrPublished = 0;
  try {
    const [[p], [c], [r], [t]] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(facebookPages).where(eq(facebookPages.isActive, true)),
      db.select({ n: sql<number>`count(*)::int` }).from(posts),
      db.select({ at: schedulerRuns.triggeredAt }).from(schedulerRuns).orderBy(desc(schedulerRuns.triggeredAt)).limit(1),
      db.select({ n: sql<number>`count(*)::int` }).from(publicationAttempts).where(sql`${publicationAttempts.status} in ('DRY_RUN_SUCCESS','success')`),
    ]);
    pageCount = p?.n ?? 0; postCount = c?.n ?? 0; lastRun = r?.at ?? null; testedOrPublished = t?.n ?? 0;
  } catch { dbOk = false; }
  const dismissed = dbOk ? await getSetting("onboarding_dismissed", false).catch(() => false) : false;
  const steps: SetupStep[] = [
    { key: "account", label: "إعداد الحساب وقاعدة البيانات", done: dbOk && Boolean(process.env.ADMIN_EMAIL), href: "/status", help: "قاعدة البيانات تحفظ منشوراتك ومواعيدها." },
    { key: "facebook", label: "ربط Facebook", done: pageCount > 0 && (isGraphConfigured() || Boolean(process.env.WINDSOR_API_KEY)), href: "/pages", help: "يحتاج النظام صفحة متصلة وتوكن نشر حتى يستطيع النشر نيابة عنك." },
    { key: "storage", label: "تخزين الصور", done: storageProvider.configured(), optional: true, href: "/media", help: "اختياري: يسمح برفع الصور من جهازك. بدونه أضف الصور بروابط مباشرة." },
    { key: "scheduler", label: "تشغيل الجدولة", done: Boolean(lastRun && Date.now() - lastRun.getTime() < 25 * 60000), href: "/status", help: "خدمة تستدعي عامل النشر كل 10 دقائق حتى تُنشر المنشورات في موعدها." },
    { key: "first_post", label: "إنشاء أول منشور", done: postCount > 0, href: "/posts/new", help: "اكتب منشورًا واحفظه كمسودة أو جدوله." },
    { key: "safe_test", label: "اختبار النشر", done: testedOrPublished > 0, href: "/settings/integrations", help: "وضع الاختبار يجرب كل الخطوات دون نشر فعلي؛ أو انشر منشورًا حقيقيًا واحدًا." },
  ];
  const required = steps.filter((s) => !s.optional);
  const percent = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
  return { steps, percent, complete: required.every((s) => s.done), dismissed };
}
