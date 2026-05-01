import { discloud } from "discloud.app";

export default async function deletarApp(appId) {
  if (!appId) {
    console.error("[deletarApp] Você precisa informar o ID da aplicação para deletar.");
    process.exit(1);
  }

  try {
    await discloud.login(process.env.DISCLOUD_TOKEN);
    
    const res = await discloud.apps.delete(appId);
    return res;
  } catch (err) {
    console.error("[deletarApp] Erro ao deletar aplicação:", err);
  }
}