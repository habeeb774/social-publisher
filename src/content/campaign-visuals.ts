export type CampaignVisualTheme = { category: string; title: string };

const VISUAL_THEMES: CampaignVisualTheme[] = [
  {
    "category": "استراتيجية",
    "title": "تدقيق الأتمتة قبل البناء"
  },
  {
    "category": "استراتيجية",
    "title": "حوّل الـSOP إلى Workflow"
  },
  {
    "category": "تقنية",
    "title": "Webhooks بدل الفحص اليدوي"
  },
  {
    "category": "تقنية",
    "title": "API هو جسر الأنظمة"
  },
  {
    "category": "بيانات",
    "title": "نظّف البيانات قبل الأتمتة"
  },
  {
    "category": "بيانات",
    "title": "التطبيع يمنع الفوضى"
  },
  {
    "category": "مبيعات",
    "title": "تأهيل العملاء المحتملين"
  },
  {
    "category": "مبيعات",
    "title": "CRM يتحدث بدل أن يصمت"
  },
  {
    "category": "مبيعات",
    "title": "متابعة العروض بدون نسيان"
  },
  {
    "category": "مبيعات",
    "title": "إنشاء عروض السعر آليًا"
  },
  {
    "category": "مالية",
    "title": "تذكير الفواتير المستحقة"
  },
  {
    "category": "تجارة إلكترونية",
    "title": "تنبيه المخزون قبل النفاد"
  },
  {
    "category": "تجربة العميل",
    "title": "Onboarding يبدأ بعد البيع"
  },
  {
    "category": "خدمة العملاء",
    "title": "فرز التذاكر حسب الموضوع"
  },
  {
    "category": "خدمة العملاء",
    "title": "قاعدة معرفة قبل الرد الذكي"
  },
  {
    "category": "خدمة العملاء",
    "title": "قواعد التصعيد أهم من الرد"
  },
  {
    "category": "خدمة العملاء",
    "title": "وجّه التعليق حسب نيته"
  },
  {
    "category": "إدارة",
    "title": "الاجتماع يجب أن ينتج مهامًا"
  },
  {
    "category": "إدارة",
    "title": "من البريد إلى مهمة تلقائيًا"
  },
  {
    "category": "إدارة",
    "title": "جدولة المواعيد بدون رسائل ذهاب وإياب"
  },
  {
    "category": "مستندات",
    "title": "معالجة المستندات كسير عمل"
  },
  {
    "category": "بيانات",
    "title": "استخراج البيانات من الملفات"
  },
  {
    "category": "بيانات",
    "title": "نماذج الإدخال تحتاج تحققًا"
  },
  {
    "category": "عمليات",
    "title": "الموافقة الآلية لا تعني غياب الإنسان"
  },
  {
    "category": "موثوقية",
    "title": "صمّم مسار الاستثناءات"
  },
  {
    "category": "موثوقية",
    "title": "Retry بذكاء لا بعناد"
  },
  {
    "category": "موثوقية",
    "title": "Idempotency تمنع التكرار"
  },
  {
    "category": "موثوقية",
    "title": "راقب الأتمتة لا تفترض نجاحها"
  },
  {
    "category": "موثوقية",
    "title": "Logs مفهومة لا ضوضاء"
  },
  {
    "category": "موثوقية",
    "title": "التنبيه يجب أن يقود لفعل"
  },
  {
    "category": "حوكمة",
    "title": "Human in the Loop بشكل عملي"
  },
  {
    "category": "أمان",
    "title": "الأسرار ليست حقول نصية"
  },
  {
    "category": "أمان",
    "title": "أقل صلاحية تكفي"
  },
  {
    "category": "أمان",
    "title": "البيانات الحساسة تحتاج حدودًا"
  },
  {
    "category": "استمرارية",
    "title": "النسخ الاحتياطي جزء من الأتمتة"
  },
  {
    "category": "استمرارية",
    "title": "Versioning يمنع الخوف من التعديل"
  },
  {
    "category": "جودة",
    "title": "اختبر الأتمتة قبل العميل"
  },
  {
    "category": "جودة",
    "title": "Staging يحمي الإنتاج"
  },
  {
    "category": "قياس",
    "title": "قِس الوقت المستعاد"
  },
  {
    "category": "قياس",
    "title": "قِس معدل الخطأ قبل وبعد"
  },
  {
    "category": "قياس",
    "title": "SLA واضح لكل عملية"
  },
  {
    "category": "تكلفة",
    "title": "راقب تكلفة الأدوات"
  },
  {
    "category": "تكلفة",
    "title": "تكلفة الذكاء الاصطناعي قابلة للتحكم"
  },
  {
    "category": "ذكاء اصطناعي",
    "title": "وجّه المهمة للنموذج المناسب"
  },
  {
    "category": "ذكاء اصطناعي",
    "title": "Prompt له إصدار واختبار"
  },
  {
    "category": "ذكاء اصطناعي",
    "title": "RAG قبل الحفظ عن ظهر قلب"
  },
  {
    "category": "ذكاء اصطناعي",
    "title": "قاعدة المعرفة تحتاج صيانة"
  },
  {
    "category": "ذكاء اصطناعي",
    "title": "Agent ليس بديلًا لكل Workflow"
  },
  {
    "category": "ذكاء اصطناعي",
    "title": "Tool Use يحتاج صلاحيات محدودة"
  },
  {
    "category": "ذكاء اصطناعي",
    "title": "كثرة الوكلاء ليست ذكاءً"
  },
  {
    "category": "ذكاء اصطناعي",
    "title": "Structured Output يقلل الفوضى"
  },
  {
    "category": "ذكاء اصطناعي",
    "title": "درجة الثقة تقود المسار"
  },
  {
    "category": "ذكاء اصطناعي",
    "title": "Guardrails قبل السرعة"
  },
  {
    "category": "ذكاء اصطناعي",
    "title": "قيّم المخرجات بعينات حقيقية"
  },
  {
    "category": "ذكاء اصطناعي",
    "title": "قلل الهلوسة بالمصادر"
  },
  {
    "category": "ذكاء اصطناعي",
    "title": "أضف قواعد حتمية حول AI"
  },
  {
    "category": "تجارة إلكترونية",
    "title": "من الطلب إلى التنفيذ تلقائيًا"
  },
  {
    "category": "تجارة إلكترونية",
    "title": "السلة المتروكة تحتاج توقيتًا"
  },
  {
    "category": "تجارة إلكترونية",
    "title": "اطلب التقييم في الوقت المناسب"
  },
  {
    "category": "تجارة إلكترونية",
    "title": "المرتجعات Workflow لا فوضى"
  },
  {
    "category": "تجارة إلكترونية",
    "title": "تحديثات الشحن تقلل الأسئلة"
  },
  {
    "category": "مشتريات",
    "title": "أتمتة طلبات الشراء"
  },
  {
    "category": "موارد بشرية",
    "title": "Onboarding الموظف كنظام"
  },
  {
    "category": "موارد بشرية",
    "title": "تنبيه الحضور بالاستثناء"
  },
  {
    "category": "موارد بشرية",
    "title": "الفرز الأولي للطلبات"
  },
  {
    "category": "مالية",
    "title": "المطابقة المالية تقلل النسخ"
  },
  {
    "category": "مالية",
    "title": "المصاريف تحتاج مسار اعتماد"
  },
  {
    "category": "تسويق",
    "title": "Lead Nurturing يعتمد على السلوك"
  },
  {
    "category": "محتوى",
    "title": "إعادة تدوير المحتوى بذكاء"
  },
  {
    "category": "محتوى",
    "title": "استمع للإشارات قبل صناعة المحتوى"
  },
  {
    "category": "محتوى",
    "title": "إدارة التعليقات جزء من المحتوى"
  },
  {
    "category": "محتوى",
    "title": "الرد الآلي يحتاج شخصية وحدودًا"
  },
  {
    "category": "خدمة العملاء",
    "title": "الشكاوى لا تدخل Auto Reply عمياء"
  },
  {
    "category": "تحليلات",
    "title": "Dashboard تجيب عن سؤال"
  },
  {
    "category": "تحليلات",
    "title": "التقرير الأسبوعي يجب أن يفسر"
  },
  {
    "category": "إدارة",
    "title": "الملخص التنفيذي ليس نسخة مصغرة من التقرير"
  },
  {
    "category": "مستندات",
    "title": "أنشئ المستند من البيانات لا النسخ"
  },
  {
    "category": "مبيعات",
    "title": "Proposal أسرع بدون فقدان التخصيص"
  },
  {
    "category": "بيانات",
    "title": "مزامنة الأنظمة تحتاج مصدر حقيقة"
  },
  {
    "category": "بيانات",
    "title": "إزالة التكرار قبل التحليل"
  },
  {
    "category": "تقنية",
    "title": "الأنظمة القديمة يمكن ربطها تدريجيًا"
  },
  {
    "category": "تقنية",
    "title": "No-code أم Code؟"
  },
  {
    "category": "استراتيجية",
    "title": "Build أم Buy؟"
  },
  {
    "category": "توسع",
    "title": "الأتمتة الناجحة تحتاج قابلية توسع"
  },
  {
    "category": "حوكمة",
    "title": "ضع مالكًا لكل Automation"
  },
  {
    "category": "حوكمة",
    "title": "سجل التغيير يحمي الفريق"
  },
  {
    "category": "حوكمة",
    "title": "راجع الأتمتات القديمة دوريًا"
  },
  {
    "category": "استراتيجية",
    "title": "من Automation إلى Operating System"
  },
  {
    "category": "استراتيجية",
    "title": "صمم الأحداث قبل الشاشات"
  },
  {
    "category": "موثوقية",
    "title": "استخدم Queue للأعمال الثقيلة"
  }
];

export function getCampaignVisual(postNumber: number) {
  const n = Math.max(1, Math.min(180, Math.trunc(postNumber) || 1));
  const day = Math.floor((n - 1) / 2);
  const theme = VISUAL_THEMES[day];
  return {
    ...theme,
    postNumber: n,
    slot: n % 2 === 0 ? "evening" as const : "morning" as const,
  };
}
