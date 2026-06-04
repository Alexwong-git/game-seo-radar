export function isAuthConfigured() {
  return Boolean(process.env.RADAR_PASSWORD);
}

export function requirePrivateAccess(request, response) {
  const password = process.env.RADAR_PASSWORD;
  if (!password) return true;

  const header = request.headers.authorization || "";
  const encoded = header.startsWith("Basic ") ? header.slice(6) : "";
  const decoded = encoded ? Buffer.from(encoded, "base64").toString("utf8") : "";
  const [user, pass] = decoded.split(":");

  if ((user || "admin") === (process.env.RADAR_USER || "admin") && pass === password) {
    return true;
  }

  response.writeHead(401, {
    "www-authenticate": 'Basic realm="Game SEO Radar", charset="UTF-8"',
    "content-type": "text/plain; charset=utf-8"
  });
  response.end("Authentication required.");
  return false;
}
