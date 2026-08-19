import axios from "axios";

export interface ResolvedTracking {
  carrier: string;
  trackingNumber: string;
  url: string;
}

// Cada patrón sabe reconocer el dominio final de un carrier y qué parámetro
// de la URL trae el número de rastreo, para armar un link limpio y directo.
const CARRIER_PATTERNS: {
  hostIncludes: string;
  param: string;
  carrier: string;
  buildUrl: (num: string) => string;
}[] = [
  {
    hostIncludes: "usps.com",
    param: "origTrackNum",
    carrier: "USPS",
    buildUrl: (num) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${num}`,
  },
];

// Los botones tipo "View my order" en correos de tiendas casi siempre son
// links de rastreo de clics (ESP) que redirigen una sola vez al destino real
// (ej. la página de USPS) — no hace falta cargar la página, solo leer el
// header Location de la respuesta.
async function resolveRedirectTarget(url: string): Promise<string | null> {
  try {
    const res = await axios.get(url, {
      maxRedirects: 0,
      timeout: 6000,
      validateStatus: (status) => status < 400,
    });
    return (res.headers.location as string) || null;
  } catch {
    return null;
  }
}

// Busca en la lista de links (en orden de prioridad) el primero que al
// resolverse apunte a un carrier conocido con número de rastreo.
export async function findTrackingInLinks(links: string[]): Promise<ResolvedTracking | null> {
  for (const link of links) {
    const target = await resolveRedirectTarget(link);
    if (!target) continue;
    try {
      const url = new URL(target);
      for (const pattern of CARRIER_PATTERNS) {
        if (url.hostname.includes(pattern.hostIncludes)) {
          const num = url.searchParams.get(pattern.param);
          if (num) {
            return { carrier: pattern.carrier, trackingNumber: num, url: pattern.buildUrl(num) };
          }
        }
      }
    } catch {
      // URL de destino inválida — seguir con el siguiente link candidato.
    }
  }
  return null;
}

// Extrae los <a href> del HTML del correo, priorizando los que dicen algo
// como "View my order" o "Track" (el patrón real que usa Depop) sobre el
// resto (links de redes sociales, "unsubscribe", etc.).
export function extractCandidateLinks(html: string): string[] {
  const anchors = Array.from(html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi));
  const prioritized: string[] = [];
  const others: string[] = [];
  for (const match of anchors) {
    const href = match[1];
    if (!href.startsWith("http")) continue;
    const text = match[2].replace(/<[^>]+>/g, " ").trim();
    if (/view.*order|track/i.test(text)) {
      prioritized.push(href);
    } else {
      others.push(href);
    }
  }
  return [...prioritized, ...others];
}
