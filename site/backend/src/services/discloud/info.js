import { discloud } from "discloud.app";
import discloudCache from "./cache.js";

export default async function infoApp(appId) {
  if (!appId) {
    console.warn("[infoApp] appId ausente ao solicitar informações da aplicação.");
    return null;
  }

  // Verifica cache primeiro
  const cached = discloudCache.get(appId);
  if (cached) {
    return cached;
  }

  try {
    await discloud.login(process.env.DISCLOUD_TOKEN);
    
    const app = await discloud.apps.fetch(appId);
    const status = await discloud.apps.status(appId);
    const result = { app, status };
    
    // Armazena no cache
    discloudCache.set(appId, result);
    
    return result;
  } catch (err) {
    const code = err?.code ?? err?.status ?? "unknown";
    const method = err?.method || "";
    const path = err?.path || "";
    // Log compacto para evitar dump de HTML da Cloudflare
    if (code === 524) {
      console.warn(`[infoApp] Timeout (524) ao consultar Discloud ${method} ${path} para app ${appId}.`);
    } else {
      console.warn(`[infoApp] Falha ao consultar Discloud (code=${code}) ${method} ${path} para app ${appId}.`);
    }
    return null;
  }
}