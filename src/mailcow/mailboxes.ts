import { mailcowClientFor } from "./client";
import { MailcowServerRow } from "../db";

export async function createMailbox(
  server: MailcowServerRow,
  localPart: string,
  domain: string,
  password: string,
  quotaMb: number
): Promise<void> {
  const { apiPost } = mailcowClientFor(server);
  await apiPost("/add/mailbox", {
    local_part: localPart,
    domain,
    name: localPart,
    quota: quotaMb,
    password,
    password2: password,
    active: "1",
  });
}

export async function deleteMailbox(server: MailcowServerRow, email: string): Promise<void> {
  const { apiPost } = mailcowClientFor(server);
  await apiPost("/delete/mailbox", [email]);
}
