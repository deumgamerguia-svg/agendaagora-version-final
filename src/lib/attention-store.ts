import { isExpiredTrial } from "@/lib/trial-store";

export type AttentionItem = {
  id: string;
  name: string;
  ownerName: string | null;
  phone: string | null;
  category: string;
  appointments: number;
  reason: "teste" | "assinatura";
  status: "Cancelado";
};

type BizRow = {
  id: string;
  name: string;
  owner_name: string | null;
  phone: string | null;
  category: string;
  appointments: number;
  status: string;
  current_month_status: string | null;
  trial_days: number | null;
  trial_created_at: string | null;
  trial_registration_name?: string | null;
};

const HIDDEN_KEY = "agenda-agora:attention-hidden";

function getHidden(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function hideFromAttention(name: string) {
  if (typeof window === "undefined") return;
  const list = getHidden().filter((n) => n.toLowerCase() !== name.toLowerCase());
  list.push(name);
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(list));
  } catch {
    // Ignora.
  }
}

export function getAttentionItems(businesses: BizRow[]): AttentionItem[] {
  const hidden = getHidden().map((n) => n.toLowerCase());
  const items: AttentionItem[] = [];
  for (const b of businesses) {
    if (hidden.includes(b.name.toLowerCase())) continue;
    if (isExpiredTrial(b)) {
      items.push({
        id: b.id,
        name: b.name,
        ownerName: b.owner_name,
        phone: b.phone,
        category: b.category,
        appointments: b.appointments,
        reason: "teste",
        status: "Cancelado",
      });
      continue;
    }
    // Negócio suspenso (assinatura expirada/não paga) entra como pendente de atenção.
    if (b.status === "suspenso") {
      items.push({
        id: b.id,
        name: b.name,
        ownerName: b.owner_name,
        phone: b.phone,
        category: b.category,
        appointments: b.appointments,
        reason: "assinatura",
        status: "Cancelado",
      });
    }
  }
  return items;
}
