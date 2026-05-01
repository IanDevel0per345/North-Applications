import app from "./src/app.js";
import { startPoller } from "./src/tasks/poller/core/index.js";
import { startChargeService } from "./src/services/billing/chargeService.js";
import { startBlockService } from "./src/services/billing/blockService.js";
import { startInactivityService } from "./src/services/billing/inactivityService.js";
import { startBotCounter } from "./src/services/discord/botCounter.js";
import { cleanExpiredCodes } from "./src/services/emailVerification.js";

console.clear();
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Servidor rodando na porta ${PORT}`);
  startPoller({ intervalMs: 10000 });
  console.log(`[${new Date().toISOString()}] Poller iniciado a cada 10000ms`);
  startChargeService();
  console.log(`[${new Date().toISOString()}] Serviço de cobrança iniciado`);
  startBlockService();
  console.log(`[${new Date().toISOString()}] Serviço de bloqueio iniciado`);
  startInactivityService();
  console.log(`[${new Date().toISOString()}] Serviço de inatividade iniciado`);
  startBotCounter();
  console.log(`[${new Date().toISOString()}] Serviço de contador iniciado`);

  // Limpa códigos expirados a cada 30 minutos
  setInterval(cleanExpiredCodes, 30 * 60 * 1000);
  console.log(`[${new Date().toISOString()}] Limpeza de códigos agendada`);
});