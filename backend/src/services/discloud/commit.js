/**
 * Serviço para fazer commit de aplicações na Discloud
 */

import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";

/**
 * Faz commit de uma aplicação na Discloud
 * @param {string} appId - ID da aplicação na Discloud
 * @param {Buffer|string} fileBuffer - Buffer do arquivo ZIP ou caminho do arquivo
 * @returns {Promise<object>} - Resposta da API
 */
export async function commitApp(appId, fileBuffer) {
  try {
    const apiToken = process.env.DISCLOUD_TOKEN;
    
    if (!apiToken) {
      throw new Error("DISCLOUD_TOKEN não configurado");
    }

    // Cria FormData
    const formData = new FormData();
    
    // Se for um caminho de arquivo, lê o arquivo
    if (typeof fileBuffer === "string") {
      const fileStream = fs.createReadStream(fileBuffer);
      formData.append("file", fileStream);
    } else {
      // Se for um buffer, usa diretamente
      formData.append("file", fileBuffer, {
        filename: "bot.zip",
        contentType: "application/zip",
      });
    }

    // Faz a requisição
    const response = await fetch(`https://api.discloud.app/v2/app/${appId}/commit`, {
      method: "PUT",
      headers: {
        "api-token": apiToken,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    const data = await response.json();

    // Trata os diferentes status
    if (response.status === 404) {
      throw new Error("Aplicação não encontrada na Discloud");
    }

    if (response.status === 401) {
      throw new Error("Token da Discloud inválido ou bloqueado");
    }

    // Status 200 ou 202 são considerados sucesso
    // Mensagens de erro no código do bot não devem parar a atualização
    if (response.status !== 200 && response.status !== 202) {
      throw new Error(data.message || `Erro HTTP ${response.status}`);
    }

    return {
      success: true,
      data,
      warning: data.message || null,
    };
  } catch (error) {
    console.error("[DISCLOUD COMMIT] Erro:", error.message);
    throw error;
  }
}

/**
 * Reinicia uma aplicação na Discloud
 * @param {string} appId - ID da aplicação
 * @returns {Promise<object>} - Resposta da API
 */
export async function restartApp(appId) {
  try {
    const apiToken = process.env.DISCLOUD_TOKEN;
    
    if (!apiToken) {
      throw new Error("DISCLOUD_TOKEN não configurado");
    }

    const response = await fetch(`https://api.discloud.app/v2/app/${appId}/restart`, {
      method: "PUT",
      headers: {
        "api-token": apiToken,
      },
    });

    const data = await response.json();

    if (response.status === 404) {
      throw new Error("Aplicação não encontrada na Discloud");
    }

    if (response.status === 401) {
      throw new Error("Token da Discloud inválido ou bloqueado");
    }

    // Aceita status 200, 202 e até 400 (app desligado pode dar erro mas não é crítico)
    if (response.status === 404) {
      throw new Error("Aplicação não encontrada");
    }

    // Se o app está desligado ou com erro, não é crítico para atualização
    if (response.status >= 400 && response.status < 500) {
      console.warn(`[DISCLOUD RESTART] Aviso: ${data.message || 'App pode estar desligado'}`);
      return {
        success: true,
        data,
        warning: data.message || "App pode estar desligado",
      };
    }

    if (response.status !== 200 && response.status !== 202) {
      throw new Error(data.message || `Erro HTTP ${response.status}`);
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error("[DISCLOUD RESTART] Erro:", error.message);
    throw error;
  }
}
