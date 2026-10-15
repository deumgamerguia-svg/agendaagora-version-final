// Saudação automática do WhatsApp (aba "Saudação" em /painel/lembretes).
// Quando alguém manda mensagem no número do negócio, o provedor (UazAPI ou
// Evolution) avisa via webhook em /api/public/whatsapp-incoming e este módulo
// decide se responde com a saudação configurada (máx. 1 por remetente a cada 24h).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { bookingLinkForSlug, renderMessage } from "./whatsapp-notify.server";

export const GREETING_COOLDOWN_MS = 24 * 60 * 60 * 1_000;

export type IncomingWhatsappMessage = {
  fromMe: boolean;
  isGroup: boolean;
  /** Dígitos com DDI (ex.: 5598999990000). */
  senderPhone: string;
  pushName: string | null;
  text: string;
};

function digitsOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // LIDs (@lid) e IDs internos não são discáveis: só aceita JID de usuário.
  if (!value.includes("@s.whatsapp.net")) return null;
  const digits = value.slice(0, value.indexOf("@")).replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return null;
  return digits;
}

function messageText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const m = message as Record<string, unknown>;
  if (typeof m["conversation"] === "string") return m["conversation"];
  for (const key of ["extendedTextMessage", "imageMessage", "videoMessage", "documentMessage"]) {
    const part = m[key];
    if (part && typeof part === "object") {
      const record = part as Record<string, unknown>;
      if (typeof record["text"] === "string") return record["text"];
      if (typeof record["caption"] === "string") return record["caption"];
    }
  }
  return "";
}

/**
 * Extrai a primeira mensagem recebida de um payload de webhook, aceitando os
 * formatos da UazAPI ({ event: "messages", instance, data }) e da Evolution
 * (MESSAGES_UPSERT, com data.messages[] ou data direto). Retorna null quando
 * não há mensagem de um cliente (própria, grupo, remetente inválido).
 */
export function parseIncomingWhatsapp(payload: unknown): IncomingWhatsappMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data =
    root["data"] && typeof root["data"] === "object"
      ? (root["data"] as Record<string, unknown>)
      : root;
  const candidates: unknown[] = Array.isArray(data["messages"]) ? data["messages"] : [data];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const c = candidate as Record<string, unknown>;
    const key =
      c["key"] && typeof c["key"] === "object" ? (c["key"] as Record<string, unknown>) : {};
    const remoteJid =
      typeof key["remoteJid"] === "string"
        ? key["remoteJid"]
        : typeof c["remoteJid"] === "string"
          ? c["remoteJid"]
          : null;
    const fromMe = key["fromMe"] === true || c["fromMe"] === true;
    if (fromMe) continue;
    if (remoteJid?.endsWith("@g.us")) continue;
    const senderPhone =
      digitsOf(remoteJid) ?? digitsOf(c["sender"]) ?? digitsOf(c["from"]) ?? digitsOf(c["number"]);
    if (!senderPhone) continue;
    const pushName =
      typeof c["pushName"] === "string"
        ? c["pushName"]
        : typeof data["pushName"] === "string"
          ? data["pushName"]
          : null;
    const text =
      messageText(c["message"] ?? c).trim() +
      (typeof c["text"] === "string" && !c["message"] ? c["text"].trim() : "");
    return { fromMe: false, isGroup: false, senderPhone, pushName, text };
  }
  return null;
}

type GreetingBusiness = {
  id: string;
  name: string;
  slug: string;
  greeting: string | null;
  saudacao_template: string | null;
  whatsapp_instance: string | null;
  whatsapp_instance_token: string | null;
};

function isMissingColumnError(error: { message: string }): boolean {
  return (
    error.message.includes("saudacao_template") &&
    /does not exist|schema cache|column/i.test(error.message)
  );
}

/** Localiza o negócio dono da instância que recebeu a mensagem. */
export async function resolveBusinessByInstanceToken(
  supabaseAdmin: SupabaseClient<Database>,
  instanceToken: string,
): Promise<GreetingBusiness | null> {
  const { data: credential } = await supabaseAdmin
    .from("business_whatsapp_credentials")
    .select("business_id")
    .eq("instance_token", instanceToken)
    .maybeSingle();
  const query = supabaseAdmin
    .from("businesses")
    .select(
      "id, name, slug, greeting, saudacao_template, whatsapp_instance, whatsapp_instance_token",
    );
  const { data, error } = await (credential
    ? query.eq("id", credential.business_id).maybeSingle()
    : query.eq("whatsapp_instance_token", instanceToken).maybeSingle());
  if (error) {
    // Banco ainda sem a migration: trata como saudação desativada.
    if (isMissingColumnError(error)) {
      const retry = await supabaseAdmin
        .from("businesses")
        .select("id, name, slug, greeting, whatsapp_instance, whatsapp_instance_token")
        .eq("id", credential ? credential.business_id : "")
        .maybeSingle();
      if (retry.error || !retry.data) return null;
      return { ...retry.data, saudacao_template: null };
    }
    throw new Error(error.message);
  }
  return (data as GreetingBusiness | null) ?? null;
}

type GreetingRepliesTable = {
  select(columns?: string): GreetingRepliesTable;
  upsert(values: Record<string, unknown>, options?: { onConflict?: string }): GreetingRepliesTable;
  eq(column: string, value: unknown): GreetingRepliesTable;
  gt(column: string, value: unknown): GreetingRepliesTable;
  maybeSingle(): Promise<{ data: unknown | null; error: { message: string } | null }>;
};

/** true quando o remetente não recebeu saudação nas últimas 24h. */
export async function shouldSendGreeting(
  supabaseAdmin: SupabaseClient<Database>,
  businessId: string,
  senderPhone: string,
): Promise<boolean> {
  const table = (supabaseAdmin as unknown as { from(t: string): GreetingRepliesTable }).from(
    "whatsapp_greeting_replies",
  );
  const since = new Date(Date.now() - GREETING_COOLDOWN_MS).toISOString();
  const { data, error } = await table
    .select("replied_at")
    .eq("business_id", businessId)
    .eq("sender_phone", senderPhone)
    .gt("replied_at", since)
    .maybeSingle();
  if (error) {
    console.error("Falha ao checar saudação recente:", error.message);
    return false;
  }
  return !data;
}

export async function recordGreetingReply(
  supabaseAdmin: SupabaseClient<Database>,
  businessId: string,
  senderPhone: string,
): Promise<void> {
  const table = (supabaseAdmin as unknown as { from(t: string): GreetingRepliesTable }).from(
    "whatsapp_greeting_replies",
  );
  const { error } = await table
    .upsert(
      { business_id: businessId, sender_phone: senderPhone, replied_at: new Date().toISOString() },
      { onConflict: "business_id,sender_phone" },
    )
    .maybeSingle();
  if (error) console.error("Falha ao registrar saudação enviada:", error.message);
}

/** Monta o texto da saudação com {Cliente}, {Saudacao} e {Link} resolvidos. */
export function buildGreetingMessage(
  template: string,
  business: Pick<GreetingBusiness, "name" | "slug" | "greeting">,
  pushName: string | null,
): string {
  const firstName = pushName?.trim().split(/\s+/)[0] || "Cliente";
  return renderMessage(template, {
    nome: firstName,
    negocio: business.name,
    Cliente: firstName,
    Saudacao: business.greeting?.trim() || "Olá!",
    Link: bookingLinkForSlug(business.slug),
  });
}

export type GreetingOutcome =
  { replied: true; businessId: string; senderPhone: string } | { replied: false; reason: string };

/**
 * Processa um payload de webhook de mensagem recebida e envia a saudação
 * quando aplicável. Nunca lança erro (o chamador sempre responde 200).
 */
export async function handleIncomingWhatsapp(payload: unknown): Promise<GreetingOutcome> {
  const incoming = parseIncomingWhatsapp(payload);
  if (!incoming) return { replied: false, reason: "sem mensagem de cliente" };
  const root = payload as Record<string, unknown>;
  const instanceToken =
    typeof root["instance"] === "string"
      ? root["instance"]
      : typeof (root["data"] as Record<string, unknown> | undefined)?.["instanceId"] === "string"
        ? ((root["data"] as Record<string, unknown>)["instanceId"] as string)
        : null;
  if (!instanceToken) return { replied: false, reason: "sem instância" };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const business = await resolveBusinessByInstanceToken(supabaseAdmin, instanceToken);
  if (!business) return { replied: false, reason: "negócio não encontrado" };
  const template = business.saudacao_template?.trim();
  if (!template) return { replied: false, reason: "saudação desativada" };
  if (!(await shouldSendGreeting(supabaseAdmin, business.id, incoming.senderPhone))) {
    return { replied: false, reason: "cooldown de 24h" };
  }
  const { loadWhatsappProvider } = await import("./whatsapp-provider.server");
  const { readWhatsappCredential } = await import("./whatsapp-credentials.server");
  const credential = await readWhatsappCredential(supabaseAdmin, business.id).catch(() => null);
  const token = credential?.instanceToken ?? business.whatsapp_instance_token;
  if (!token) return { replied: false, reason: "sem credencial" };
  const provider = await loadWhatsappProvider();
  await provider.sendTextMessage(
    token,
    incoming.senderPhone,
    buildGreetingMessage(template, business, incoming.pushName),
  );
  await recordGreetingReply(supabaseAdmin, business.id, incoming.senderPhone);
  return { replied: true, businessId: business.id, senderPhone: incoming.senderPhone };
}

function greetingWebhookUrl(): string | null {
  const base = process.env["PUBLIC_APP_URL"]?.trim().replace(/\/+$/, "");
  const secret = process.env["WHATSAPP_WEBHOOK_SECRET"]?.trim();
  if (!base || !secret) return null;
  return `${base}/api/public/whatsapp-incoming?secret=${encodeURIComponent(secret)}`;
}

/**
 * Registra o webhook de mensagens recebidas na instância (melhor esforço:
 * nunca quebra a conexão quando o ambiente não está configurado).
 */
export async function registerGreetingWebhook(instanceToken: string): Promise<boolean> {
  const url = greetingWebhookUrl();
  if (!url) return false;
  try {
    const { loadWhatsappProvider } = await import("./whatsapp-provider.server");
    const provider = (await loadWhatsappProvider()) as unknown as {
      setInstanceWebhook?: (instanceToken: string, url: string) => Promise<unknown>;
    };
    if (typeof provider.setInstanceWebhook !== "function") return false;
    await provider.setInstanceWebhook(instanceToken, url);
    return true;
  } catch (error) {
    console.warn(
      "Não foi possível registrar o webhook de saudação:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
