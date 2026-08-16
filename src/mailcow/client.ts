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

  async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await http.post(`/api/v1${path}`, body);
    const data = res.data as any;
    const results = Array.isArray(data) ? data : [data];
    const errored = results.find((r) => r && r.type === "error");
    if (errored) {
      throw new MailcowError(errored.msg || "Error desconocido de Mailcow");
    }
    return data as T;
  }

  return { apiGet, apiPost };
}
