import { UserRow } from "../db";

declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
    }
    interface Locals {
      user?: UserRow;
    }
  }
}

export {};
