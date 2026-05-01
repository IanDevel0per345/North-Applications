import Application from "../../database/models/Application.js";
import { discloud } from "discloud.app";

/**
 * POST /apps/recover/:id
 * Recupera uma aplicação bloqueada/deletada após renovação
 * - Reinicia o bot na Discloud (se ainda existir)
 * - Ou faz redeploy (se foi deletado)
 * - Remove flags de bloqueio
 */
export default async function recoverApplication(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Busca a aplicação
    const application = await Application.findOne({
      _id: id,
      userId,
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Aplicação não encontrada",
      });
    }

    // Verifica se pode recuperar
    if (!application.canRecover) {
      return res.status(400).json({
        success: false,
        message: "Esta aplicação não pode ser recuperada",
      });
    }

    // Verifica se ainda está vencida
    if (new Date() > new Date(application.expiresAt)) {
      return res.status(400).json({
        success: false,
        message: "Aplicação ainda está vencida. Renove primeiro.",
      });
    }

    const appId = application.hosting?.appId;
    const token = process.env.DISCLOUD_API_TOKEN;

    if (!token) {
      return res.status(500).json({
        success: false,
        message: "Token da Discloud não configurado",
      });
    }

    // Se foi deletado, não pode apenas reiniciar
    if (application.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Aplicação foi deletada. Entre em contato com o suporte para redeploy.",
        needsRedeploy: true,
      });
    }

    // Se está apenas bloqueado, tenta reiniciar
    if (application.isBlocked && appId) {
      try {
        // Tenta iniciar o app na Discloud
        const response = await fetch(`https://api.discloud.app/v2/app/${appId}/start`, {
          method: "PUT",
          headers: {
            "api-token": token,
          },
        });

        if (!response.ok) {
          const error = await response.text();
          console.error(`[RECOVER] Erro ao iniciar app ${appId}:`, error);
          
          return res.status(500).json({
            success: false,
            message: "Erro ao iniciar aplicação na Discloud",
            error,
          });
        }

        // Remove flags de bloqueio
        application.isBlocked = false;
        application.blockedAt = null;
        await application.save();

        console.log(`[RECOVER] Aplicação ${id} recuperada com sucesso`);

        return res.status(200).json({
          success: true,
          message: "Aplicação recuperada com sucesso!",
          data: {
            application: {
              id: application._id,
              name: application.name,
              isBlocked: application.isBlocked,
              expiresAt: application.expiresAt,
            },
          },
        });
      } catch (error) {
        console.error(`[RECOVER] Erro ao recuperar aplicação ${id}:`, error);
        return res.status(500).json({
          success: false,
          message: "Erro ao recuperar aplicação",
          error: error.message,
        });
      }
    }

    // Se não está bloqueado, não precisa recuperar
    return res.status(400).json({
      success: false,
      message: "Aplicação não está bloqueada",
    });
  } catch (error) {
    console.error("[RECOVER ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Erro ao recuperar aplicação",
      error: error.message,
    });
  }
}
