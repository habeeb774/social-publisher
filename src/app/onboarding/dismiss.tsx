"use client";
import { useRouter } from "next/navigation";
import { api } from "../ui/api";

export function DismissOnboarding() {
  const router = useRouter();
  return <button className="btn btn-secondary" onClick={async () => { await api("/api/settings/onboarding", { method: "PUT", body: { dismissed: true } }); router.push("/dashboard"); }}>إخفاء المعالج</button>;
}
