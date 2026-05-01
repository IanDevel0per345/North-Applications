import User from "../database/models/User.js";

export default async function requireAdmin(req, res, next) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      console.warn(`[REQUIRE ADMIN] Acesso negado - Usuário não autenticado`);
      return res.status(401).json({ error: "Não autenticado" });
    }

    const user = await User.findById(userId).select("admin email").lean();
    if (!user) {
      console.warn(`[REQUIRE ADMIN] Acesso negado - Usuário não encontrado: ${userId}`);
      return res.status(401).json({ error: "Usuário não encontrado" });
    }
    
    if (!user.admin) {
      console.warn(`[REQUIRE ADMIN] Acesso negado - Usuário sem permissão de admin: ${user.email}`);
      return res.status(403).json({ error: "Acesso negado" });
    }

    console.log(`[REQUIRE ADMIN] Acesso autorizado - Admin: ${user.email}`);
    next();
  } catch (err) {
    console.error(`[REQUIRE ADMIN] Erro ao verificar permissões:`, err);
    return res.status(500).json({ error: "Erro de autorização" });
  }
}


