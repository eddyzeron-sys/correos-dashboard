import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../middleware/require-auth";

const router = Router();
router.use(requireAuth);

router.get("/configuracion", (req, res) => {
  res.render("configuracion", { activeNav: "configuracion", saved: req.query.saved === "1" });
});

// Preferencia por-usuario de qué menús mostrar en el sidebar — no bloquea el
// acceso a esas páginas, solo las oculta de la navegación.
router.post("/configuracion", (req, res) => {
  const body = req.body as Record<string, string>;
  const hideCorreos = body.show_correos ? 0 : 1;
  const hideTrackings = body.show_trackings ? 0 : 1;
  const hideCompras = body.show_compras ? 0 : 1;
  db.prepare("UPDATE users SET hide_correos = ?, hide_trackings = ?, hide_compras = ? WHERE id = ?").run(
    hideCorreos,
    hideTrackings,
    hideCompras,
    req.user!.id
  );
  res.redirect("/configuracion?saved=1");
});

export default router;
