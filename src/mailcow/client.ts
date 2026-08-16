import axios from "axios";
import https from "https";
import { decrypt } from "../crypto";
import { MailcowServerRow } from "../db";

export class MailcowError extends Error {}

// El certificado de Mailcow es autofirmado hasta que quede detrás de un dominio
// con Let's Encrypt válido; esta llamada es servidor-a-servidor, no un navegador,
// así que se acepta por ahora.
export function mailcowClientFor(server: MailcowServerRow) {
  const apiKey = decrypt(server.api_key_encrypted);
  const baseURL = server.server_url.startsWith("http")
    ? server.server_url
    : `https://${server.server_url}`;

  const http = axios.create({
    baseURL,
    headers: { "X-API-Key": apiKey },
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    timeout: 15000,
  });

  async function apiGet<T = unknown>(path: string): Promise<T> {
    const res = await http.get(`/api/v1${path}`);
    return res.data as T;
  }

  // Mailcow no solo usa "error" para indicar que algo falló — "danger" también
  // es una falla real (ej. al chocar con el límite de buzones del dominio),
  // solo que la app antes no lo detectaba y guardaba el correo como creado
  // aunque Mailcow lo hubiera rechazado.
  const FAILURE_TYPES = new Set(["error", "danger"]);

  async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await http.post(`/api/v1${path}`, body);
    const data = res.data as any;
    const results = Array.isArray(data) ? data : [data];
    const errored = results.find((r) => r && FAILURE_TYPES.has(r.type));
    if (errored) {
      const msg = Array.isArray(errored.msg) ? errored.msg.join(" ") : errored.msg;
      throw new MailcowError(msg || "Error desconocido de Mailcow");
    }
    return data as T;
  }

  return { apiGet, apiPost };
}
