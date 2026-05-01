export default function getRedirectUri(req) {
  const explicit = process.env.DISCORD_REDIRECT_URI;
  if (explicit) return explicit;

  const frontendBase = process.env.FRONTEND_URL;
  if (frontendBase) return `${frontendBase}/api/auth/callback`;

  const protocol = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}/auth/callback`;
}


