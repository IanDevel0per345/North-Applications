"use client";

import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import type { Plan } from "@/types/plans";

export function PlanCard({ plan, onEdit, onRemove }: { plan: Plan & { purchasedCount?: number }; onEdit: (p: Plan) => void; onRemove: (id: string) => void }) {
  const isInactive = plan.active === false;
  return (
    <div className={`rounded-lg border ${plan.primary ? "border-primary" : "border-foreground/10"} bg-foreground/2 p-4 flex flex-col gap-2 ${isInactive ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold truncate" title={plan.name}>{plan.name}</h3>
            {isInactive && <span className="text-xs bg-warning-500/20 text-warning-500 px-2 py-0.5 rounded-full">Desativado</span>}
          </div>
          <p className="text-foreground/70 text-sm truncate" title={plan.description}>{plan.description}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button isIconOnly size="sm" variant="light" onPress={() => onEdit(plan)}>
            <FontAwesomeIcon icon={faPen} />
          </Button>
          <Button isIconOnly size="sm" color="danger" variant="light" onPress={() => onRemove(plan.id)}>
            <FontAwesomeIcon icon={faTrash} />
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-foreground/70 text-xs">
          {plan.features?.length || 0} recursos · {plan.purchasedCount ?? 0} compras
        </div>
        {plan.plans?.[0] ? (
          <div className="text-sm font-semibold">
            R$ {Number(plan.plans[0].value).toFixed(2)} / {plan.plans[0].description || "mês"}
          </div>
        ) : (
          <div className="text-xs text-foreground/60">sem preço inicial</div>
        )}
      </div>
    </div>
  );
}


