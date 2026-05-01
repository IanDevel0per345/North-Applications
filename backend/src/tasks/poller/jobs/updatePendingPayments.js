import Payment from "../../../database/models/Payment.js";
import { processPayment } from "../processPayment.js";

export async function updatePendingPayments() {
  const pendings = await Payment.find({ status: "pending" });
  for (const p of pendings) {
    try {
      await processPayment(p);
    } catch (err) {
      const paymentId = p.wooviId || p.efiId || p._id;
      console.error(`[poller] Erro verificando ${paymentId} (${p.provider || 'woovi'}):`, err?.message || err);
    }
  }
}


