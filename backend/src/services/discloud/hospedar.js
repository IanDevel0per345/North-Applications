import { discloud } from "discloud.app";
import fs from "fs";
import path from "path";

export default async function hospedarApp(zipPath) {
  if (!zipPath) {
    console.error("[hospedarApp] Você precisa informar o caminho do arquivo .zip a ser hospedado.");
    process.exit(1);
  }

  try {
    await discloud.login(process.env.DISCLOUD_TOKEN);

    const fullPath = path.resolve(zipPath);
    if (!fs.existsSync(fullPath)) {
      console.error("[hospedarApp] Arquivo .zip não encontrado em:", fullPath);
      process.exit(1);
    }

    const res = await discloud.apps.create({ file: fullPath });
    return res;
  } catch (err) {
    console.error("[hospedarApp] Erro ao hospedar aplicação:", err);
  }
}