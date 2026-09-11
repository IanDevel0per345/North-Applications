"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { addToast, Switch } from "@heroui/react";
import { Save, Settings2, ShieldCheck } from "lucide-react";

type ModuleKey =
  | "store"
  | "ticket"
  | "moderation"
  | "automation"
  | "giveaway"
  | "payments"
  | "channels"
  | "roles"
  | "backup"
  | "extensions";

type ModuleSettings = {
  enabled: boolean;
  channelId: string;
  roleId: string;
  logChannelId: string;
  title: string;
  message: string;
  options: Record<string, any>;
  updatedAt?: string | null;
};

const MODULE_COPY: Record<string, { key: ModuleKey; title: string; description: string; badge: string }> = {
  store: {
    key: "store",
    title: "Loja",
    description: "Configure produtos, vendas, entrega automatica e comportamento da loja do bot pelo dashboard.",
    badge: "Vendas",
  },
  ticket: {
    key: "ticket",
    title: "Tickets",
    description: "Controle painel de atendimento, canal, logs, transcricoes e cargo da equipe.",
    badge: "Suporte",
  },
  protections: {
    key: "moderation",
    title: "Proteções",
    description: "Centralize anti-spam, bloqueios, logs e acoes de moderacao do servidor.",
    badge: "Moderacao",
  },
  automations: {
    key: "automation",
    title: "Automações",
    description: "Gerencie boas-vindas, mensagens automaticas, logs e rotinas do bot.",
    badge: "Rotinas",
  },
  giveaway: {
    key: "giveaway",
    title: "Sorteios",
    description: "Defina canal, cargo permitido e padrao dos sorteios direto pelo painel.",
    badge: "Eventos",
  },
  payments: {
    key: "payments",
    title: "Pagamentos",
    description: "Configure confirmacoes, recibos e regras usadas nas vendas.",
    badge: "Checkout",
  },
  channels: {
    key: "channels",
    title: "Canais",
    description: "Defina canais principais usados por loja, ticket, logs e avisos.",
    badge: "Servidor",
  },
  roles: {
    key: "roles",
    title: "Cargos",
    description: "Mapeie cargos de cliente, suporte e administracao para o bot executar acoes.",
    badge: "Permissoes",
  },
  backup: {
    key: "backup",
    title: "Backup",
    description: "Controle backups automaticos das configuracoes usadas pela North Applications.",
    badge: "Dados",
  },
  extensions: {
    key: "extensions",
    title: "Extensões",
    description: "Ative recursos extras do bot sem precisar editar arquivos ou comandos no Discord.",
    badge: "Add-ons",
  },
  incomes: {
    key: "store",
    title: "Rendimentos",
    description: "Acompanhe e configure como vendas e receitas da loja aparecem no painel.",
    badge: "Financeiro",
  },
  cloud: {
    key: "automation",
    title: "North Cloud",
    description: "Ajustes de operacao do bot conectado e sincronizado com o dashboard.",
    badge: "Operacao",
  },
};

const DEFAULT_SETTINGS: ModuleSettings = {
  enabled: false,
  channelId: "",
  roleId: "",
  logChannelId: "",
  title: "",
  message: "",
  options: {},
};

export function ModuleSettingsPage({ moduleId }: { moduleId: string }) {
  const params = useParams<{ id: string }>();
  const appId = params?.id as string | undefined;
  const meta = MODULE_COPY[moduleId] || MODULE_COPY.store;
  const [settings, setSettings] = useState<ModuleSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const optionEntries = useMemo(() => Object.entries(settings.options || {}), [settings.options]);

  useEffect(() => {
    let aborted = false;
    if (!appId) return;

    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/apps/${appId}/modules/${meta.key}`, {
          cache: "no-store",
          credentials: "include",
          headers: { accept: "application/json" },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Erro ao carregar modulo");
        if (!aborted) setSettings({ ...DEFAULT_SETTINGS, ...(data.module || {}) });
      } catch (error: any) {
        addToast({ title: "Erro ao carregar", description: error?.message || "Tente novamente.", color: "danger" });
      } finally {
        if (!aborted) setLoading(false);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [appId, meta.key]);

  const updateOption = (key: string, value: any) => {
    setSettings((prev) => ({ ...prev, options: { ...prev.options, [key]: value } }));
  };

  const save = async () => {
    if (!appId) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/apps/${appId}/modules/${meta.key}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao salvar modulo");
      setSettings({ ...DEFAULT_SETTINGS, ...(data.module || {}) });
      addToast({ title: "Configurações salvas", description: "O bot ja pode sincronizar este modulo pelo painel.", color: "success" });
    } catch (error: any) {
      addToast({ title: "Erro ao salvar", description: error?.message || "Tente novamente.", color: "danger" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="p-6 md:px-12 flex flex-col gap-5 min-h-screen">
      <div className="flex flex-col">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{meta.title}</p>
              <span className="text-[11px] px-2 py-1 rounded-full border border-foreground/10 bg-foreground/5 text-foreground/60">
                {meta.badge}
              </span>
            </div>
            <p className="text-foreground/60 text-sm max-w-2xl">{meta.description}</p>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Salvando" : "Salvar"}
          </button>
        </div>
        <hr className="border-foreground/10 mt-4" />
      </div>

      <section className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-5">
        <div className="flex flex-col bg-foreground/2 border border-foreground/5 rounded-xl p-5 w-full gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                Configuração principal
              </p>
              <p className="text-xs text-foreground/60">Esses dados definem como o bot executa este modulo no Discord.</p>
            </div>
            <Switch
              isSelected={settings.enabled}
              onValueChange={(enabled) => setSettings((prev) => ({ ...prev, enabled }))}
              isDisabled={loading}
            >
              Ativo
            </Switch>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Canal principal" value={settings.channelId} placeholder="ID do canal" onChange={(channelId) => setSettings((prev) => ({ ...prev, channelId }))} />
            <Field label="Cargo permitido" value={settings.roleId} placeholder="ID do cargo" onChange={(roleId) => setSettings((prev) => ({ ...prev, roleId }))} />
            <Field label="Canal de logs" value={settings.logChannelId} placeholder="ID do canal de logs" onChange={(logChannelId) => setSettings((prev) => ({ ...prev, logChannelId }))} />
            <Field label="Titulo do painel" value={settings.title} placeholder="Titulo exibido pelo bot" onChange={(title) => setSettings((prev) => ({ ...prev, title }))} />
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-sm text-foreground/70">Mensagem exibida pelo bot</span>
            <textarea
              value={settings.message}
              onChange={(event) => setSettings((prev) => ({ ...prev, message: event.target.value }))}
              placeholder="Mensagem do painel, ticket, loja ou aviso"
              className="min-h-32 rounded-lg border border-foreground/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary/50"
            />
          </label>
        </div>

        <div className="flex flex-col bg-foreground/2 border border-foreground/5 rounded-xl p-5 w-full gap-5">
          <div>
            <p className="font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Opções do módulo
            </p>
            <p className="text-xs text-foreground/60">Ajustes rápidos salvos junto com a aplicação.</p>
          </div>

          {loading ? (
            <div className="h-40 rounded-lg bg-foreground/5 animate-pulse" />
          ) : (
            <div className="flex flex-col gap-3">
              {optionEntries.map(([key, value]) => (
                <OptionControl key={key} name={key} value={value} onChange={(next) => updateOption(key, next)} />
              ))}
              {optionEntries.length === 0 ? (
                <p className="text-sm text-foreground/50">Nenhuma opção extra para este módulo.</p>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm text-foreground/70">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-foreground/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary/50"
      />
    </label>
  );
}

function OptionControl({ name, value, onChange }: { name: string; value: any; onChange: (value: any) => void }) {
  if (typeof value === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-foreground/5 bg-foreground/[0.02] px-3 py-2">
        <span className="text-sm capitalize text-foreground/75">{name}</span>
        <Switch isSelected={value} onValueChange={onChange} />
      </div>
    );
  }

  return (
    <Field
      label={name}
      value={String(value ?? "")}
      placeholder={name}
      onChange={(next) => onChange(typeof value === "number" ? Number(next) : next)}
    />
  );
}
