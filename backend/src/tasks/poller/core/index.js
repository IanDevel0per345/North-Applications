import { updatePendingPayments } from "../jobs/updatePendingPayments.js";
import { cleanupOldPayments } from "../jobs/cleanupOldPayments.js";

/**
 * Inicia um poller que verifica pagamentos pendentes e limpa expirados.
 * @param {object} options
 * @param {number} [options.intervalMs=10000] - intervalo em ms (default 10s)
 */
export function startPoller({ intervalMs = 10000 } = {}) {
  setInterval(async () => {
    try {
      await updatePendingPayments();
      await cleanupOldPayments();
    } catch (err) {
      console.error("[poller] Erro geral:", err?.message || err);
    }
  }, intervalMs);
}


