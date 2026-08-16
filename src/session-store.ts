import { Store } from "express-session";
import { db } from "./db";

// MemoryStore (la que usa express-session por defecto) no sirve en producción:
// no libera memoria y pierde todas las sesiones cada vez que el proceso se
// reinicia. Esta guarda las sesiones en la misma base SQLite que ya usa la app.

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
`);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class SqliteSessionStore extends Store {
  constructor() {
    super();
    const cleanup = () => {
      db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
    };
    cleanup();
    setInterval(cleanup, ONE_DAY_MS).unref();
  }

  get(sid: string, callback: (err: unknown, session?: any) => void): void {
    try {
      const row = db.prepare("SELECT sess, expires FROM sessions WHERE sid = ?").get(sid) as
        | { sess: string; expires: number }
        | undefined;
      if (!row || row.expires < Date.now()) {
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(row.sess));
    } catch (err) {
      callback(err);
    }
  }

  set(sid: string, session: any, callback?: (err?: unknown) => void): void {
    try {
      const expires = session.cookie?.expires
        ? new Date(session.cookie.expires).getTime()
        : Date.now() + ONE_DAY_MS;
      db.prepare(
        `INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires`
      ).run(sid, JSON.stringify(session), expires);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    try {
      db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  touch(sid: string, session: any, callback?: (err?: unknown) => void): void {
    this.set(sid, session, callback);
  }
}
