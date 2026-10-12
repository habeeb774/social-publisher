import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { posts, settings } from "@/db/schema";
import { politicsTargetPage } from "./politics-autopost";

// Small verified starter library. Stop at exhaustion rather than recycle or spam.
const ITEMS: ReadonlyArray<readonly [string, string]> = [
  [
    "تقنية",
    "تفعيل المصادقة الثنائية يزيد حماية الحساب حتى عند تسرب كلمة المرور."
  ],
  [
    "معلومة عامة",
    "يصل ضوء الشمس إلى الأرض خلال نحو ثماني دقائق وعشرين ثانية."
  ],
  [
    "نصيحة",
    "تحقق من عنوان الرابط قبل إدخال كلمة المرور في أي موقع."
  ],
  [
    "تقنية",
    "HTTPS يشفر الاتصال لكنه لا يثبت أن الموقع نفسه موثوق."
  ],
  [
    "معلومة عامة",
    "الصوت يحتاج إلى وسط مادي ولا ينتقل في الفراغ."
  ],
  [
    "نصيحة",
    "استخدم كلمة مرور مختلفة لكل حساب مهم."
  ],
  [
    "تقنية",
    "DNS يحول أسماء المواقع إلى عناوين IP."
  ],
  [
    "معلومة عامة",
    "القمر يعكس ضوء الشمس ولا يصدر ضوءًا من ذاته."
  ],
  [
    "نصيحة",
    "احتفظ بنسخة احتياطية من ملفاتك المهمة خارج جهازك."
  ],
  [
    "تقنية",
    "ذاكرة RAM مؤقتة بينما يحتفظ SSD بالملفات بعد إيقاف التشغيل."
  ],
  [
    "معلومة عامة",
    "يتمدد الماء عند تجمده، ولذلك يطفو الجليد فوق الماء."
  ],
  [
    "نصيحة",
    "راجع أذونات التطبيقات واحذف غير الضروري منها."
  ]
];

/** Queue up to ten one-minute slots ahead; publishing cadence depends on external cron. */
export async function enqueueMixedFacts(now = new Date()) {
  const db = getDb();
  const page = await politicsTargetPage();
  if (!page) return { created: 0, reason: "PAGE_UNAVAILABLE" };
  const base = Math.floor(now.getTime() / 60000);
  let created = 0;
  for (let offset = 0; offset < 10; offset++) {
    const slot = base + offset;
    const slotKey = `mixed_facts_slot:${page.facebookPageId}:${slot}`;
    const [claimed] = await db.insert(settings).values({ key: slotKey, value: now.toISOString() }).onConflictDoNothing().returning({ key: settings.key });
    if (!claimed) continue;
    // Stable sequence per minute. Never repeat items after the starter library is exhausted.
    const originKey = `mixed_facts_origin:${page.facebookPageId}`;
    const [origin] = await db.insert(settings).values({ key: originKey, value: String(slot) }).onConflictDoNothing().returning({ value: settings.value });
    const [saved] = origin ? [origin] : await db.select({ value: settings.value }).from(settings).where(eq(settings.key, originKey)).limit(1);
    const index = slot - Number(saved?.value ?? slot);
    if (index < 0 || index >= ITEMS.length) return { created, reason: "CONTENT_EXHAUSTED" };
    const [category, fact] = ITEMS[index];
    await db.insert(posts).values({ pageId: page.id, content: `💡 ${category}\n\n${fact}\n\n#معلومات #نصائح #تقنية`, scheduledAt: new Date(slot * 60000), timezone: "Asia/Riyadh", status: "scheduled", category, tags: ["معلومات", category] });
    created++;
  }
  return { created, reason: "QUEUED" };
}
