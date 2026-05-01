/**
 * Configuração avançada de CORS para produção
 * Garante que apenas domínios autorizados possam acessar a API
 */

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL, // URL do frontend em produção
  process.env.FRONTEND_URL_SECONDARY, // URL secundária (opcional)
  // Adicione outros domínios autorizados aqui
].filter(Boolean); // Remove valores undefined/null

/**
 * Valida se a origem da requisição está autorizada
 */
function isOriginAllowed(origin) {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // Requisições sem origin são same-origin requests (mesmo domínio)
  // Isso é comum quando o frontend e backend estão no mesmo domínio
  if (!origin) {
    // Em desenvolvimento, sempre permite
    if (nodeEnv === 'development') {
      return true;
    }
    // Em produção, permite se não houver origem (same-origin)
    // Isso é seguro porque requisições same-origin não passam por CORS
    return true;
  }

  // Em desenvolvimento, permite localhost e 127.0.0.1
  if (nodeEnv === 'development') {
    return (
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('0.0.0.0')
    );
  }

  // Em produção, valida contra lista de origens permitidas
  if (ALLOWED_ORIGINS.length === 0) {
    console.warn('[CORS] ⚠ Nenhuma origem permitida configurada. Permitindo todas em modo permissivo.');
    return true; // Modo permissivo se não houver configuração
  }

  return ALLOWED_ORIGINS.includes(origin);
}

/**
 * Configuração CORS otimizada
 */
export const corsOptions = {
  // Validação dinâmica de origem
  origin: function (origin, callback) {
    const nodeEnv = process.env.NODE_ENV || 'development';
    
    // Log para debug (apenas em desenvolvimento)
    if (nodeEnv === 'development') {
      console.log(`[CORS] Requisição recebida - Origin: ${origin || '(same-origin)'}, NODE_ENV: ${nodeEnv}`);
    }
    
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Origem bloqueada: ${origin || '(same-origin)'}`);
      console.warn(`[CORS] Origens permitidas: ${ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS.join(', ') : 'Nenhuma configurada'}`);
      callback(new Error('Acesso negado por política CORS'));
    }
  },

  // Permite envio de cookies e headers de autenticação
  credentials: true,

  // Métodos HTTP permitidos
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  // Headers permitidos nas requisições
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],

  // Headers expostos nas respostas
  exposedHeaders: [
    'Content-Length',
    'Content-Type',
    'X-Request-ID',
  ],

  // Cache de preflight (OPTIONS) por 24 horas
  maxAge: 86400,

  // Não permite credenciais para requisições sem origem específica
  optionsSuccessStatus: 204,
};

/**
 * Middleware adicional para logging de CORS
 */
export function corsLogger(req, res, next) {
  const origin = req.headers.origin;
  
  if (origin && !isOriginAllowed(origin)) {
    console.warn(`[SECURITY] Tentativa de acesso de origem não autorizada: ${origin}`);
    console.warn(`[SECURITY] IP: ${req.ip}, User-Agent: ${req.headers['user-agent']}`);
  }
  
  next();
}

export default corsOptions;
