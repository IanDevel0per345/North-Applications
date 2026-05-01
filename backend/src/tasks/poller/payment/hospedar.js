import { discloud } from "discloud.app";
import fs from "fs";
import path from "path";

function resolveZipPath(explicitPath) {
  if (explicitPath) return path.resolve(explicitPath);
  const zipDir = path.resolve(process.cwd(), "backend/src/database/zip");
  try {
    const files = fs.readdirSync(zipDir)
      .filter((f) => f.toLowerCase().endsWith(".zip"))
      .map((f) => ({ f, t: fs.statSync(path.join(zipDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    if (files.length === 0) return null;
    return path.join(zipDir, files[0].f);
  } catch {
    return null;
  }
}

export async function hospedarApp(zipPathFromCaller) {
  const zipPath = resolveZipPath(zipPathFromCaller || process.env.DISCLOUD_ZIP_PATH);
  if (!zipPath) {
    console.error("[hospedarApp] Arquivo .zip não encontrado.");
    return null;
  }

  if (!process.env.DISCLOUD_TOKEN) {
    console.error("[hospedarApp] DISCLOUD_TOKEN ausente no ambiente.");
    return null;
  }

  try {
    // Validate file exists and is readable
    let stats;
    try {
      stats = fs.statSync(zipPath);
    } catch (e) {
      console.error("[hospedarApp] Caminho do .zip inválido ou inacessível:", zipPath);
      return null;
    }

    if (!stats.isFile() || stats.size <= 0) {
      console.error("[hospedarApp] .zip inexistente ou com tamanho inválido:", zipPath, "size=", stats.size);
      return null;
    }

    await discloud.login(process.env.DISCLOUD_TOKEN);
    const res = await discloud.apps.create({ file: zipPath });
    return res;
  } catch (err) {
    const maybeResponse = err?.response?.data || err?.response || err?.data;
    if (maybeResponse) {
      try {
        console.error("[hospedarApp] Detalhes do erro:", JSON.stringify(maybeResponse));
      } catch {
        console.error("[hospedarApp] Detalhes do erro:", maybeResponse);
      }
    }
    console.error("[hospedarApp] Erro ao hospedar aplicação:", err?.message || err);
    return null;
  }
}


