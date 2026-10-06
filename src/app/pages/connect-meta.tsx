"use client";
import Link from "next/link";
import { Icon } from "../ui/icons";

export function ConnectMetaButton({ configured }: { configured: boolean }) {
  if (!configured) {
    return <button
      type="button"
      className="btn btn-primary"
      disabled
      title="أضف META_APP_ID و META_APP_SECRET في Vercel لتفعيل الربط التلقائي"
    >
      <Icon name="facebook" width={16} />إضافة حساب Meta
    </button>;
  }
  return <Link className="btn btn-primary" href="/api/meta/oauth/start">
    <Icon name="facebook" width={16} />إضافة حساب Facebook / Meta
  </Link>;
}
