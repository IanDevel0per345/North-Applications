import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  plan: {
    id: String,
    name: String,
    price: Number,
    monthId: String,
    months: Number,
  },
  coupon: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
    code: String,
    discountPercent: Number,
  },
  priceFinal: { type: Number, required: true },
  // IDs dos provedores de pagamento (um será usado dependendo da configuração)
  efiId: { type: String },
  wooviId: { type: String },
  misticId: { type: String },
  // Provider usado: 'efi', 'woovi' ou 'mistic'
  provider: { type: String, enum: ["efi", "woovi", "mistic"], default: "mistic" },
  status: { type: String, enum: ["pending", "approved", "cancelled"], default: "pending" },
  qrCodeBase64: String,
  qrCodeText: String,
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  // Raw responses dos provedores
  efiRaw: { type: mongoose.Schema.Types.Mixed },
  wooviRaw: { type: mongoose.Schema.Types.Mixed },
  misticRaw: { type: mongoose.Schema.Types.Mixed },
  metadata: {
    isRenewal: { type: Boolean, default: false },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Application" },
    months: Number,
  },
});

export default mongoose.models.Payment || mongoose.model("Payment", paymentSchema);