const KEY = "agenda-agora:broadcasts";
const SEEN_KEY = "agenda-agora:broadcasts-seen";

export type Broadcast = { id: string; title: string; message: string; createdAt: number };

export function getBroadcasts(): Broadcast[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addBroadcast(title: string, message: string) {
  if (typeof window === "undefined") return;
  const list = getBroadcasts();
  list.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    message,
    createdAt: Date.now(),
  });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Ignora falha de armazenamento.
  }
}

export function deleteBroadcast(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify(getBroadcasts().filter((b) => b.id !== id)),
    );
  } catch {
    // Ignora falha de armazenamento.
  }
}

export function getUnreadCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const seenAt = Number(window.localStorage.getItem(SEEN_KEY) ?? "0");
    return getBroadcasts().filter((b) => b.createdAt > seenAt).length;
  } catch {
    return 0;
  }
}

export function markAllSeen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    // Ignora falha de armazenamento.
  }
}
