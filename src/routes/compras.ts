import { Router, Request } from "express";
import { db, CompraEmailRow } from "../db";
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

router.get("/compras", (req, res) => {
  res.render("compras", { emails: listOwnEmails(req), activeNav: "compras", error: null });
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

export default router;
