const KEY = "agenda-agora:pix-approvals";

export type PixApproval = {
  id: string;
  businessName: string;
  ownerName?: string;
  keyType: string;
  key: string;
  status: "pendente" | "aprovado" | "recusado";
  createdAt: number;
};

export function getPixApprovals(): PixApproval[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(list: PixApproval[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Ignora falha de armazenamento.
  }
}

export function addPixApproval(input: Omit<PixApproval, "id" | "status" | "createdAt">) {
  if (typeof window === "undefined") return;
  const list = getPixApprovals();
  list.push({
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: "pendente",
    createdAt: Date.now(),
  });
  save(list);
}

export function setPixApprovalStatus(id: string, status: PixApproval["status"]) {
  if (typeof window === "undefined") return;
  save(getPixApprovals().map((p) => (p.id === id ? { ...p, status } : p)));
}

export function getLatestPixApproval(businessName: string): PixApproval | null {
  const list = getPixApprovals()
    .filter((p) => p.businessName.toLowerCase() === businessName.toLowerCase())
    .sort((a, b) => b.createdAt - a.createdAt);
  return list[0] ?? null;
}
