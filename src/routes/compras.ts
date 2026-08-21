import { Router, Request } from "express";
import { db, CompraEmailRow, CompraTagRow } from "../db";
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

type RegistroWithTag = {
  id: number;
  compra_email_id: number;
  correo: string;
  tarjeta: string | null;
  montos: string | null;
  created_at: string;
  tag_id: number | null;
  tag_name: string | null;
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

// Registros de compra de un correo en particular.
router.get("/compras/emails/:id/registros", (req, res) => {
  const email = getOwnEmail(req, req.params.id);
  if (!email) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const registros = db
    .prepare(
      `SELECT r.id, r.compra_email_id, r.correo, r.tarjeta, r.montos, r.created_at, r.tag_id, t.name as tag_name
       FROM compra_registros r
       LEFT JOIN compra_tags t ON t.id = r.tag_id
       WHERE r.compra_email_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(email.id) as unknown as RegistroWithTag[];
  res.json({ registros });
});

function getRegistroWithTag(id: number | bigint): RegistroWithTag {
  return db
    .prepare(
      `SELECT r.id, r.compra_email_id, r.correo, r.tarjeta, r.montos, r.created_at, r.tag_id, t.name as tag_name
       FROM compra_registros r
       LEFT JOIN compra_tags t ON t.id = r.tag_id
       WHERE r.id = ?`
    )
    .get(id) as unknown as RegistroWithTag;
}

// Valida y devuelve los campos comunes a crear/editar una compra, o null (ya
// respondió el error) si algo falta.
function parseRegistroBody(
  req: Request,
  res: import("express").Response
): { correo: string; tarjeta: string | null; tagId: number; montos: string | null } | null {
  const body = req.body as Record<string, string>;
  const correo = (body.correo || "").trim();
  if (!correo) {
    res.status(400).json({ error: "El correo es obligatorio." });
    return null;
  }
  // La tienda se elige primero — sin eso no se guarda el gasto.
  const tag = body.tag_id ? getOwnTag(req, body.tag_id) : undefined;
  if (!tag) {
    res.status(400).json({ error: "Elige primero la tienda." });
    return null;
  }
  const tarjeta = (body.tarjeta || "").trim() || null;
  // Los montos se guardan tal cual se ingresaron, separados por coma — sin
  // sumarlos. Ej. "15,59" queda como "Depop: $15, $59" al mostrarse.
  const montosRaw = (body.montos || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "" && !Number.isNaN(Number(s)));
  const montos = montosRaw.length ? montosRaw.join(",") : null;
  return { correo, tarjeta, tagId: tag.id, montos };
}

router.post("/compras/registros", (req, res) => {
  const email = getOwnEmail(req, (req.body as Record<string, string>).compra_email_id);
  if (!email) {
    res.status(400).json({ error: "Correo inválido." });
    return;
  }
  const parsed = parseRegistroBody(req, res);
  if (!parsed) return;

  const info = db
    .prepare(
      "INSERT INTO compra_registros (user_id, compra_email_id, correo, tarjeta, tag_id, montos) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(req.user!.id, email.id, parsed.correo, parsed.tarjeta, parsed.tagId, parsed.montos);

  res.json({ registro: getRegistroWithTag(info.lastInsertRowid) });
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

  db.prepare("UPDATE compra_registros SET correo = ?, tarjeta = ?, tag_id = ?, montos = ? WHERE id = ?").run(
    parsed.correo,
    parsed.tarjeta,
    parsed.tagId,
    parsed.montos,
    existing.id
  );

  res.json({ registro: getRegistroWithTag(existing.id) });
});

router.post("/compras/registros/:id/delete", (req, res) => {
  db.prepare("DELETE FROM compra_registros WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.user!.id
  );
  res.json({ ok: true });
});

export default router;
