import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Pencil, Trash2, Search } from "lucide-react";
import { listAllBusinesses } from "@/lib/admin.functions";
import { requireMasterAccess } from "@/lib/master.functions";
import { getAttentionItems, hideFromAttention, type AttentionItem } from "@/lib/attention-store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/painel/precisa-de-atencao")({
  loader: () => (typeof window === "undefined" ? undefined : requireMasterAccess()),
  head: () => ({
    meta: [
      { title: "Precisa de atenção — Painel master" },
      { name: "description", content: "Contas expiradas e assinaturas canceladas." },
    ],
  }),
  component: PrecisaDeAtencaoPage,
});

const formatPhone = (value: string | null) => {
  if (!value) return "—";
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

function PrecisaDeAtencaoPage() {
  const listFn = useServerFn(listAllBusinesses);
  const businesses = useQuery({ queryKey: ["master-businesses"], queryFn: () => listFn() });
  const [tick, setTick] = useState(0);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AttentionItem | null>(null);

  const items = getAttentionItems(businesses.data ?? []);
  const filtered = items.filter(
    (i) =>
      !search.trim() ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.ownerName ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto w-full p-4 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-400">
          <AlertTriangle className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight">Precisa de atenção</h1>
          <p className="text-sm text-muted-foreground">
            Contas com teste expirado ou assinatura cancelada — clientes que não podem escapar dos
            nossos dedos.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar usuários..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <span className="rounded-lg border border-border bg-secondary px-4 py-2 text-xs font-bold uppercase tracking-wider">
          Todos status
        </span>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full table-fixed text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 w-1/4">Usuário</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3 w-32">Status</th>
              <th className="px-4 py-3 w-28">Ações</th>
            </tr>
          </thead>
          <tbody>
            {!filtered.length && (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center text-muted-foreground">
                  Nenhum cliente precisando de atenção no momento. 🎉
                </td>
              </tr>
            )}
            {filtered.map((b) => (
              <tr key={b.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-sm font-bold">
                      {b.name.charAt(0).toUpperCase()}
                    </span>
                    <span>
                      <span className="block font-semibold uppercase">{b.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {b.ownerName ?? "—"} · {formatPhone(b.phone)}
                      </span>
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 uppercase text-muted-foreground">{b.category}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {b.reason === "teste" ? "Período de teste expirado" : "Assinatura expirada / não paga"}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-bold text-destructive">
                    <span className="size-1.5 rounded-full bg-destructive" />
                    {b.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      aria-label={`Editar ${b.name}`}
                      className="flex size-9 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground hover:text-foreground"
                      onClick={() => setEditing(b)}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      aria-label={`Excluir ${b.name}`}
                      className="flex size-9 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
                      onClick={() => {
                        hideFromAttention(b.name);
                        toast.success(`${b.name} removido da lista.`);
                        setTick((t) => t + 1);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dados do cliente para remarketing</DialogTitle>
          </DialogHeader>
          {editing && (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Nome</dt>
                <dd className="font-semibold">{editing.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Dono</dt>
                <dd>{editing.ownerName ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Telefone (login)</dt>
                <dd>{formatPhone(editing.phone)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Categoria</dt>
                <dd className="uppercase">{editing.category}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Agendamentos</dt>
                <dd>{editing.appointments}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Motivo</dt>
                <dd>
                  {editing.reason === "teste"
                    ? "Período de teste expirado"
                    : "Assinatura expirada / não paga"}
                </dd>
              </div>
            </dl>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
