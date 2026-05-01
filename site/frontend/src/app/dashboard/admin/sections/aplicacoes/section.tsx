"use client";

import { useEffect, useState } from "react";
import { Button, Input, Select, SelectItem, Chip, Pagination, Spinner } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faSearch, 
  faFilter, 
  faRefresh, 
  faEye,
  faBan,
  faPlay,
  faStop,
  faRotate,
  faTrash,
  faUndo,
  faServer,
  faClock,
  faUser,
  faMemory,
  faExclamationTriangle
} from "@fortawesome/free-solid-svg-icons";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ApplicationCard } from "./ApplicationCard";
import { ApplicationModal } from "./ApplicationModal";
import { AuditTable } from "./AuditTable";
import { ApplicationStats } from "./ApplicationStats";
import { Application } from "@/types/application";

export function AplicacoesSection() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  
  // Filtros
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [expiredFilter, setExpiredFilter] = useState("");
  const [blockedFilter, setBlockedFilter] = useState("");
  
  // Paginação
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;
  
  // Modal
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Auditoria
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  const loadApplications = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search,
        status: statusFilter,
        planId: planFilter,
        expired: expiredFilter,
        blocked: blockedFilter,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      
      const res = await fetch(`/api/admin/applications?${params}`, {
        cache: "no-store",
      });
      
      if (!res.ok) throw new Error("Erro ao carregar aplicações");
      
      const data = await res.json();
      
      setApplications(data.applications || []);
      setTotal(data.pagination?.total || 0);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar aplicações");
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await fetch("/api/admin/applications/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Erro ao carregar estatísticas:", err);
    }
  };

  const loadAuditLogs = async () => {
    try {
      setAuditLoading(true);
      
      const params = new URLSearchParams({
        page: "1",
        limit: "50",
      });
      
      const res = await fetch(`/api/admin/applications/audit/logs?${params}`);
      
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Erro ao carregar auditoria:", err);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, [page, search, statusFilter, planFilter, expiredFilter, blockedFilter]);

  const loadPlans = async () => {
    try {
      const res = await fetch("/api/admin/plans/list");
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
      }
    } catch (err) {
      console.error("Erro ao carregar planos:", err);
    }
  };

  useEffect(() => {
    loadStats();
    loadAuditLogs();
    loadPlans();
  }, []);

  const handleAction = async (action: string, appId: string, data?: any) => {
    try {
      let url = `/api/admin/applications/${appId}`;
      let method = "POST";
      let body = data ? JSON.stringify(data) : JSON.stringify({});
      
      switch (action) {
        case "block":
          url += "/block";
          break;
        case "unblock":
          url += "/unblock";
          break;
        case "restart":
          url += "/restart";
          break;
        case "stop":
          url += "/stop";
          break;
        case "start":
          url += "/start";
          break;
        case "delete":
          method = "DELETE";
          // Adiciona parâmetros de query para deleção
          if (data?.deleteFrom) {
            url += `?deleteFrom=${data.deleteFrom}`;
            if (data.permanent !== undefined) {
              url += `&permanent=${data.permanent}`;
            }
          }
          break;
        case "restore":
          url += "/restore";
          break;
        case "update":
          method = "PUT";
          break;
        case "changeRam":
          url += "/ram";
          method = "PUT";
          break;
      }
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Erro na operação");
      }
      
      // Recarrega dados
      await loadApplications();
      await loadAuditLogs();
      
      // Fecha modal se estiver aberto
      if (modalOpen) {
        setModalOpen(false);
        setSelectedApp(null);
      }
      
      return true;
    } catch (err: any) {
      alert(err.message || "Erro na operação");
      return false;
    }
  };

  const openDetails = async (app: Application) => {
    try {
      const res = await fetch(`/api/admin/applications/${app._id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedApp(data.application);
        setModalOpen(true);
      }
    } catch (err) {
      console.error("Erro ao buscar detalhes:", err);
    }
  };

  if (loading && applications.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header com estatísticas */}
      <SectionHeader 
        description="Gerencie todas as aplicações do sistema"
        actions={
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="light"
              onPress={() => setShowAudit(!showAudit)}
            >
              {showAudit ? "Ocultar" : "Mostrar"} Auditoria
            </Button>
            <Button 
              size="sm" 
              color="primary"
              onPress={loadApplications}
              startContent={<FontAwesomeIcon icon={faRefresh} />}
            >
              Atualizar
            </Button>
          </div>
        }
      />

      {/* Estatísticas */}
      {stats && <ApplicationStats stats={stats} />}

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <Input
          size="sm"
          placeholder="Buscar por nome, Discord ID, plano..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          startContent={<FontAwesomeIcon icon={faSearch} className="text-foreground/50" />}
        />
        
        <Select
          size="sm"
          placeholder="Status"
          selectedKeys={statusFilter ? new Set([statusFilter]) : new Set()}
          onSelectionChange={(keys) => setStatusFilter(Array.from(keys)[0] as string || "")}
        >
          <SelectItem key="">Todos</SelectItem>
          <SelectItem key="online">Online</SelectItem>
          <SelectItem key="offline">Offline</SelectItem>
          <SelectItem key="maintenance">Manutenção</SelectItem>
        </Select>
        
        <Select
          size="sm"
          placeholder="Plano"
          selectedKeys={planFilter ? new Set([planFilter]) : new Set()}
          onSelectionChange={(keys) => setPlanFilter(Array.from(keys)[0] as string || "")}
        >
          <SelectItem key="">Todos</SelectItem>
          {plans.map((plan: any) => (
            <SelectItem key={plan.id} value={plan.id}>
              {plan.name}
            </SelectItem>
          ))}
        </Select>
        
        <Select
          size="sm"
          placeholder="Expiração"
          selectedKeys={expiredFilter ? new Set([expiredFilter]) : new Set()}
          onSelectionChange={(keys) => setExpiredFilter(Array.from(keys)[0] as string || "")}
        >
          <SelectItem key="">Todos</SelectItem>
          <SelectItem key="false">Ativos</SelectItem>
          <SelectItem key="true">Expirados</SelectItem>
        </Select>
        
        <Select
          size="sm"
          placeholder="Bloqueio"
          selectedKeys={blockedFilter ? new Set([blockedFilter]) : new Set()}
          onSelectionChange={(keys) => setBlockedFilter(Array.from(keys)[0] as string || "")}
        >
          <SelectItem key="">Todos</SelectItem>
          <SelectItem key="false">Desbloqueados</SelectItem>
          <SelectItem key="true">Bloqueados</SelectItem>
        </Select>
      </div>

      {/* Erro */}
      {error && (
        <div className="rounded-lg bg-danger/10 border border-danger/20 text-danger-500 text-sm p-3">
          {error}
        </div>
      )}

      {/* Lista de aplicações */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {applications.map((app) => (
          <ApplicationCard
            key={app._id}
            application={app}
            onView={() => openDetails(app)}
            onAction={(action, data) => handleAction(action, app._id, data)}
          />
        ))}
      </div>

      {/* Mensagem vazia */}
      {!loading && applications.length === 0 && (
        <div className="rounded-lg bg-foreground/5 border border-foreground/10 p-8 text-center">
          <p className="text-foreground/70">Nenhuma aplicação encontrada</p>
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-center mt-4">
          <Pagination
            total={totalPages}
            page={page}
            onChange={setPage}
            size="sm"
            showControls
            boundaries={1}
            siblings={1}
          />
        </div>
      )}

      {/* Auditoria */}
      {showAudit && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3">Logs de Auditoria</h3>
          <div className="rounded-lg border border-foreground/10 bg-foreground/2 p-4">
            <AuditTable logs={auditLogs} loading={auditLoading} />
          </div>
        </div>
      )}

      {/* Modal de detalhes */}
      {selectedApp && (
        <ApplicationModal
          application={selectedApp}
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelectedApp(null);
          }}
          onAction={(action, data) => handleAction(action, selectedApp._id, data)}
        />
      )}
    </div>
  );
}
