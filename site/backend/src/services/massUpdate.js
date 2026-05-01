/**
 * Serviço de atualização em massa de bots
 * Atualiza todos os bots de um plano específico com novo código
 */

import Application from "../database/models/Application.js";
import Plan from "../database/models/Plan.js";
import BotConfig from "../database/models/BotConfig.js";
import UpdateLog from "../database/models/UpdateLog.js";
import { commitApp } from "./discloud/commit.js";
import fs from "fs";
import path from "path";

// Armazena o progresso das atualizações em andamento
const updateProgress = new Map();

/**
 * Gera um código de referência único para a atualização
 */
function generateUpdateVersion(planId) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${planId}-${timestamp}-${random}`;
}

/**
 * Inicia uma atualização em massa
 */
export async function startMassUpdate(planId, zipPath, adminUserId, customVersion = null) {
  console.log(`[MASS UPDATE] startMassUpdate chamado - planId: ${planId}, zipPath: ${zipPath}, adminUserId: ${adminUserId}`);

  const updateId = `update-${Date.now()}`;
  const updateVersion = customVersion || generateUpdateVersion(planId);

  console.log(`[MASS UPDATE] UpdateID gerado: ${updateId}, UpdateVersion: ${updateVersion}`);

  const progress = {
    id: updateId,
    planId,
    updateVersion, // Código de referência da atualização
    status: "running",
    startedAt: new Date(),
    finishedAt: null,
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    skipped: 0, // Bots que já estão nesta versão
    logs: [],
    errors: [],
  };

  updateProgress.set(updateId, progress);

  // Cria registro no MongoDB
  try {
    const updateLog = new UpdateLog({
      updateId,
      planId,
      updateVersion,
      adminUserId,
      status: "running",
      startedAt: progress.startedAt,
      stats: {
        total: 0,
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
      },
      logs: [],
      errors: [],
    });
    await updateLog.save();
    console.log(`[MASS UPDATE] UpdateLog salvo no MongoDB - UpdateID: ${updateId}`);
  } catch (error) {
    console.error(`[MASS UPDATE] Erro ao salvar UpdateLog no MongoDB:`, error);
    throw error;
  }

  // Executa em background
  processUpdate(updateId, planId, zipPath, adminUserId).catch((error) => {
    console.error("[MASS UPDATE] Erro fatal:", error);
    progress.status = "error";
    progress.logs.push({
      timestamp: new Date(),
      type: "error",
      message: `Erro fatal: ${error.message}`,
    });

    // Atualiza no MongoDB
    UpdateLog.updateOne(
      { updateId },
      {
        $set: { status: "error" },
        $push: {
          logs: {
            timestamp: new Date(),
            type: "error",
            message: `Erro fatal: ${error.message}`,
          }
        }
      }
    ).catch(err => console.error("[MASS UPDATE] Erro ao salvar log:", err));
  });

  console.log(`[MASS UPDATE] Retornando updateId: ${updateId}`);
  return updateId;
}

/**
 * Adiciona um log tanto na memória quanto no MongoDB
 */
async function addLog(updateId, type, message) {
  const progress = updateProgress.get(updateId);
  const logEntry = {
    timestamp: new Date(),
    type,
    message,
  };

  // Adiciona na memória
  if (progress) {
    progress.logs.push(logEntry);
  }

  // Adiciona no MongoDB
  try {
    await UpdateLog.updateOne(
      { updateId },
      { $push: { logs: logEntry } }
    );
  } catch (error) {
    console.error("[MASS UPDATE] Erro ao salvar log no MongoDB:", error);
  }
}

/**
 * Atualiza estatísticas tanto na memória quanto no MongoDB
 */
async function updateStats(updateId, stats) {
  const progress = updateProgress.get(updateId);

  // Atualiza na memória
  if (progress) {
    Object.assign(progress, stats);
  }

  // Atualiza no MongoDB
  try {
    const updateFields = {};
    if (stats.total !== undefined) updateFields["stats.total"] = stats.total;
    if (stats.processed !== undefined) updateFields["stats.processed"] = stats.processed;
    if (stats.successful !== undefined) updateFields["stats.successful"] = stats.successful;
    if (stats.failed !== undefined) updateFields["stats.failed"] = stats.failed;
    if (stats.skipped !== undefined) updateFields["stats.skipped"] = stats.skipped;

    if (Object.keys(updateFields).length > 0) {
      await UpdateLog.updateOne(
        { updateId },
        { $set: updateFields }
      );
    }
  } catch (error) {
    console.error("[MASS UPDATE] Erro ao atualizar stats no MongoDB:", error);
  }
}

/**
 * Processa a atualização em massa
 */
async function processUpdate(updateId, planId, zipPath, adminUserId) {
  const progress = updateProgress.get(updateId);

  try {
    // Verifica se o arquivo existe
    if (!fs.existsSync(zipPath)) {
      throw new Error(`Arquivo ZIP não encontrado: ${zipPath}`);
    }

    await addLog(updateId, "info", `Iniciando atualização em massa para plano ${planId}`);
    await addLog(updateId, "info", `Código de referência: ${progress.updateVersion}`);

    // Busca o plano
    const plan = await Plan.findOne({ id: planId });
    if (!plan) {
      throw new Error(`Plano ${planId} não encontrado`);
    }

    progress.logs.push({
      timestamp: new Date(),
      type: "info",
      message: `Plano encontrado: ${plan.name}`,
    });

    // Busca todas as aplicações ativas do plano
    const applications = await Application.find({
      "plan.id": planId,
      isDeleted: { $ne: true },
      isBlocked: { $ne: true },
      "hosting.appId": { $exists: true, $ne: null },
    });

    progress.total = applications.length;

    // Atualiza total no MongoDB
    await updateStats(updateId, {
      total: applications.length,
    });

    progress.logs.push({
      timestamp: new Date(),
      type: "info",
      message: `${applications.length} aplicação(ões) encontrada(s)`,
    });

    if (applications.length === 0) {
      progress.status = "completed";
      progress.finishedAt = new Date();
      progress.logs.push({
        timestamp: new Date(),
        type: "warning",
        message: "Nenhuma aplicação ativa encontrada para atualizar",
      });
      return;
    }

    // Lê o arquivo ZIP
    const fileBuffer = fs.readFileSync(zipPath);

    // Configuração de processamento paralelo
    // Com 10 bots simultâneos e ~1 minuto por bot:
    // - Antes: 1000 bots × 1 min = 1000 minutos (~16.7 horas)
    // - Agora: 1000 bots ÷ 10 = 100 batches × 1 min = 100 minutos (~1.7 horas)
    // Redução de ~90% no tempo total!
    const CONCURRENT_LIMIT = 10; // Processar 10 bots simultaneamente (ajustável conforme necessidade)
    const DELAY_BETWEEN_BATCHES = 1000; // 1 segundo entre batches (reduzido de 3s)


    const estimatedTime = Math.ceil(applications.length / CONCURRENT_LIMIT) * 1.5; // Estimativa em minutos
    await addLog(updateId, "info", `Processando ${applications.length} aplicações em paralelo (${CONCURRENT_LIMIT} simultâneas)`);
    await addLog(updateId, "info", `Tempo estimado: ~${estimatedTime} minutos (vs ~${applications.length} minutos sequencial)`);

    // Função para processar uma aplicação individual
    async function processApplication(app, index, total) {
      const appId = app.hosting.appId;

      try {
        // Verifica se o bot já está nesta versão
        if (app.updateVersion === progress.updateVersion) {
          progress.skipped++;
          progress.processed++;
          await updateStats(updateId, {
            processed: progress.processed,
            skipped: progress.skipped,
          });
          return { success: false, skipped: true, appName: app.name };
        }

        await addLog(updateId, "info", `[${index + 1}/${total}] Atualizando ${app.name} (${appId})...`);

        // Faz commit do novo código
        const commitResult = await commitApp(appId, fileBuffer);

        if (commitResult.warning) {
          await addLog(updateId, "warning", `⚠️ ${app.name} - ${commitResult.warning}`);
        } else {
          await addLog(updateId, "success", `✓ ${app.name} - Código atualizado (restart automático pela Discloud)`);
        }

        // Atualiza o campo lastUpdate e updateVersion no banco de dados
        const updateTime = new Date();
        await Application.updateOne(
          { _id: app._id },
          {
            $set: {
              lastUpdate: updateTime,
              lastUpdateBy: adminUserId,
              updateVersion: progress.updateVersion,
            }
          }
        );

        // Atualiza também o BotConfig se existir
        if (app.botID) {
          await BotConfig.updateOne(
            { botID: app.botID },
            {
              $set: {
                version: progress.updateVersion,
              }
            }
          );
        }

        progress.successful++;
        progress.processed++;
        await updateStats(updateId, {
          processed: progress.processed,
          successful: progress.successful,
        });

        return { success: true, appName: app.name };
      } catch (error) {
        console.error(`[MASS UPDATE] Erro ao atualizar ${appId}:`, error);

        await addLog(updateId, "error", `✗ ${app.name} - Erro: ${error.message}`);

        progress.errors.push({
          appId,
          appName: app.name,
          error: error.message,
        });

        progress.failed++;
        progress.processed++;
        await updateStats(updateId, {
          processed: progress.processed,
          failed: progress.failed,
        });

        return { success: false, error: error.message, appName: app.name };
      }
    }

    // Processa aplicações em batches paralelos
    for (let i = 0; i < applications.length; i += CONCURRENT_LIMIT) {
      const batch = applications.slice(i, i + CONCURRENT_LIMIT);
      const batchNumber = Math.floor(i / CONCURRENT_LIMIT) + 1;
      const totalBatches = Math.ceil(applications.length / CONCURRENT_LIMIT);

      await addLog(updateId, "info", `Processando batch ${batchNumber}/${totalBatches} (${batch.length} aplicações)`);

      // Processa batch em paralelo
      const batchPromises = batch.map((app, batchIndex) =>
        processApplication(app, i + batchIndex, applications.length)
      );

      await Promise.allSettled(batchPromises);

      // Pequeno delay entre batches para evitar sobrecarga da API
      if (i + CONCURRENT_LIMIT < applications.length) {
        await sleep(DELAY_BETWEEN_BATCHES);
      }
    }

    // Finaliza
    progress.status = "completed";
    progress.finishedAt = new Date();

    const duration = Math.round((progress.finishedAt - progress.startedAt) / 1000);

    progress.logs.push({
      timestamp: new Date(),
      type: "success",
      message: `✓ Atualização concluída em ${duration}s - ${progress.successful} sucesso(s), ${progress.failed} falha(s), ${progress.skipped} pulado(s)`,
    });

    // Atualiza status final no MongoDB
    try {
      await UpdateLog.updateOne(
        { updateId },
        {
          $set: {
            status: "completed",
            finishedAt: progress.finishedAt,
            stats: {
              total: progress.total,
              processed: progress.processed,
              successful: progress.successful,
              failed: progress.failed,
              skipped: progress.skipped,
            }
          }
        }
      );
    } catch (error) {
      console.error("[MASS UPDATE] Erro ao atualizar status final no MongoDB:", error);
    }
  } catch (error) {
    progress.status = "error";
    progress.finishedAt = new Date();
    progress.logs.push({
      timestamp: new Date(),
      type: "error",
      message: `Erro fatal: ${error.message}`,
    });

    // Atualiza status de erro no MongoDB
    try {
      await UpdateLog.updateOne(
        { updateId },
        {
          $set: {
            status: "error",
            finishedAt: progress.finishedAt,
          }
        }
      );
    } catch (dbError) {
      console.error("[MASS UPDATE] Erro ao atualizar status de erro no MongoDB:", dbError);
    }
  }
}

/**
 * Obtém o progresso de uma atualização
 */
export function getUpdateProgress(updateId) {
  return updateProgress.get(updateId) || null;
}

/**
 * Lista todas as atualizações
 */
export function getAllUpdates() {
  return Array.from(updateProgress.values()).sort(
    (a, b) => b.startedAt - a.startedAt
  );
}

/**
 * Remove uma atualização do histórico
 */
export function clearUpdate(updateId) {
  return updateProgress.delete(updateId);
}

/**
 * Obtém a última versão de um plano
 */
export async function getLatestPlanVersion(planId) {
  try {
    // Busca a aplicação mais recentemente atualizada do plano
    const latestApp = await Application.findOne({
      "plan.id": planId,
      updateVersion: { $exists: true, $ne: null },
    })
      .sort({ lastUpdate: -1 })
      .select("updateVersion")
      .lean();

    return latestApp?.updateVersion || null;
  } catch (error) {
    console.error("[MASS UPDATE] Erro ao buscar última versão:", error);
    return null;
  }
}

/**
 * Helper para sleep
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
