import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";

const router = Router();
router.use(requireAuth);

// Landing al entrar a la plataforma: un menú con las opciones disponibles,
// respetando qué menús ocultó el usuario desde /configuracion.
router.get("/inicio", (req, res) => {
  res.render("inicio", { activeNav: "inicio" });
});

export default router;
