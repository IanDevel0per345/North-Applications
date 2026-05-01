/**
 * Middleware para configurar headers de segurança HTTP
 * Protege contra vulnerabilidades comuns (XSS, clickjacking, etc.)
 */

import { securityConfig } from '../config/security.js';

/**
 * Aplica headers de segurança em todas as respostas
 */
export default function securityHeaders(req, res, next) {
  // Remove header que expõe tecnologia usada
  res.removeHeader('X-Powered-By');

  // Previne clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Previne MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Ativa proteção XSS do navegador
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Força HTTPS em produção
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      `max-age=${securityConfig.headers.hsts.maxAge}; includeSubDomains; preload`
    );
  }

  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', csp);

  // Previne que o navegador envie o Referer para outros domínios
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Controla quais features do navegador podem ser usadas
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=()'
  );

  // Adiciona ID único para rastreamento de requisições
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', requestId);
  req.requestId = requestId;

  next();
}

/**
 * Middleware para logging de requisições suspeitas
 */
export function suspiciousActivityLogger(req, res, next) {
  const suspiciousPatterns = [
    /(\.\.|\/etc\/|\/proc\/|\/sys\/)/i, // Path traversal
    /(union.*select|insert.*into|drop.*table)/i, // SQL injection
    /(<script|javascript:|onerror=|onload=)/i, // XSS
    /(eval\(|exec\(|system\()/i, // Code injection
  ];

  const checkString = `${req.url} ${JSON.stringify(req.query)} ${JSON.stringify(req.body)}`;

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(checkString)) {
      console.error('[SECURITY] Atividade suspeita detectada!');
      console.error(`[SECURITY] IP: ${req.ip}`);
      console.error(`[SECURITY] URL: ${req.url}`);
      console.error(`[SECURITY] User-Agent: ${req.headers['user-agent']}`);
      console.error(`[SECURITY] Pattern: ${pattern}`);
      
      return res.status(403).json({
        error: 'Requisição bloqueada por motivos de segurança',
      });
    }
  }

  next();
}
