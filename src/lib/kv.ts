// src/lib/kv.ts
import { createClient } from "@vercel/kv";

// Comparaison sécurisée contre les attaques temporelles
function safeCompare(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export const kv = createClient({
  url: import.meta.env.KV_REST_API_URL,
  token: import.meta.env.KV_REST_API_TOKEN,
});

export function verifyAdminToken(request: Request) {
  const auth = request.headers.get("Authorization");
  return auth && auth.startsWith("Bearer ") && safeCompare(auth.substring(7), import.meta.env.ADMIN_TOKEN);
}