"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Plan } from "@/types/plans";

interface CreateGiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  plans: Plan[];
}

export default function CreateGiftModal({ isOpen, onClose, onSubmit, plans }: CreateGiftModalProps) {
  const [formData, setFormData] = useState({
    planId: "",
    months: 1,
    quantity: 1,
    expiresAt: "",
    description: "",
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data: any = {
      planId: formData.planId,
      months: formData.months,
      quantity: formData.quantity,
    };

    if (formData.expiresAt) {
      data.expiresAt = formData.expiresAt;
    }

    if (formData.description) {
      data.description = formData.description;
    }

    onSubmit(data);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
      <div className="bg-background/95 backdrop-blur-xl border border-foreground/10 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-foreground/10">
          <h2 className="text-2xl font-bold">Criar Gifts</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-foreground/10 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Plano */}
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground/80">
              Plano <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={formData.planId}
              onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
              className="w-full px-4 py-2.5 bg-background/50 border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            >
              <option value="">Selecione um plano</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>

          {/* Meses */}
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground/80">
              Duração (meses) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              required
              min="1"
              max="120"
              value={formData.months}
              onChange={(e) => setFormData({ ...formData, months: parseInt(e.target.value) })}
              className="w-full px-4 py-2.5 bg-background/50 border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
            <p className="text-xs text-foreground/60 mt-1.5">
              Por quantos meses o plano será válido
            </p>
          </div>

          {/* Quantidade */}
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground/80">
              Quantidade <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              required
              min="1"
              max="100"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
              className="w-full px-4 py-2.5 bg-background/50 border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
            <p className="text-xs text-foreground/60 mt-1.5">
              Quantos códigos criar (máximo 100)
            </p>
          </div>

          {/* Data de Expiração */}
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground/80">
              Data de Expiração (opcional)
            </label>
            <input
              type="datetime-local"
              value={formData.expiresAt}
              onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              className="w-full px-4 py-2.5 bg-background/50 border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
            <p className="text-xs text-foreground/60 mt-1.5">
              Deixe em branco para gifts sem expiração
            </p>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground/80">
              Descrição (opcional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2.5 bg-background/50 border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
              placeholder="Ex: Promoção de Natal 2024"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 rounded-xl transition-all font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 rounded-xl transition-all font-medium shadow-lg hover:shadow-xl"
            >
              Criar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
