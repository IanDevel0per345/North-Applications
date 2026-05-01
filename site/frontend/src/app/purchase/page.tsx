import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/config/getSession";
import { PurchaseClient } from "@/components/ui/purchase/PurchaseClient";

type PurchaseIndexPageProps = {
  searchParams?: Promise<{ plan?: string | string[] }>;
};

export default async function PurchaseIndexPage({ searchParams }: PurchaseIndexPageProps) {
  const params = await searchParams;
  const planId = Array.isArray(params?.plan) ? params?.plan[0] : params?.plan;
  if (!planId) {
    redirect("/pricing");
  }

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") || hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") || "http";
  const base = process.env.NEXT_PUBLIC_BASE_URL || (host ? `${proto}://${host}` : "");
  if (!base) {
    notFound();
  }
  const res = await fetch(`${base}/api/info/plans`, { cache: "no-store" });
  if (!res.ok) {
    notFound();
  }
  const data = await res.json();
  const plans: any[] = Array.isArray(data?.plans) ? data.plans : [];
  const plan = plans.find((p) => p.id === planId);
  if (!plan) notFound();

  const serializablePlan = {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    primary: plan.primary,
    features: plan.features,
    plans: (plan.plans as any[]).map((v: any) => ({
      id: v.id,
      name: v.name,
      value: v.value,
      description: v.description,
      discount: v.discount,
      months: v.months,
    })),
  };

  return <PurchaseClient plan={serializablePlan} />;
}
