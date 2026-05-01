/**
 * Serviço de integração com a API da Discloud
 * Gerencia operações remotas de aplicações
 */

import { discloud } from "discloud.app";

class DiscloudService {
  constructor() {
    this.isLoggedIn = false;
    this.loginPromise = null;
    // Cache de status (expira em 30 segundos)
    this.statusCache = new Map();
    this.CACHE_TTL = 30000; // 30 segundos
  }

  /**
   * Faz login na Discloud (reutiliza sessão se já estiver logado)
   */
  async ensureLogin() {
    if (!process.env.DISCLOUD_TOKEN) {
      throw new Error("DISCLOUD_TOKEN não configurado");
    }
    
    // Se já está logado, retorna imediatamente
    if (this.isLoggedIn) {
      return;
    }
    
    // Se já tem um login em andamento, aguarda ele
    if (this.loginPromise) {
      return this.loginPromise;
    }
    
    // Inicia novo login
    this.loginPromise = discloud.login(process.env.DISCLOUD_TOKEN)
      .then(() => {
        this.isLoggedIn = true;
        this.loginPromise = null;
      })
      .catch((error) => {
        this.loginPromise = null;
        throw error;
      });
    
    return this.loginPromise;
  }

  /**
   * Busca informações de uma aplicação na Discloud
   */
  async getAppInfo(appId) {
    try {
      await this.ensureLogin();
      const app = await discloud.apps.fetch(appId);
      return {
        success: true,
        app,
      };
    } catch (error) {
      console.error(`[DiscloudService] Erro ao buscar app ${appId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Busca status de uma aplicação na Discloud (com cache)
   */
  async getAppStatus(appId) {
    try {
      // Verifica cache
      const cached = this.statusCache.get(appId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }

      await this.ensureLogin();
      const status = await discloud.apps.status(appId);
      
      const result = {
        success: true,
        status,
      };
      
      // Salva no cache
      this.statusCache.set(appId, {
        data: result,
        timestamp: Date.now(),
      });
      
      return result;
    } catch (error) {
      console.error(`[DiscloudService] Erro ao buscar status ${appId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Limpa o cache de status de uma aplicação específica ou de todas
   */
  clearCache(appId = null) {
    if (appId) {
      this.statusCache.delete(appId);
    } else {
      this.statusCache.clear();
    }
  }

  /**
   * Busca logs de uma aplicação na Discloud
   */
  async getAppLogs(appId) {
    try {
      await this.ensureLogin();
      const logs = await discloud.apps.logs(appId);
      return {
        success: true,
        logs,
      };
    } catch (error) {
      console.error(`[DiscloudService] Erro ao buscar logs ${appId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Reinicia uma aplicação na Discloud
   */
  async restartApp(appId) {
    try {
      await this.ensureLogin();
      await discloud.apps.restart(appId);
      this.clearCache(appId); // Limpa cache após reiniciar
      return {
        success: true,
        message: "Aplicação reiniciada com sucesso",
      };
    } catch (error) {
      console.error(`[DiscloudService] Erro ao reiniciar ${appId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Para uma aplicação na Discloud
   */
  async stopApp(appId) {
    try {
      await this.ensureLogin();
      await discloud.apps.stop(appId);
      this.clearCache(appId); // Limpa cache após parar
      return {
        success: true,
        message: "Aplicação parada com sucesso",
      };
    } catch (error) {
      console.error(`[DiscloudService] Erro ao parar ${appId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Inicia uma aplicação na Discloud
   */
  async startApp(appId) {
    try {
      await this.ensureLogin();
      await discloud.apps.start(appId);
      this.clearCache(appId); // Limpa cache após iniciar
      return {
        success: true,
        message: "Aplicação iniciada com sucesso",
      };
    } catch (error) {
      console.error(`[DiscloudService] Erro ao iniciar ${appId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Deleta uma aplicação na Discloud
   */
  async deleteApp(appId) {
    try {
      await this.ensureLogin();
      await discloud.apps.delete(appId);
      this.clearCache(appId); // Limpa cache após deletar
      return {
        success: true,
        message: "Aplicação deletada com sucesso",
      };
    } catch (error) {
      console.error(`[DiscloudService] Erro ao deletar ${appId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Busca backup de uma aplicação
   */
  async getAppBackup(appId) {
    try {
      await this.ensureLogin();
      const backup = await discloud.apps.backup(appId);
      return {
        success: true,
        backup,
      };
    } catch (error) {
      console.error(`[DiscloudService] Erro ao buscar backup ${appId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Altera RAM de uma aplicação
   */
  async changeAppRam(appId, ram) {
    try {
      await this.ensureLogin();
      await discloud.apps.ram(appId, ram);
      return {
        success: true,
        message: "RAM alterada com sucesso",
      };
    } catch (error) {
      console.error(`[DiscloudService] Erro ao alterar RAM ${appId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Lista todas as aplicações da conta
   */
  async listAllApps() {
    try {
      const data = await this.request("/app/all");
      return {
        success: true,
        apps: data.apps || [],
      };
    } catch (error) {
      console.error(`[DiscloudService] Erro ao listar apps:`, error);
      return {
        success: false,
        error: error.message,
        apps: [],
      };
    }
  }
}

export default new DiscloudService();
