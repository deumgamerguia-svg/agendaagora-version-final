import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { requireMasterAccess } from "@/lib/master.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/painel/suporte")({
  loader: () => (typeof window === "undefined" ? undefined : requireMasterAccess()),
  head: () => ({
    meta: [
      { title: "Suporte técnico — Painel master" },
      { name: "description", content: "Central de suporte da plataforma." },
    ],
  }),
  component: SuportePage,
});

function SuportePage() {
  const [statusFilter, setStatusFilter] = useState("todos");
  const [atribuicaoFilter, setAtribuicaoFilter] = useState("todos");

  const cards = [
    { label: "TOTAL", value: 0, className: "text-white" },
    { label: "ABERTOS", value: 0, className: "text-blue-400" },
    { label: "EM ANDAMENTO", value: 0, className: "text-amber-400" },
    { label: "RESOLVIDOS", value: 0, className: "text-emerald-400" },
  ];

  return (
    <div className="mx-auto w-full p-4 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
          <LifeBuoy className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight">Central de Suporte</h1>
          <p className="text-sm text-muted-foreground">Gerencie todos os tickets de suporte</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-5">
            <p className={`text-xs font-bold tracking-wider ${c.className === "text-white" ? "text-muted-foreground" : c.className}`}>
              {c.label}
            </p>
            <p className={`mt-2 text-3xl font-extrabold ${c.className}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <label className="text-xs font-bold tracking-wider text-muted-foreground">STATUS</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm font-semibold uppercase"
            >
              <option value="todos">TODOS</option>
              <option value="aberto">ABERTO</option>
              <option value="andamento">EM ANDAMENTO</option>
              <option value="resolvido">RESOLVIDO</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold tracking-wider text-muted-foreground">
              ATRIBUIÇÃO
            </label>
            <select
              value={atribuicaoFilter}
              onChange={(e) => setAtribuicaoFilter(e.target.value)}
              className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm font-semibold uppercase"
            >
              <option value="todos">TODOS</option>
              <option value="nao">NÃO ATRIBUÍDO</option>
            </select>
          </div>
          <Button size="lg" className="h-12 px-8 font-extrabold uppercase tracking-wide">
            Filtrar tickets
          </Button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Assunto</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Atribuído</th>
              <th className="px-4 py-3">Última mensagem</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                Nenhum ticket de suporte por enquanto.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
