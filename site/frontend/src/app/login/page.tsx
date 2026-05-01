"use client";

import { useState } from "react";
import { Mail, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import EmailLogin from "@/components/auth/EmailLogin";
import GridLines from "@/components/GridLines";

export default function LoginPage() {
  const [method, setMethod] = useState<"discord" | "email" | null>(null);

  const handleDiscordLogin = () => {
    fetch(`/api/auth/login`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.authUrl) window.location.href = data.authUrl;
        else window.location.href = "/";
      })
      .catch(() => window.location.href = "/");
  };

  return (
    <main className="relative flex flex-col items-center justify-center min-h-[calc(100vh-200px)] pt-4 pb-8">
      {/* Grid Background */}
      <GridLines
        className="z-0 opacity-20"
        style={{
          WebkitMaskImage:
            "radial-gradient(60% 60% at 50% 50%, #000 60%, transparent 100%)",
          maskImage:
            "radial-gradient(60% 60% at 50% 50%, #000 60%, transparent 100%)",
        }}
      />

      {/* Blur Effect */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-primary/20 blur-[120px]"
      />

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-2"
        >
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-background/50 backdrop-blur-xl border border-foreground/10 rounded-2xl p-8 shadow-2xl"
        >
          {!method ? (
            /* Escolha de método */
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-center mb-6">
                Escolha como deseja entrar
              </h2>

              {/* Discord Login */}
              <motion.button
                onClick={handleDiscordLogin}
                className="w-full py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium rounded-xl transition-all flex items-center justify-center gap-3 cursor-pointer"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                Continuar com Discord
              </motion.button>

              {/* Divider */}
              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-foreground/10"></div>
                <span className="text-sm text-foreground/50 font-medium">OU</span>
                <div className="flex-1 h-px bg-foreground/10"></div>
              </div>

              {/* Email Login */}
              <motion.button
                onClick={() => setMethod("email")}
                className="w-full py-4 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-3 cursor-pointer"
              >
                <Mail className="w-6 h-6" />
                Continuar com Email
              </motion.button>

              {/* Info */}
              <div className="mt-6 p-4 bg-primary/10 border border-primary/20 rounded-xl">
                <p className="text-sm text-foreground/70 text-center">
                  <span className="text-primary font-medium">Novo por aqui?</span> Faça login com Discord para criar sua conta automaticamente
                </p>
              </div>
            </div>
          ) : method === "email" ? (
            /* Email Login Form */
            <div>
              <button
                onClick={() => setMethod(null)}
                className="text-sm text-foreground/60 hover:text-foreground mb-6 transition-colors flex items-center gap-1"
              >
                ← Voltar
              </button>
              <EmailLogin />
            </div>
          ) : null}
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-center text-foreground/50 text-sm mt-6"
        >
          Ao fazer login, você concorda com nossos{" "}
          <a href="/terms" className="text-primary hover:underline">
            Termos de Serviço
          </a>
        </motion.p>
      </div>
    </main>
  );
}
