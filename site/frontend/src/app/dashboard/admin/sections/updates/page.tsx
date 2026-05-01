"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, RefreshCw, CheckCircle, XCircle, AlertCircle, Clock, Zap, Download, Eye } from "lucide-react";

export default function MassUpdatePage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [updateVersion, setUpdateVersion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [currentUpdate, setCurrentUpdate] = useState<any>(null);
  const [updateHistory, setUpdateHistory] = useState<any[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPlans();
    loadHistory();
  }, []);

  // Auto-scroll dos logs (apenas se autoScroll estiver ativado)
  useEffect(() => {
    if (autoScroll && logsEndRef.current && currentUpdate?.logs) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentUpdate?.logs?.length, autoScroll]);

  // Polling do progresso
  useEffect(() => {
    if (currentUpdate?.id && currentUpdate?.status === "running") {
      const interval = setInterval(() => {
        fetchProgress(currentUpdate.id);
      }, 1000); // Atualiza a cada 1 segundo

      return () => clearInterval(interval);
    }
  }, [currentUpdate?.id, currentUpdate?.status]);

  const loadPlans = async () => {
    try {
      const response = await fetch("/api/admin/plans/list", {
        credentials: "include",
      });
      const data = await response.json();
      if (data.success) {
        setPlans(data.data);
      }
    } catch (error) {
      console.error("Erro ao carregar planos:", error);
    }
  };

  const loadHistory = async () => {
    try {
      const response = await fetch("/api/admin/updates/list", {
        credentials: "include",
      });
      const data = await response.json();
      if (data.success) {
        setUpdateHistory(data.data);
      }
    } catch (error) {
      console.error("Erro ao carregar histórico:", error);
    }
  };

  const fetchProgress = async (updateId: string) => {
    try {
      const response = await fetch(`/api/admin/updates/progress/${updateId}`, {
        credentials: "include",
      });
      const data = await response.json();
      if (data.success) {
        setCurrentUpdate(data.data);
        
        // Se terminou, recarrega o histórico
        if (data.data.status !== "running") {
          loadHistory();
        }
      }
    } catch (error) {
      console.error("Erro ao buscar progresso:", error);
    }
  };

  const handleHistoryClick = async (update: any) => {
    // Se o update veio do MongoDB, precisa buscar os logs completos
    if (update.updateId && !update.logs) {
      await fetchProgress(update.updateId);
    } else {
      setCurrentUpdate(update);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleStartUpdate = async () => {
    if (!selectedPlan || !file) {
      alert("Selecione um plano e um arquivo ZIP");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("planId", selectedPlan);
      formData.append("file", file);
      
      // Adiciona versão customizada se fornecida
      if (updateVersion.trim()) {
        formData.append("updateVersion", updateVersion.trim());
      }

      const response = await fetch("/api/admin/updates/start", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        // Começa a monitorar o progresso
        fetchProgress(data.data.updateId);
        
        // Limpa o form
        setFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        alert(data.message || "Erro ao iniciar atualização");
      }
    } catch (error) {
      console.error("Erro ao iniciar atualização:", error);
      alert("Erro ao iniciar atualização");
    } finally {
      setUploading(false);
    }
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />;
      case "error":
        return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
      case "warning":
        return <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
      default:
        return <Clock className="w-4 h-4 text-blue-500 flex-shrink-0" />;
    }
  };

  const getLogColor = (type: string) => {
    switch (type) {
      case "success":
        return "text-green-400";
      case "error":
        return "text-red-400";
      case "warning":
        return "text-yellow-400";
      default:
        return "text-foreground/70";
    }
  };

  const progressPercentage = currentUpdate && currentUpdate.total > 0
    ? Math.round(((currentUpdate.processed || 0) / currentUpdate.total) * 100)
    : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-xl">
            <Zap className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Atualização em Massa</h1>
            <p className="text-sm text-foreground/60">
              Atualize todos os bots de um plano de uma vez
            </p>
          </div>
        </div>
      </div>

      {/* Aviso sobre rastreamento */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-500 mb-1">
              Rastreamento de Atualizações
            </p>
            <p className="text-xs text-foreground/70">
              O sistema registra automaticamente a data e hora de cada atualização no banco de dados.
              Isso permite saber exatamente quando cada bot foi atualizado pela última vez.
            </p>
          </div>
        </div>
      </div>

      {/* Formulário de Upload */}
      <div className="bg-background/50 backdrop-blur-xl border border-foreground/10 rounded-xl p-6">
        <h2 className="text-xl font-bold mb-4">Iniciar Nova Atualização</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Seleção de Plano */}
          <div>
            <label className="text-sm text-foreground/70 mb-2 block font-medium">
              Plano
            </label>
            <select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value)}
              disabled={uploading || currentUpdate?.status === "running"}
              className="w-full px-4 py-2.5 bg-background/50 border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all disabled:opacity-50"
            >
              <option value="">Selecione um plano</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>

          {/* Código de Versão (Opcional) */}
          <div>
            <label className="text-sm text-foreground/70 mb-2 block font-medium">
              Código de Versão (Opcional)
            </label>
            <input
              type="text"
              value={updateVersion}
              onChange={(e) => setUpdateVersion(e.target.value)}
              placeholder="Ex: v2.5.0 ou deixe vazio"
              disabled={uploading || currentUpdate?.status === "running"}
              className="w-full px-4 py-2.5 bg-background/50 border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all disabled:opacity-50 placeholder:text-foreground/30"
            />
          </div>

          {/* Upload de Arquivo */}
          <div>
            <label className="text-sm text-foreground/70 mb-2 block font-medium">
              Arquivo ZIP
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileSelect}
              disabled={uploading || currentUpdate?.status === "running"}
              className="w-full px-4 py-2.5 bg-background/50 border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all disabled:opacity-50 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
            />
          </div>
        </div>

        {file && (
          <div className="mb-4 p-3 bg-foreground/5 rounded-lg">
            <p className="text-sm text-foreground/70">
              <strong>Arquivo selecionado:</strong> {file.name} (
              {(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          </div>
        )}

        <button
          onClick={handleStartUpdate}
          disabled={!selectedPlan || !file || uploading || currentUpdate?.status === "running"}
          className="w-full px-4 py-3 bg-primary hover:bg-primary/90 disabled:bg-foreground/10 disabled:text-foreground/30 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Upload className="w-5 h-5" />
              Iniciar Atualização
            </>
          )}
        </button>
      </div>

      {/* Progresso da Atualização Atual */}
      {currentUpdate && (
        <div className="bg-background/50 backdrop-blur-xl border border-foreground/10 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Atualização em Andamento</h2>
            <div className="flex items-center gap-2">
              {currentUpdate.status === "running" && (
                <RefreshCw className="w-5 h-5 text-primary animate-spin" />
              )}
              <span
                className={`px-3 py-1 rounded-lg text-sm font-medium ${
                  currentUpdate.status === "running"
                    ? "bg-blue-500/10 text-blue-500"
                    : currentUpdate.status === "completed"
                    ? "bg-green-500/10 text-green-500"
                    : "bg-red-500/10 text-red-500"
                }`}
              >
                {currentUpdate.status === "running"
                  ? "Em andamento"
                  : currentUpdate.status === "completed"
                  ? "Concluído"
                  : "Erro"}
              </span>
            </div>
          </div>

          {/* Barra de Progresso */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-foreground/70">
                {currentUpdate.processed || 0} / {currentUpdate.total || 0} bots processados
              </span>
              <span className="text-sm font-medium">{progressPercentage}%</span>
            </div>
            <div className="w-full h-3 bg-foreground/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          {/* Código de Versão */}
          {currentUpdate.updateVersion && (
            <div className="mb-4 p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
              <p className="text-xs text-purple-500 mb-1">Código de Referência</p>
              <p className="text-sm font-mono font-bold text-purple-400">{currentUpdate.updateVersion}</p>
            </div>
          )}

          {/* Estatísticas */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="p-3 bg-green-500/10 rounded-lg">
              <p className="text-xs text-green-500 mb-1">Sucesso</p>
              <p className="text-2xl font-bold text-green-500">{currentUpdate.successful || 0}</p>
            </div>
            <div className="p-3 bg-red-500/10 rounded-lg">
              <p className="text-xs text-red-500 mb-1">Falhas</p>
              <p className="text-2xl font-bold text-red-500">{currentUpdate.failed || 0}</p>
            </div>
            <div className="p-3 bg-yellow-500/10 rounded-lg">
              <p className="text-xs text-yellow-500 mb-1">Pulados</p>
              <p className="text-2xl font-bold text-yellow-500">{currentUpdate.skipped || 0}</p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <p className="text-xs text-blue-500 mb-1">Pendentes</p>
              <p className="text-2xl font-bold text-blue-500">
                {(currentUpdate.total || 0) - (currentUpdate.processed || 0)}
              </p>
            </div>
          </div>

          {/* Logs em Tempo Real */}
          <div className="bg-black/50 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm" ref={logsContainerRef}>
            {currentUpdate.logs && currentUpdate.logs.length > 0 ? (
              currentUpdate.logs.map((log: any, index: number) => (
                <div key={`${log.timestamp}-${index}`} className="flex items-start gap-2 mb-2">
                  {getLogIcon(log.type)}
                  <span className="text-foreground/50 text-xs">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={getLogColor(log.type)}>{log.message}</span>
                </div>
              ))
            ) : (
              <div className="text-foreground/50 text-center py-8">
                Aguardando logs...
              </div>
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Histórico de Atualizações */}
      {updateHistory.length > 0 && (
        <div className="bg-background/50 backdrop-blur-xl border border-foreground/10 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-4">Histórico de Atualizações</h2>
          <div className="space-y-3">
            {updateHistory.map((update) => (
              <div
                key={update.updateId || update._id || update.id}
                className="p-4 bg-foreground/5 rounded-lg hover:bg-foreground/10 transition-all cursor-pointer"
                onClick={() => handleHistoryClick(update)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Plano: {update.planId}</p>
                    <p className="text-sm text-foreground/60">
                      {new Date(update.startedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-foreground/70">
                      {update.stats?.successful || update.successful || 0} / {update.stats?.total || update.total || 0} sucesso
                    </p>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        update.status === "completed"
                          ? "bg-green-500/10 text-green-500"
                          : update.status === "running"
                          ? "bg-blue-500/10 text-blue-500"
                          : "bg-red-500/10 text-red-500"
                      }`}
                    >
                      {update.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
