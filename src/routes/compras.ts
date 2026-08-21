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
  monto: number | null;
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
      `SELECT r.id, r.compra_email_id, r.correo, r.tarjeta, r.monto, r.created_at, r.tag_id, t.name as tag_name
       FROM compra_registros r
       LEFT JOIN compra_tags t ON t.id = r.tag_id
       WHERE r.compra_email_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(email.id) as unknown as RegistroWithTag[];
  res.json({ registros });
});

router.post("/compras/registros", (req, res) => {
  const body = req.body as Record<string, string>;
  const email = getOwnEmail(req, body.compra_email_id);
  if (!email) {
    res.status(400).json({ error: "Correo inválido." });
    return;
  }
  const correo = (body.correo || "").trim();
  if (!correo) {
    res.status(400).json({ error: "El correo es obligatorio." });
    return;
  }
  // La tienda (etiqueta) se elige primero — sin eso no se guarda el gasto.
  const tag = body.tag_id ? getOwnTag(req, body.tag_id) : undefined;
  if (!tag) {
    res.status(400).json({ error: "Elige primero la tienda (etiqueta)." });
    return;
  }
  const tarjeta = (body.tarjeta || "").trim() || null;
  const montoNum = body.monto ? Number(body.monto) : null;
  const monto = montoNum !== null && !Number.isNaN(montoNum) ? montoNum : null;

  const info = db
    .prepare(
      "INSERT INTO compra_registros (user_id, compra_email_id, correo, tarjeta, tag_id, monto) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(req.user!.id, email.id, correo, tarjeta, tag.id, monto);

  const registro = db
    .prepare(
      `SELECT r.id, r.compra_email_id, r.correo, r.tarjeta, r.monto, r.created_at, r.tag_id, t.name as tag_name
       FROM compra_registros r
       LEFT JOIN compra_tags t ON t.id = r.tag_id
       WHERE r.id = ?`
    )
    .get(info.lastInsertRowid) as unknown as RegistroWithTag;
  res.json({ registro });
});

router.post("/compras/registros/:id/delete", (req, res) => {
  db.prepare("DELETE FROM compra_registros WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.user!.id
  );
  res.json({ ok: true });
});

export default router;
