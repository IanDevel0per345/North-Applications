/**
 * Serviço de email usando Resend API
 * https://resend.com/docs/api-reference/emails/send-email
 */

import axios from "axios";

const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Envia email usando Resend API
 * @param {object} params
 * @param {string} params.to - Destinatário
 * @param {string} params.subject - Assunto
 * @param {string} params.html - Conteúdo HTML
 * @param {string} params.text - Conteúdo texto (opcional)
 * @param {string} params.replyTo - Reply-to (opcional)
 * @returns {Promise<{id: string}>}
 */
export async function sendMail({ to, subject, html, text, replyTo }) {
  if (!to || !subject || (!html && !text)) {
    throw new Error("Parâmetros inválidos: 'to', 'subject' e 'html' ou 'text' são obrigatórios");
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY não configurada");
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@visionapplications.com.br";
  const fromName = process.env.EMAIL_FROM_NAME || "Vision Applications";

  try {
    const response = await axios.post(
      RESEND_API_URL,
      {
        from: `${fromName} <${fromEmail}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
        reply_to: replyTo,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`[RESEND] Email enviado com sucesso. ID: ${response.data.id}`);
    return { id: response.data.id };
  } catch (error) {
    console.error("[RESEND] Erro ao enviar email:", error.response?.data || error.message);
    throw error;
  }
}

/**
 * Verifica se a configuração do Resend está correta
 * (Não há endpoint de verificação, apenas checamos as env vars)
 */
export async function verifyTransport() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada");
  }
  return true;
}
