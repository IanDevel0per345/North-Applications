import mongoose from "mongoose";

const HostingSchema = new mongoose.Schema(
  {
    provider: { type: String, default: "discloud" },
    appId: { type: String },
    name: { type: String },
    ram: { type: Number },
    version: { type: String },
    main: { type: String },
    status: { type: String },
    url: { type: String },
    createdAt: { type: Date },
    updatedAt: { type: Date },
    lastDeployAt: { type: Date },
  },
  { _id: false }
);

const BotSchema = new mongoose.Schema(
  {
    token: { type: String, default: null },
    owner: { type: String, default: null },
    id: { type: String, default: null },
    perms: { type: [String], default: [] },
    server: { type: String, default: null },
  },
  { _id: false }
);

const InfoSchema = new mongoose.Schema(
  {
    name: { type: String, default: "North Applications" },
    imageUrl: { type: String, default: null },
    id: { type: String, default: null },
  },
  { _id: false }
);

const ModuleSettingsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    channelId: { type: String, default: "" },
    roleId: { type: String, default: "" },
    logChannelId: { type: String, default: "" },
    title: { type: String, default: "" },
    message: { type: String, default: "" },
    options: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const ApplicationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", index: true },
    name: { type: String, required: true },

    // ID único do bot para vincular com BotConfig
    botID: { type: String, index: true },

    plan: {
      id: { type: String, required: true },
      name: { type: String },
      months: { type: Number },
      price: { type: Number },
      paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    },

    hosting: { type: HostingSchema, default: {} },
    bot: { type: BotSchema, default: {} },
    info: { type: InfoSchema, default: {} },
    modules: {
      store: { type: ModuleSettingsSchema, default: () => ({}) },
      ticket: { type: ModuleSettingsSchema, default: () => ({}) },
      moderation: { type: ModuleSettingsSchema, default: () => ({}) },
      automation: { type: ModuleSettingsSchema, default: () => ({}) },
      giveaway: { type: ModuleSettingsSchema, default: () => ({}) },
      payments: { type: ModuleSettingsSchema, default: () => ({}) },
      channels: { type: ModuleSettingsSchema, default: () => ({}) },
      roles: { type: ModuleSettingsSchema, default: () => ({}) },
      backup: { type: ModuleSettingsSchema, default: () => ({}) },
      extensions: { type: ModuleSettingsSchema, default: () => ({}) },
    },

    expiresAt: { type: Date },
    lastChargeSent: { type: Date, default: null },

    // Controle de atualização em massa
    lastUpdate: { type: Date, default: null },
    lastUpdateBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updateVersion: { type: String, default: null }, // Código de referência da última atualização

    // Controle de bloqueio e deleção
    isBlocked: { type: Boolean, default: false },
    blockedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    canRecover: { type: Boolean, default: true },

    // Controle de plano gratuito
    isFree: { type: Boolean, default: false },
    lastStartedAt: { type: Date, default: Date.now }, // Atualizado quando bot é ligado
    inactivityWarningSentAt: { type: Date, default: null }, // Quando aviso de inatividade foi enviado
  },
  { timestamps: true }
);

// Garante que o owner do bot sempre esteja presente em bot.perms (imutável)
ApplicationSchema.pre("save", function (next) {
  try {
    const bot = this.get("bot");
    const owner = bot?.owner;
    if (owner && typeof owner === "string" && owner.trim().length > 0) {
      const perms = Array.isArray(bot?.perms) ? bot.perms.slice() : [];
      if (!perms.includes(owner)) {
        perms.push(owner);
      }
      this.set("bot.perms", perms);
    }
  } catch {
    // não bloqueia o fluxo em caso de erro não crítico
  }
  next();
});

// Garante em updates/upserts que bot.perms inclua o owner quando definido (findOneAndUpdate não dispara 'save')
ApplicationSchema.pre("findOneAndUpdate", function (next) {
  try {
    const update = this.getUpdate() || {};
    // Normaliza para usar $set
    const set = update.$set || update;
    const owner =
      (set && (set["bot.owner"] ?? (set.bot && set.bot.owner))) ?? null;
    if (typeof owner === "string" && owner.trim().length > 0) {
      // Lê perms do update (se vier) para manter demais entradas
      let perms =
        (set && (set["bot.perms"] ?? (set.bot && set.bot.perms))) ?? undefined;
      if (!Array.isArray(perms)) perms = [];
      if (!perms.includes(owner)) {
        const newPerms = perms.concat([owner]);
        if (!update.$set) update.$set = {};
        update.$set["bot.perms"] = newPerms;
        this.setUpdate(update);
      }
    }
  } catch {
    // não bloqueia o fluxo
  }
  next();
});

ApplicationSchema.index({ userId: 1, "plan.id": 1 });
ApplicationSchema.index(
  { userId: 1, isFree: 1 },
  {
    unique: true,
    partialFilterExpression: { isFree: true, isDeleted: false },
    background: true
  }
);

export default mongoose.models.Application || mongoose.model("Application", ApplicationSchema);
