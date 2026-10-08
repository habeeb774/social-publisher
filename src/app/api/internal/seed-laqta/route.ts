import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, facebookPages, posts } from "@/db/schema";

export const dynamic = "force-dynamic";

const SEED_TAG = "laqta-organic-2026-10";
const CAMPAIGN_NAME = "منصة لقطة — محتوى المصورين أكتوبر 2026";

const ideas = [
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "نصائح_تصوير", "مصورين"],
    content: `المصور المحترف ما يبدأ بالكاميرا… يبدأ بالسؤال الصح. 📸

قبل أي جلسة تصوير، اسأل عميلك:
• ما الهدف من الصور؟
• أين ستُستخدم؟
• ما الأسلوب الذي يعجبه؟
• هل توجد لقطات أساسية لا يمكن تفويتها؟

10 دقائق فهم قبل التصوير ممكن تختصر عليك ساعات من التعديلات بعده.

#منصة_لقطة #نصائح_تصوير #مصورين`,
  },
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "ملف_المصور", "تصوير"],
    content: `ملفك الشخصي هو أول جلسة تصوير لك… حتى قبل ما يقابلك العميل.

خلّ وصفك مختصر وواضح:
“مصور حفلات ومناسبات — الرياض — خبرة 5 سنوات — تسليم خلال 5 أيام.”

العميل ما يحتاج كلام كثير؛ يحتاج يعرف بسرعة: تخصصك، مدينتك، أسلوبك، وكيف يحجزك.

حدّث ملفك في لقطة وخله يتكلم عنك. ✨

#منصة_لقطة #مصورين #تصوير`,
  },
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "تسعير_التصوير", "مصورين"],
    content: `لا تسعّر جلسة التصوير على “ساعة تصوير” فقط.

سعرك يشمل:
التجهيز + الانتقال + وقت التصوير + الفرز + التعديل + التسليم + خبرتك.

إذا حسبت الكاميرا فقط، غالبًا أنت تقلل من قيمة شغلك بدون ما تشعر.

اكتب باقتك بوضوح، وحدد ماذا يحصل العميل مقابل السعر.

#منصة_لقطة #تسعير_التصوير #مصورين`,
  },
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "بورتفوليو", "تصوير"],
    content: `البورتفوليو القوي ما يحتاج 100 صورة.

أحيانًا 12 صورة ممتازة أقوى من 80 صورة مستواها متفاوت.

اختر أعمالك التي تمثل:
• أسلوبك
• تخصصك
• جودة التعديل
• تنوع المواقف

قاعدة بسيطة: إذا الصورة ما تقنع العميل يحجزك، لا تجعلها في الواجهة.

#منصة_لقطة #بورتفوليو #تصوير`,
  },
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "إضاءة", "تصوير"],
    content: `قبل ما تشتري إضاءة جديدة… تعلّم تستفيد من النافذة. 💡

الضوء الطبيعي الناعم من جانب واحد يصنع عمقًا جميلًا للوجه والمنتج، خصوصًا قرب نافذة كبيرة ومع ستارة خفيفة.

المعدات تساعدك، لكن فهم الضوء هو اللي يصنع الفرق.

#منصة_لقطة #إضاءة #تصوير`,
  },
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "تجربة_العميل", "مصورين"],
    content: `أفضل المصورين ما يبيعون صور فقط… يبيعون راحة.

أرسل للعميل قبل الموعد:
الموقع، وقت الوصول، مدة الجلسة، ماذا يجهز، ومتى يستلم الصور.

كل سؤال تجيب عنه قبل ما يُسأل = تجربة أهدأ وثقة أعلى.

#منصة_لقطة #تجربة_العميل #مصورين`,
  },
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "نسخ_احتياطي", "مصورين"],
    content: `قاعدة المصور الذكي: لا توجد صورة مهمة بنسخة واحدة.

بعد أي مناسبة:
1) لا تفرمت الذاكرة مباشرة.
2) انسخ الملفات على جهازك.
3) احتفظ بنسخة ثانية في قرص أو سحابة.

جلسة لا يمكن إعادتها تستحق خطة نسخ احتياطي حقيقية.

#منصة_لقطة #مصورين #نصائح_تصوير`,
  },
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "تسليم_الصور", "تصوير"],
    content: `سرعة التسليم مهمة… لكن الوعد الواقعي أهم.

لا تقل “بكرة” إذا شغلك يحتاج 5 أيام.
حدد موعدًا واضحًا من البداية، وإذا قدرت تسلّم قبل الموعد بتكون مفاجأة جميلة للعميل بدل ما تكون متأخرًا.

الثقة تبدأ من إدارة التوقعات.

#منصة_لقطة #تسليم_الصور #تصوير`,
  },
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "تصوير_أعراس", "مصورين"],
    content: `في تصوير الأعراس، لا تطارد اللقطات المثالية فقط… راقب اللحظات الصغيرة.

نظرة الأم، ضحكة عفوية، يد تمسك يد، تفاصيل اللبس، وردة على الطاولة.

هذه الصور غالبًا هي التي تعيد لصاحب المناسبة الشعور بعد سنوات.

#منصة_لقطة #تصوير_أعراس #مصورين`,
  },
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "تصوير_منتجات", "تصوير"],
    content: `صورة المنتج الناجحة تجاوب على سؤال واحد: “كيف يبدو المنتج فعلًا؟”

اهتم بـ:
• لون واقعي
• خلفية نظيفة
• زاوية واضحة
• تفاصيل الخامة
• صورة استخدام واقعية عند الحاجة

لا تجعل المؤثرات تخفي المنتج الذي تحاول بيعه.

#منصة_لقطة #تصوير_منتجات #تصوير`,
  },
  {
    category: "تفاعل",
    tags: ["منصة_لقطة", "مصورين", "سؤال"],
    content: `للمصورين 👇
لو اضطررت تختار عدسة واحدة فقط لمدة سنة كاملة… أي عدسة تختار؟

35mm؟ 50mm؟ 85mm؟ أو اختيار ثاني؟

اكتب اختيارك وقل لنا ليش. 📷

#منصة_لقطة #مصورين #تصوير`,
  },
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "مصور_مبتدئ", "تصوير"],
    content: `3 أخطاء تبطئ تطور المصور المبتدئ:

1) تغيير المعدات باستمرار بدل إتقان الموجودة.
2) تعديل كل صورة بأسلوب مختلف.
3) انتظار “الوقت المناسب” بدل التصوير والتجربة.

أفضل تمرين؟ اختر موضوعًا واحدًا وصوره 20 مرة بإضاءات وزوايا مختلفة.

#منصة_لقطة #مصور_مبتدئ #تصوير`,
  },
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "تعديل_الصور", "مصورين"],
    content: `التعديل الجيد ما يخلي العميل يقول: “واضح عليها تعديل.”
يخليه يقول: “الصورة جميلة.”

حافظ على لون البشرة، لا تبالغ في الحدة، وثبّت أسلوب الألوان في كامل الألبوم.

الاتساق يصنع هوية للمصور أكثر من أي فلتر جاهز.

#منصة_لقطة #تعديل_الصور #مصورين`,
  },
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "مواقع_تصوير", "تصوير"],
    content: `زيارة موقع التصوير قبل الموعد ممكن تنقذك من مفاجآت كثيرة.

شوف:
اتجاه الشمس، مواقف السيارات، الزحام، أماكن الظل، نقاط الكهرباء، والخلفيات المزعجة.

المصور المحترف يحل المشاكل قبل ما تظهر في الكادر.

#منصة_لقطة #مواقع_تصوير #تصوير`,
  },
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "اتفاق_التصوير", "مصورين"],
    content: `الاتفاق الواضح يحمي المصور والعميل معًا.

قبل التأكيد، وضّح:
عدد الساعات، عدد الصور، أسلوب التعديل، موعد التسليم، سياسة التأجيل، وما الذي يشمله السعر.

كلما كانت التفاصيل واضحة، قلت الخلافات بعد الجلسة.

#منصة_لقطة #مصورين #تجربة_العميل`,
  },
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "إدارة_الوقت", "مصورين"],
    content: `لا تحجز جلستين متتاليتين بدون وقت احتياطي.

30 دقيقة إضافية بين المواعيد ممكن تغطي:
تأخر العميل، زحمة الطريق، ترتيب المعدات، أو نسخ الملفات.

جدول مضغوط جدًا يحوّل أي تأخير بسيط إلى يوم كامل من التوتر.

#منصة_لقطة #إدارة_الوقت #مصورين`,
  },
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "تقييمات", "مصورين"],
    content: `بعد ما تسلّم العميل وتضمن رضاه… اطلب التقييم.

التقييم الحقيقي يساعد العميل القادم يثق بك أسرع، ويعطيك أنت ملاحظات تعرف منها نقاط قوتك.

لا تنتظر التقييم يجي لوحده؛ اطلبه بأسلوب بسيط ومحترم.

#منصة_لقطة #تقييمات #مصورين`,
  },
  {
    category: "تفاعل",
    tags: ["منصة_لقطة", "مصورين", "تحدي_تصوير"],
    content: `تحدي لقطة اليوم 📸

صوّر شيئًا عاديًا جدًا حولك — كوب، مفتاح، كرسي، نافذة — لكن حاول تخليه يبدو كأنه إعلان احترافي.

الفكرة ليست في الشيء… الفكرة في الضوء والزاوية والتكوين.

وش اخترت تصوّر؟

#منصة_لقطة #تحدي_تصوير #مصورين`,
  },
  {
    category: "أخبار",
    tags: ["منصة_لقطة", "حجز_مصور", "السعودية"],
    content: `في منصة لقطة، هدفنا نخلي الوصول للمصور المناسب أسهل، ونخلي شغل المصور المحترف يظهر للعميل بشكل أوضح.

إذا كنت مصورًا: اهتم بملفك، أعمالك، تخصصك وتقييماتك.
وإذا كنت عميلًا: قارن الأسلوب والخبرة قبل ما تقارن السعر فقط.

الصورة المناسبة تبدأ من اختيار المصور المناسب. ✨

#منصة_لقطة #حجز_مصور #السعودية`,
  },
  {
    category: "محتوى تعليمي",
    tags: ["منصة_لقطة", "اختيار_مصور", "تصوير"],
    content: `كيف تختار مصورًا لمناسبتك؟

لا تعتمد على أجمل صورة في حسابه فقط.
شاهد مجموعة كاملة من أعماله، وتأكد من:
• أسلوبه قريب من ذوقك
• عنده خبرة بنوع مناسبتك
• التسليم واضح
• التواصل مريح
• التقييمات جيدة

السعر مهم، لكن النتيجة التي ستبقى معك أهم.

#منصة_لقطة #اختيار_مصور #تصوير`,
  },
] as const;

function equal(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function seed(request: NextRequest, body: { dryRun?: boolean; pageId?: string }, provided: string) {
  const expected = process.env.CONTENT_SEED_TOKEN?.trim();
  if (!expected || !provided || !equal(expected, provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const matches = await db.select({
    id: facebookPages.id,
    name: facebookPages.name,
    facebookPageId: facebookPages.facebookPageId,
  }).from(facebookPages).where(and(
    eq(facebookPages.isActive, true),
    eq(facebookPages.platform, "facebook"),
    ilike(facebookPages.name, "%لقطة%"),
  ));

  if (body.dryRun || !body.pageId) {
    return NextResponse.json({
      matches,
      planned: ideas.length,
      start: "2026-10-09T20:30:00+03:00",
      cadence: "يوميًا",
    });
  }

  const page = matches.find((item) => item.id === body.pageId);
  if (!page) return NextResponse.json({ error: "LAQTA_PAGE_NOT_FOUND", matches }, { status: 404 });

  const [existing] = await db.select({ count: sql<number>`count(*)::int` }).from(posts).where(and(
    eq(posts.pageId, page.id),
    sql`${posts.tags} @> ARRAY[${SEED_TAG}]::text[]`,
  ));
  if ((existing?.count ?? 0) > 0) {
    return NextResponse.json({ ok: true, page: page.name, inserted: 0, existing: existing.count, idempotent: true });
  }

  let [campaign] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.name, CAMPAIGN_NAME)).limit(1);
  if (!campaign) {
    [campaign] = await db.insert(campaigns).values({
      name: CAMPAIGN_NAME,
      description: "محتوى عضوي لمنصة لقطة: نصائح للمصورين، تجربة العميل، تفاعل وتوعية.",
      startDate: "2026-10-09",
      endDate: "2026-10-28",
      status: "active",
    }).returning({ id: campaigns.id });
  }

  const existingTimes = await db.select({ scheduledAt: posts.scheduledAt }).from(posts).where(and(
    eq(posts.pageId, page.id),
    sql`${posts.scheduledAt} >= '2026-10-09T00:00:00+03:00'::timestamptz`,
  ));
  const occupied = new Set(existingTimes.flatMap((row) => row.scheduledAt ? [row.scheduledAt.toISOString().slice(0, 16)] : []));
  const inserted: Array<{ id: string; scheduledAt: string }> = [];

  for (let i = 0; i < ideas.length; i++) {
    const day = new Date(Date.UTC(2026, 9, 9 + i, 17, 30));
    let candidate = day;
    for (const minutes of [0, 30, 60, -60]) {
      const proposed = new Date(day.getTime() + minutes * 60000);
      if (!occupied.has(proposed.toISOString().slice(0, 16))) {
        candidate = proposed;
        break;
      }
    }
    occupied.add(candidate.toISOString().slice(0, 16));
    const idea = ideas[i];
    const [row] = await db.insert(posts).values({
      pageId: page.id,
      content: idea.content,
      scheduledAt: candidate,
      timezone: "Asia/Riyadh",
      status: "scheduled",
      campaignId: campaign.id,
      category: idea.category,
      tags: [...idea.tags, SEED_TAG, `laqta-${String(i + 1).padStart(2, "0")}`],
      inQueue: false,
    }).returning({ id: posts.id, scheduledAt: posts.scheduledAt });
    inserted.push({ id: row.id, scheduledAt: row.scheduledAt!.toISOString() });
  }

  return NextResponse.json({
    ok: true,
    page: { id: page.id, name: page.name, facebookPageId: page.facebookPageId },
    campaignId: campaign.id,
    inserted: inserted.length,
    schedule: inserted,
  });
}


export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { dryRun?: boolean; pageId?: string };
  const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  return seed(request, body, provided);
}

export async function GET(request: NextRequest) {
  const provided = request.nextUrl.searchParams.get("key") ?? "";
  const pageId = request.nextUrl.searchParams.get("pageId") ?? undefined;
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  return seed(request, { pageId, dryRun }, provided);
}
