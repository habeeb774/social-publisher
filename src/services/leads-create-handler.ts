import { NextRequest, NextResponse } from "next/server";
import { leadCreateSchema, type LeadCreateInput } from "./leads-create";
import { can, type CurrentUser } from "./rbac";

type Dependencies = {
  authorize: (request: NextRequest) => Promise<Response | null>;
  user: (request: NextRequest) => Promise<CurrentUser | null>;
  scope: (user: CurrentUser) => Promise<ReadonlySet<string> | null>;
  insert: (input: LeadCreateInput, scope: ReadonlySet<string> | null) => Promise<boolean>;
  retry: (input: LeadCreateInput, scope: ReadonlySet<string> | null) => Promise<boolean>;
  audit: (id: string) => Promise<void>;
};

export function createLeadPostHandler(dependencies: Dependencies) {
  return async function POST(request: NextRequest) {
    try {
      const denied = await dependencies.authorize(request);
      if (denied) return denied;
      const parsed = leadCreateSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return NextResponse.json({ error: "تحقق من اسم العميل والصفحة والبيانات المدخلة." }, { status: 400 });
      const user = await dependencies.user(request);
      if (!user) return NextResponse.json({ error: "يرجى تسجيل الدخول" }, { status: 401 });
      if (!can(user.role,"leads.create")) return NextResponse.json({ error: "ليست لديك صلاحية لإضافة عميل." }, { status: 403 });
      const allowed = await dependencies.scope(user);
      if (allowed !== null && !allowed.has(parsed.data.pageId)) return NextResponse.json({ error: "الصفحة غير متاحة لك." }, { status: 404 });
      if (await dependencies.insert(parsed.data, allowed)) {
        await dependencies.audit(parsed.data.id);
        return NextResponse.json({ id: parsed.data.id }, { status: 201 });
      }
      // Separate statement sees a concurrent insertion after ON CONFLICT waited for it.
      if (await dependencies.retry(parsed.data, allowed)) return NextResponse.json({ id: parsed.data.id });
      return NextResponse.json({ error: "تعذر الإضافة: الصفحة غير متاحة أو الطلب سبق استخدامه ببيانات أخرى. أعد تحميل النموذج." }, { status: 409 });
    } catch {
      console.error("Lead creation unavailable", { code: "LEAD_CREATE_FAILED" });
      return NextResponse.json({ error: "تعذر إضافة العميل. بيانات النموذج محفوظة هنا؛ حاول مجددًا." }, { status: 503 });
    }
  };
}
