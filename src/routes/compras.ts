import { Router, Request } from "express";
import { db, CompraEmailRow, CompraTagRow, CompraTarjetaRow } from "../db";
import { requireAuth } from "../middleware/require-auth";

const router = Router();
router.use(requireAuth);

function listOwnEmails(req: Request): CompraEmailRow[] {
  return db
    .prepare("SELECT * FROM compra_emails WHERE user_id = ? ORDER BY email")
    .all(req.user!.id) as unknown as CompraEmailRow[];
}

function getOwnEmail(req: Request, id: string): CompraEmailRow | undefined {
  return db
    .prepare("SELECT * FROM compra_emails WHERE id = ? AND user_id = ?")
    .get(id, req.user!.id) as CompraEmailRow | undefined;
}

type TarjetaWithUsage = CompraTarjetaRow & { used: number; enviada_count: number };

// "Usada" = ya existe alguna compra de este correo con ese mismo texto de
// tarjeta. "Enviada" = de esas compras, cuántas ya tienen algún tracking
// cargado. Las sin usar van primero, las usadas al final.
function listTarjetasForEmail(emailId: number): TarjetaWithUsage[] {
  return db
    .prepare(
      `SELECT t.*,
         EXISTS(
           SELECT 1 FROM compra_registros r WHERE r.compra_email_id = t.compra_email_id AND r.tarjeta = t.tarjeta
         ) as used,
         (
           SELECT COUNT(*) FROM compra_registros r
           WHERE r.compra_email_id = t.compra_email_id AND r.tarjeta = t.tarjeta
             AND EXISTS(SELECT 1 FROM compra_registro_trackings tr WHERE tr.compra_registro_id = r.id)
         ) as enviada_count
       FROM compra_tarjetas t
       WHERE t.compra_email_id = ?
       ORDER BY used ASC, t.created_at DESC`
    )
    .all(emailId) as unknown as TarjetaWithUsage[];
}

function getTarjetaUsage(emailId: number, tarjeta: string): { used: boolean; enviadaCount: number } {
  const row = db
    .prepare(
      `SELECT
         EXISTS(SELECT 1 FROM compra_registros WHERE compra_email_id = ? AND tarjeta = ?) as used,
         (
           SELECT COUNT(*) FROM compra_registros r
           WHERE r.compra_email_id = ? AND r.tarjeta = ?
             AND EXISTS(SELECT 1 FROM compra_registro_trackings tr WHERE tr.compra_registro_id = r.id)
         ) as enviada_count`
    )
    .get(emailId, tarjeta, emailId, tarjeta) as { used: number; enviada_count: number };
  return { used: !!row.used, enviadaCount: row.enviada_count };
}

function getOwnTarjeta(req: Request, id: string): CompraTarjetaRow | undefined {
  return db
    .prepare("SELECT * FROM compra_tarjetas WHERE id = ? AND user_id = ?")
    .get(id, req.user!.id) as CompraTarjetaRow | undefined;
}

function listOwnTags(req: Request): CompraTagRow[] {
  return db
    .prepare("SELECT * FROM compra_tags WHERE user_id = ? ORDER BY name")
    .all(req.user!.id) as unknown as CompraTagRow[];
}

function getOwnTag(req: Request, id: string): { id: number } | undefined {
  return db
    .prepare("SELECT id FROM compra_tags WHERE id = ? AND user_id = ?")
    .get(id, req.user!.id) as { id: number } | undefined;
}

type TiendaGroup = {
  tag_id: number | null;
  tag_name: string | null;
  montos: string | null;
};

type TrackingEntry = {
  id: number;
  numero_tracking: string;
  precio: number | null;
  articulo: string | null;
};

type RegistroWithTiendas = {
  id: number;
  compra_email_id: number;
  correo: string;
  tarjeta: string | null;
  descripcion: string | null;
  created_at: string;
  tiendas: TiendaGroup[];
  trackings: TrackingEntry[];
};

router.get("/compras", (req, res) => {
  res.render("compras", {
    emails: listOwnEmails(req),
    tags: listOwnTags(req),
    activeNav: "compras",
    error: null,
  });
});

router.post("/compras/emails", (req, res) => {
  const email = ((req.body as Record<string, string>).email || "").trim();
  if (!email) {
    res.status(400).json({ error: "El correo es obligatorio." });
    return;
  }
  const info = db
    .prepare("INSERT INTO compra_emails (user_id, email) VALUES (?, ?)")
    .run(req.user!.id, email);
  res.json({ id: Number(info.lastInsertRowid), email });
});

router.post("/compras/emails/:id", (req, res) => {
  const existing = getOwnEmail(req, req.params.id);
  if (!existing) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const email = ((req.body as Record<string, string>).email || "").trim();
  if (!email) {
    res.status(400).json({ error: "El correo es obligatorio." });
    return;
  }
  db.prepare("UPDATE compra_emails SET email = ? WHERE id = ?").run(email, existing.id);
  res.json({ id: existing.id, email });
});

router.post("/compras/emails/:id/delete", (req, res) => {
  const existing = getOwnEmail(req, req.params.id);
  if (!existing) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  db.prepare("DELETE FROM compra_emails WHERE id = ?").run(existing.id);
  res.json({ ok: true });
});

// "Mis tarjetas" — libreta de tarjetas guardadas dentro del registro de
// compras de cada correo. Se puede elegir una desde el formulario de
// compra (el texto se copia tal cual a compra_registros.tarjeta, sin FK).
router.get("/compras/emails/:id/tarjetas", (req, res) => {
  const email = getOwnEmail(req, req.params.id);
  if (!email) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  res.json({ tarjetas: listTarjetasForEmail(email.id) });
});

router.post("/compras/tarjetas", (req, res) => {
  const body = req.body as Record<string, string>;
  const email = getOwnEmail(req, body.compra_email_id || "");
  if (!email) {
    res.status(400).json({ error: "Correo inválido." });
    return;
  }
  const tarjeta = (body.tarjeta || "").trim();
  if (!tarjeta) {
    res.status(400).json({ error: "La tarjeta es obligatoria." });
    return;
  }
  try {
    const info = db
      .prepare("INSERT INTO compra_tarjetas (user_id, compra_email_id, tarjeta) VALUES (?, ?, ?)")
      .run(req.user!.id, email.id, tarjeta);
    const usage = getTarjetaUsage(email.id, tarjeta);
    res.json({ id: Number(info.lastInsertRowid), tarjeta, used: usage.used, enviada_count: usage.enviadaCount });
  } catch {
    res.status(400).json({ error: "Ya tienes esa tarjeta guardada para este correo." });
  }
});

router.post("/compras/tarjetas/:id", (req, res) => {
  const existing = getOwnTarjeta(req, req.params.id);
  if (!existing) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const tarjeta = ((req.body as Record<string, string>).tarjeta || "").trim();
  if (!tarjeta) {
    res.status(400).json({ error: "La tarjeta es obligatoria." });
    return;
  }
  try {
    db.prepare("UPDATE compra_tarjetas SET tarjeta = ? WHERE id = ?").run(tarjeta, existing.id);
    const usage = getTarjetaUsage(existing.compra_email_id, tarjeta);
    res.json({ id: existing.id, tarjeta, used: usage.used, enviada_count: usage.enviadaCount });
  } catch {
    res.status(400).json({ error: "Ya tienes esa tarjeta guardada para este correo." });
  }
});

router.post("/compras/tarjetas/:id/delete", (req, res) => {
  const existing = getOwnTarjeta(req, req.params.id);
  if (!existing) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  db.prepare("DELETE FROM compra_tarjetas WHERE id = ?").run(existing.id);
  res.json({ ok: true });
});

// Etiquetas de página (Depop, Vinted, etc.) — propias de Compras, no las del dashboard.
router.post("/compras/tags", (req, res) => {
  const name = ((req.body as Record<string, string>).name || "").trim();
  if (!name) {
    res.status(400).json({ error: "El nombre es obligatorio." });
    return;
  }
  try {
    const info = db
      .prepare("INSERT INTO compra_tags (user_id, name) VALUES (?, ?)")
      .run(req.user!.id, name);
    res.json({ id: Number(info.lastInsertRowid), name });
  } catch {
    res.status(400).json({ error: "Ya tienes una etiqueta con ese nombre." });
  }
});

function getTiendasForRegistro(registroId: number): TiendaGroup[] {
  return db
    .prepare(
      `SELECT t.tag_id, tg.name as tag_name, t.montos
       FROM compra_registro_tiendas t
       LEFT JOIN compra_tags tg ON tg.id = t.tag_id
       WHERE t.compra_registro_id = ?
       ORDER BY t.id`
    )
    .all(registroId) as unknown as TiendaGroup[];
}

function getTrackingsForRegistro(registroId: number): TrackingEntry[] {
  return db
    .prepare(
      `SELECT id, numero_tracking, precio, articulo
       FROM compra_registro_trackings
       WHERE compra_registro_id = ?
       ORDER BY id`
    )
    .all(registroId) as unknown as TrackingEntry[];
}

function getRegistroWithTiendas(id: number | bigint): RegistroWithTiendas {
  const base = db
    .prepare("SELECT id, compra_email_id, correo, tarjeta, descripcion, created_at FROM compra_registros WHERE id = ?")
    .get(id) as Omit<RegistroWithTiendas, "tiendas" | "trackings">;
  return { ...base, tiendas: getTiendasForRegistro(Number(id)), trackings: getTrackingsForRegistro(Number(id)) };
}

// Registros de compra de un correo en particular. Cada registro es UNA
// tarjeta que puede agrupar varias tiendas (ej. Depop y Vinted juntas).
router.get("/compras/emails/:id/registros", (req, res) => {
  const email = getOwnEmail(req, req.params.id);
  if (!email) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const base = db
    .prepare(
      `SELECT id, compra_email_id, correo, tarjeta, descripcion, created_at
       FROM compra_registros WHERE compra_email_id = ? ORDER BY created_at DESC`
    )
    .all(email.id) as Omit<RegistroWithTiendas, "tiendas" | "trackings">[];
  const registros: RegistroWithTiendas[] = base.map((r) => ({
    ...r,
    tiendas: getTiendasForRegistro(r.id),
    trackings: getTrackingsForRegistro(r.id),
  }));
  res.json({ registros });
});

// Valida y devuelve los campos comunes a crear/editar una compra, o null (ya
// respondió el error) si algo falta.
function parseRegistroBody(
  req: Request,
  res: import("express").Response
): {
  correo: string;
  tarjeta: string | null;
  descripcion: string | null;
  tiendas: { tagId: number; montos: string | null }[];
  trackings: { numeroTracking: string; precio: number | null; articulo: string | null }[];
} | null {
  const body = req.body as {
    correo?: string;
    tarjeta?: string;
    descripcion?: string;
    tiendas?: { tag_id?: string | number; montos?: string }[];
    trackings?: { numero_tracking?: string; precio?: string | number; articulo?: string }[];
  };
  const correo = (body.correo || "").trim();
  if (!correo) {
    res.status(400).json({ error: "El correo es obligatorio." });
    return null;
  }
  // Cada tarjeta de compra es de UNA sola tienda — si el cliente manda más
  // de una (dato viejo/manipulado), solo se usa la primera.
  const rawTiendas = (Array.isArray(body.tiendas) ? body.tiendas : []).slice(0, 1);
  const tiendas: { tagId: number; montos: string | null }[] = [];
  for (const t of rawTiendas) {
    const tag = t && t.tag_id !== undefined ? getOwnTag(req, String(t.tag_id)) : undefined;
    if (!tag) continue;
    // Los montos se guardan tal cual se ingresaron, separados por coma — sin
    // sumarlos. Ej. "15,59" queda como "Depop: $15, $59" al mostrarse.
    const montosRaw = String(t.montos || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "" && !Number.isNaN(Number(s)));
    tiendas.push({ tagId: tag.id, montos: montosRaw.length ? montosRaw.join(",") : null });
  }
  if (!tiendas.length) {
    res.status(400).json({ error: "Elige la tienda." });
    return null;
  }
  const tarjeta = (body.tarjeta || "").trim() || null;
  const descripcion = (body.descripcion || "").trim() || null;

  const rawTrackings = Array.isArray(body.trackings) ? body.trackings : [];
  const trackings: { numeroTracking: string; precio: number | null; articulo: string | null }[] = [];
  for (const t of rawTrackings) {
    const numeroTracking = String((t && t.numero_tracking) || "").trim();
    if (!numeroTracking) continue;
    const precioNum = t && t.precio !== undefined && t.precio !== "" ? Number(t.precio) : NaN;
    const precio = !Number.isNaN(precioNum) ? precioNum : null;
    const articulo = String((t && t.articulo) || "").trim() || null;
    trackings.push({ numeroTracking, precio, articulo });
  }

  return { correo, tarjeta, descripcion, tiendas, trackings };
}

router.post("/compras/registros", (req, res) => {
  const email = getOwnEmail(req, (req.body as { compra_email_id?: string }).compra_email_id || "");
  if (!email) {
    res.status(400).json({ error: "Correo inválido." });
    return;
  }
  const parsed = parseRegistroBody(req, res);
  if (!parsed) return;

  const info = db
    .prepare(
      "INSERT INTO compra_registros (user_id, compra_email_id, correo, tarjeta, descripcion) VALUES (?, ?, ?, ?, ?)"
    )
    .run(req.user!.id, email.id, parsed.correo, parsed.tarjeta, parsed.descripcion);
  const registroId = Number(info.lastInsertRowid);
  const insertTienda = db.prepare(
    "INSERT INTO compra_registro_tiendas (compra_registro_id, tag_id, montos) VALUES (?, ?, ?)"
  );
  for (const t of parsed.tiendas) insertTienda.run(registroId, t.tagId, t.montos);
  const insertTracking = db.prepare(
    "INSERT INTO compra_registro_trackings (compra_registro_id, numero_tracking, precio, articulo) VALUES (?, ?, ?, ?)"
  );
  for (const t of parsed.trackings) insertTracking.run(registroId, t.numeroTracking, t.precio, t.articulo);

  res.json({ registro: getRegistroWithTiendas(registroId) });
});

router.post("/compras/registros/:id", (req, res) => {
  const existing = db
    .prepare("SELECT id FROM compra_registros WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user!.id) as { id: number } | undefined;
  if (!existing) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const parsed = parseRegistroBody(req, res);
  if (!parsed) return;

  db.prepare("UPDATE compra_registros SET correo = ?, tarjeta = ?, descripcion = ? WHERE id = ?").run(
    parsed.correo,
    parsed.tarjeta,
    parsed.descripcion,
    existing.id
  );
  db.prepare("DELETE FROM compra_registro_tiendas WHERE compra_registro_id = ?").run(existing.id);
  const insertTienda = db.prepare(
    "INSERT INTO compra_registro_tiendas (compra_registro_id, tag_id, montos) VALUES (?, ?, ?)"
  );
  for (const t of parsed.tiendas) insertTienda.run(existing.id, t.tagId, t.montos);

  db.prepare("DELETE FROM compra_registro_trackings WHERE compra_registro_id = ?").run(existing.id);
  const insertTracking = db.prepare(
    "INSERT INTO compra_registro_trackings (compra_registro_id, numero_tracking, precio, articulo) VALUES (?, ?, ?, ?)"
  );
  for (const t of parsed.trackings) insertTracking.run(existing.id, t.numeroTracking, t.precio, t.articulo);

  res.json({ registro: getRegistroWithTiendas(existing.id) });
});

router.post("/compras/registros/:id/delete", (req, res) => {
  db.prepare("DELETE FROM compra_registros WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.user!.id
  );
  res.json({ ok: true });
});

export default router;
