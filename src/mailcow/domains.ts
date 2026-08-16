import { mailcowClientFor } from "./client";
import { MailcowServerRow } from "../db";

interface DomainInfo {
  domain_name: string;
}

export async function listDomains(server: MailcowServerRow): Promise<string[]> {
  const { apiGet } = mailcowClientFor(server);
  const domains = await apiGet<DomainInfo[]>("/get/domain/all");
  return domains.map((d) => d.domain_name).sort();
}
