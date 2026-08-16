import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "..", ".env") });
import express from "express";
import session from "express-session";
import { seedFirstAdminIfMissing } from "./db";
import { SqliteSessionStore } from "./session-store";
import authRoutes from "./routes/auth";
import setupRoutes from "./routes/setup";
import dashboardRoutes from "./routes/dashboard";
import inboxRoutes from "./routes/inbox";
import adminUsersRoutes from "./routes/admin-users";
import tagsRoutes from "./routes/tags";

const requiredEnv = ["SESSION_SECRET", "ENCRYPTION_KEY", "ADMIN_USER", "ADMIN_PASS"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Falta la variable de entorno ${key} en .env. Copia .env.example y complétalo.`);
    process.exit(1);
  }
}

seedFirstAdminIfMissing(process.env.ADMIN_USER as string, process.env.ADMIN_PASS as string);

const app = express();
// Detrás de un proxy (Traefik en EasyPanel u otro reverse proxy) hay que confiar
// en el primer salto para que req.ip/X-Forwarded-For se lean bien — si no,
// express-rate-limit truena en cada petición y las cookies "secure" no funcionan.
app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "src", "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "src", "public")));

app.use(
  session({
    store: new SqliteSessionStore(),
    secret: process.env.SESSION_SECRET as string,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 12,
    },
  })
);

app.get("/", (req, res) => res.redirect("/dashboard"));

app.use(authRoutes);
app.use("/setup", setupRoutes);
app.use(dashboardRoutes);
app.use(inboxRoutes);
app.use("/admin/users", adminUsersRoutes);
app.use("/tags", tagsRoutes);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Dashboard de correos corriendo en http://localhost:${port}`);
});

