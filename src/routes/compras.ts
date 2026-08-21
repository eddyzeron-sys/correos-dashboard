import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";

const router = Router();
router.use(requireAuth);

router.get("/compras", (req, res) => {
  res.render("compras", { activeNav: "compras", error: null });
});

export default router;
