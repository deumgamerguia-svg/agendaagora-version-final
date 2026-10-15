import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, FileText, Eye, ArrowLeft, Phone, KeyRound } from "lucide-react";
import { requireMasterAccess } from "@/lib/master.functions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPixKeyApprovals, setPixKeyApprovalStatus } from "@/lib/pix-approvals.functions";
import { toast } from "sonner";
import { formatPhoneBR } from "@/lib/format-phone";

export const Route = createFileRoute("/_authenticated/painel/pix-aprovacao")({
  loader: () => (typeof window === "undefined" ? undefined : requireMasterAccess()),
  head: () => ({
    meta: [
      { title: "Pix em aprovação — Painel master" },
      { name: "description", content: "Aprove chaves Pix vinculadas à conta mãe." },
    ],
  }),
  component: PixAprovacaoPage,
});

const keyTypeLabel: Record<string, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  telefone: "Telefone",
  aleatoria: "Chave aleatória",
};

function PixAprovacaoPage() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listPixKeyApprovals);
  const statusFn = useServerFn(setPixKeyApprovalStatus);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: list = [] } = useQuery({
    queryKey: ["pix-key-approvals"],
    queryFn: () => listFn(),
  });
  const decide = (id: string, status: "aprovado" | "recusado") => {
    statusFn({ data: { id, status } })
      .then(() => {
        toast.success(status === "aprovado" ? "Chave Pix aprovada." : "Chave Pix recusada.");
        setSelectedId(null);
        void queryClient.invalidateQueries({ queryKey: ["pix-key-approvals"] });
      })
      .catch((e: Error) => toast.error(e.message));
  };

  const selected = list.find((p) => p.id === selectedId) ?? null;

  if (selected) {
    const statusLabel =
      selected.status === "aprovado"
        ? "Aprovado"
        : selected.status === "recusado"
          ? "Recusado"
          : "Aguardando análise";
    const statusClass =
      selected.status === "aprovado"
        ? "border-emerald-400/35 bg-emerald-400/[0.10] text-emerald-300"
        : selected.status === "recusado"
          ? "border-destructive/50 bg-destructive/10 text-destructive"
          : "border-amber-400/35 bg-amber-400/[0.10] text-amber-300";
    return (
      <div className="mx-auto w-full p-4 sm:p-8">
        <section className="rounded-2xl border border-[#272a30] bg-[#0b0b0e] p-5">
          <div className="flex items-start gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-[#30333a] bg-[#15171b] text-xl font-extrabold text-white">
              {(selected.businessName ?? "A").charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-extrabold uppercase tracking-tight text-white">
                {selected.businessName}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8b8e96]">
                {selected.businessPhone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-3.5" aria-hidden="true" />
                    {formatPhoneBR(selected.businessPhone)}
                  </span>
                )}
                {selected.ownerName && <span>{selected.ownerName}</span>}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#202329] pt-4">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${statusClass}`}
            >
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              {statusLabel}
            </span>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#9aa4b2] transition-colors hover:text-white"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Voltar
            </button>
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-[#272a30] bg-[#0b0b0e] p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#2f83ff]/30 bg-[#2f83ff]/10 text-[#69a2ff]">
              <KeyRound className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#686b74]">
                Chave Pix · {keyTypeLabel[selected.keyType] ?? selected.keyType}
              </p>
              <p className="mt-1 break-all text-base font-bold text-white">{selected.key}</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-[#686b74]">
            Enviada em{" "}
            {new Date(selected.createdAt).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
            . Confira se a chave está no nome do titular antes de aprovar.
          </p>
        </section>

        {selected.status === "pendente" && (
          <div className="sticky bottom-3 mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => decide(selected.id, "recusado")}
              className="h-12 rounded-xl bg-[#4a90e2] text-sm font-extrabold uppercase tracking-wide text-white transition-colors hover:brightness-110"
            >
              Rejeitar
            </button>
            <button
              type="button"
              onClick={() => decide(selected.id, "aprovado")}
              className="h-12 rounded-xl bg-[#22a06b] text-sm font-extrabold uppercase tracking-wide text-white transition-colors hover:brightness-110"
            >
              Aprovar
            </button>
          </div>
        )}
      </div>
    );
  }

  const pending = list.filter((p) => p.status === "pendente");
  const others = list.filter((p) => p.status !== "pendente");

  return (
    <div className="mx-auto w-full p-4 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl border border-destructive/25 bg-destructive/10 text-destructive">
          <ShieldCheck className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight">Chaves Pix pendentes</h1>
          <p className="text-sm text-muted-foreground">
            Aprove ou rejeite chaves Pix — somente chaves no nome do titular da conta mãe podem ser
            vinculadas para saques via AgPay.
          </p>
        </div>
      </div>

      <section className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm md:table-fixed">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 w-20">ID</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">Data envio</th>
              <th className="px-4 py-3 w-48">Ações</th>
            </tr>
          </thead>
          <tbody>
            {!list.length && (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center">
                  <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-border bg-secondary text-muted-foreground">
                    <FileText className="size-5" />
                  </span>
                  <p className="mt-4 text-lg font-extrabold uppercase tracking-tight">
                    Nenhum Pix pendente
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Não há chaves Pix aguardando análise no momento.
                  </p>
                </td>
              </tr>
            )}
            {pending.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-3 font-semibold">#{p.id.slice(-4)}</td>
                <td className="px-4 py-3">
                  <span className="block font-bold">{p.businessName}</span>
                  {p.ownerName && (
                    <span className="block text-xs text-muted-foreground">{p.ownerName}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {p.businessPhone ? formatPhoneBR(p.businessPhone) : "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(p.createdAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#30333a] bg-[#15171b] px-3 py-2 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:border-[#2f83ff]/50"
                  >
                    <Eye className="size-4" aria-hidden="true" />
                    Ver chave Pix
                  </button>
                </td>
              </tr>
            ))}
            {others.map((p) => (
              <tr key={p.id} className="border-t border-border opacity-60">
                <td className="px-4 py-3 font-semibold">#{p.id.slice(-4)}</td>
                <td className="px-4 py-3">{p.businessName}</td>
                <td className="px-4 py-3">
                  {p.businessPhone ? formatPhoneBR(p.businessPhone) : "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(p.createdAt).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#30333a] bg-[#15171b] px-3 py-2 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:border-[#2f83ff]/50"
                  >
                    <Eye className="size-4" aria-hidden="true" />
                    Ver chave Pix
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
