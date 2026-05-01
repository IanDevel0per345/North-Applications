import { discloud } from "discloud.app";

export default async function manageApp(action, appId) {
  if (!action || !appId) {
    console.error("[manageApp] Uso: node manage.js <start|stop|restart> <appId>");
    process.exit(1);
  }

  try {
    await discloud.login(process.env.DISCLOUD_TOKEN);

    let res;
    switch (action) {
      case "start":
        res = await discloud.apps.start(appId);
        break;
      case "stop":
        res = await discloud.apps.stop(appId);
        break;
      case "restart":
        res = await discloud.apps.restart(appId);
        break;
      default:
        console.error("[manageApp] Ação inválida:", action);
        process.exit(1);
    }

    console.log(`[manageApp] Ação ${action} executada com sucesso:`, res);
  } catch (err) {
    console.error(`[manageApp] Erro ao executar ${action} na aplicação:`, err);
  }
}