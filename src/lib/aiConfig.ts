import crypto from "crypto";

/**
 * Шифрование общего ключа OpenRouter (AES-256-GCM). Секрет живёт только в
 * переменной окружения Vercel — в базе лежит исключительно шифротекст,
 * так что даже прямой вызов SQL-функции извне отдаёт бесполезные байты.
 */
const ALGORITHM = "aes-256-gcm";

function secretKey(): Buffer {
  const secret = process.env.AI_CONFIG_SECRET;
  if (!secret) throw new Error("AI_CONFIG_SECRET не задан в переменных окружения");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptApiKey(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptApiKey(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
