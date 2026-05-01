"use client";

import { useEffect, useState } from "react";
import { Button, Chip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faFire, faXmark, faGift, faInfinity } from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

type Feature = { title: string; unavailable?: boolean };
type PlanOption = { id: string; name: string; value: number; discount?: number; months: number; description?: string };
type Plan = { id: string; name: string; description?: string; primary?: boolean; isFree?: boolean; features: Feature[]; plans: PlanOption[] };

export function PlansGrid() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canCreateFree, setCanCreateFree] = useState<boolean | null>(null);
  const [creatingFree, setCreatingFree] = useState(false);
  const [freePlanData, setFreePlanData] = useState<Plan | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    async function fetchPlans() {
      try {
        setLoading(true);
        const res = await fetch("/api/info/plans", { cache: "no-store" });
        if (!res.ok) throw new Error("Erro ao carregar planos");
        const data = await res.json();
        if (!mounted) return;
        const allPlans = Array.isArray(data?.plans) ? data.plans : [];
        console.log('[PlansGrid] Planos recebidos:', allPlans.map((p: Plan) => ({ id: p.id, name: p.name, isFree: p.isFree })));
        // Encontra o plano free (se existir e estiver ativo)
        const freePlan = allPlans.find((p: Plan) => p.isFree === true);
        setFreePlanData(freePlan || null);
        console.log('[PlansGrid] Plano free encontrado:', freePlan?.name || 'Nenhum');
        // Filtra planos free da lista (serão mostrados separadamente)
        const paidPlans = allPlans.filter((p: Plan) => !p.isFree);
        setPlans(paidPlans);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || "Erro ao carregar planos");
        setPlans([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchPlans();
    return () => {
      mounted = false;
    };
  }, []);

  // Verifica se usuário pode criar plano free
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    async function checkFreeEligibility() {
      try {
        const res = await fetch("/api/apps/free/check", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setCanCreateFree(data?.canCreate ?? false);
      } catch { }
    }
    checkFreeEligibility();
    return () => { mounted = false; };
  }, [user]);

  const handleFreePlanClick = async () => {
    if (!user) {
      router.push("/login");
      return;
    }
    if (canCreateFree === false) {
      alert("Você já possui uma aplicação gratuita. Cada conta pode ter apenas 1 plano free.");
      return;
    }
    setCreatingFree(true);
    try {
      const res = await fetch("/api/apps/free", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/dashboard/app/${data.data.applicationId}/overview`);
      } else {
        alert(data.message || "Erro ao criar aplicação gratuita");
      }
    } catch (err: any) {
      alert(err?.message || "Erro ao criar aplicação");
    } finally {
      setCreatingFree(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Free Plan Card - Renderizado dinamicamente se existir plano free ativo */}
      {!loading && freePlanData && (
        <div className="w-full">
          <div className="flex flex-col md:flex-row gap-6 items-stretch justify-between bg-gradient-to-r from-emerald-500/10 via-green-500/5 to-teal-500/10 border-2 border-emerald-600/40 rounded-3xl p-6 shadow-lg hover:shadow-xl transition-all max-w-md mx-auto md:max-w-none">
            <div className="flex flex-col gap-3 flex-1">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold">{freePlanData.name}</h2>
                {freePlanData.description && (
                  <p className="text-foreground/70 text-sm max-w-md whitespace-pre-line">
                    {freePlanData.description}
                  </p>
                )}
              </div>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-extrabold text-emerald-500">Grátis</span>
                <span className="text-foreground/60 text-sm mb-1 flex items-center gap-1">
                  <FontAwesomeIcon icon={faInfinity} className="text-[10px]" /> para sempre
                </span>
              </div>
              {freePlanData.features && freePlanData.features.length > 0 && (
                <div className="flex flex-col gap-1 mt-3">
                  {freePlanData.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <FontAwesomeIcon icon={faCheck} className="text-emerald-500 text-[12px]" />
                      <span className="text-foreground/70 text-sm">{feature.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end justify-between gap-4 min-w-[180px]">
              <span className="text-foreground/50 text-sm italic text-right">Ideal para todos</span>
              <Button
                color="success"
                className="w-full rounded-lg font-medium text-white"
                onClick={handleFreePlanClick}
                isLoading={creatingFree}
                isDisabled={creatingFree || canCreateFree === false}
              >
                {canCreateFree === false ? "Plano Ativo" : (creatingFree ? "Criando..." : "Escolher plano")}
              </Button>
              {user && canCreateFree === false && (
                <span className="text-xs text-warning-500">Você já possui um plano free</span>
              )}
            </div>
          </div>
        </div>
      )
      }

      {/* Paid Plans Grid */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading && (
          <>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-48 bg-foreground/5 border border-foreground/10 rounded-3xl animate-pulse" />
            ))}
          </>
        )}

        {!loading && error && (
          <div className="w-full text-sm text-danger-500 bg-danger/10 border border-danger/20 rounded-lg p-3">{error}</div>
        )}

        {!loading && plans && plans.length > 0 &&
          (() => {
            // reorder so primary is centered when there are 3+ plans
            const original = plans.slice();
            const primaryIdx = original.findIndex((p) => !!p.primary);
            let ordered = original;
            if (primaryIdx >= 0 && original.length === 3) {
              const primary = original[primaryIdx];
              const others = original.filter((_, idx) => idx !== primaryIdx);
              ordered = [others[0], primary, others[1]];
            } else if (primaryIdx >= 0 && original.length > 3) {
              // place primary roughly in the middle
              ordered = original.filter((_, idx) => idx !== primaryIdx);
              const mid = Math.floor(original.length / 2);
              ordered.splice(mid, 0, original[primaryIdx]);
            }
            return ordered.map((plan: Plan, index: number, arr: Plan[]) => {
              const isPrimary = !!plan.primary;
              const isRightMostGreen = arr.length >= 3 && index === arr.length - 1;
              const isLeftMostGray = arr.length >= 3 && index === 0;
              const firstOption = plan.plans?.[0];
              const price = typeof firstOption?.value === "number" ? firstOption.value : null;
              const period = firstOption
                ? firstOption.description || (firstOption.months === 1 ? "mês" : `${firstOption.months} meses`)
                : "";
              const containerClass = isPrimary
                ? "border-primary/70 bg-primary/5"
                : isRightMostGreen
                  ? "border-green-600/70 bg-green-500/5"
                  : "border-foreground/10 bg-foreground/2";
              const priceClass = isRightMostGreen ? "text-green-600" : "";
              const buttonColor: "primary" | "success" | "default" = isRightMostGreen ? "success" : (isLeftMostGray ? "default" : "primary");
              const checkIconClass = isRightMostGreen ? "text-green-500" : (isLeftMostGray ? "text-foreground/60" : "text-primary");
              return (
                <div
                  key={index}
                  className={`relative w-full max-w-md mx-auto rounded-3xl border-2 ${containerClass} p-5 shadow-lg flex flex-col gap-3 transition-all hover:shadow-2xl`}
                >
                  {isPrimary && (
                    <div
                      className="absolute -inset-4 z-0 rounded-[2rem] pointer-events-none"
                      style={{
                        background:
                          "radial-gradient(circle at 50% 50%, rgba(88,101,242,0.22) 0%, rgba(88,101,242,0.08) 60%, transparent 100%)",
                        filter: "blur(12px)",
                      }}
                    />
                  )}
                  {isPrimary && (
                    <Chip className="absolute -top-3 right-4" variant="solid" color="primary" classNames={{ base: "text-xs" }}>
                      <FontAwesomeIcon icon={faFire} className="text-foreground text-[12px]" /> Mais escolhido
                    </Chip>
                  )}
                  <div className="relative z-10">
                    <h2 className="text-2xl font-bold">{plan.name}</h2>
                    {plan.description && <p className="text-foreground/70 text-sm">{plan.description}</p>}
                  </div>
                  <div className="relative z-10 flex flex-row items-end gap-2">
                    <h1 className={`text-4xl font-extrabold ${priceClass}`}>
                      {price !== null ? price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                    </h1>
                    <p className="text-foreground/70 text-sm mb-1">{price !== null ? `/${period}` : ""}</p>
                  </div>
                  <Button
                    className={`relative z-10 w-full rounded-lg font-medium ${(isRightMostGreen || isLeftMostGray) ? "text-white" : ""}`}
                    color={buttonColor}
                    onClick={() => {
                      if (!user) {
                        router.push("/login");
                      } else {
                        window.location.href = `/purchase?plan=${plan.id}`;
                      }
                    }}
                  >
                    Escolher plano
                  </Button>
                  <hr className="my-2 border-foreground/10" />
                  <div className="relative z-10 flex flex-col gap-1">
                    {plan.features?.map((feature, index) => (
                      <div key={index} className="flex items-center gap-2">
                        {feature?.unavailable ? (
                          <>
                            <FontAwesomeIcon icon={faXmark} className="text-danger-500 text-[12px]" />
                            <p className="text-foreground/80 text-sm">{feature.title}</p>
                          </>
                        ) : (
                          <>
                            <FontAwesomeIcon icon={faCheck} className={`${checkIconClass} text-[12px]`} />
                            <p className="text-foreground/70 text-sm">{feature.title}</p>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })()}
      </div>
    </div >
  );
}
