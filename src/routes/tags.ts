import { Router } from "express";
import { db, normalizeTagColor } from "../db";
import { requireAuth } from "../middleware/require-auth";

const router = Router();
router.use(requireAuth);

// API usada desde el modal de "Editar correo" en el dashboard — ya no hay
// una página aparte de etiquetas, se crean/asignan ahí mismo.

router.post("/", (req, res) => {
  const { name, color } = req.body as Record<string, string>;
  if (!name || !name.trim()) {
    res.status(400).json({ error: "El nombre es obligatorio." });
    return;
  }
  try {
    const info = db
      .prepare("INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)")
      .run(req.user!.id, name.trim(), normalizeTagColor(color));
    res.json({ id: Number(info.lastInsertRowid), name: name.trim(), color: normalizeTagColor(color) });
  } catch {
    res.status(400).json({ error: "Ya tienes una etiqueta con ese nombre." });
  }
});

router.post("/:id/color", (req, res) => {
  const { color } = req.body as Record<string, string>;
  const normalized = normalizeTagColor(color);
  db.prepare("UPDATE tags SET color = ? WHERE id = ? AND user_id = ?").run(
    normalized,
    req.params.id,
    req.user!.id
  );
  res.json({ ok: true, color: normalized });
});

router.post("/:id/delete", (req, res) => {
  db.prepare("DELETE FROM tags WHERE id = ? AND user_id = ?").run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

export default router;
