import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck } from "lucide-react";
import { listAllBusinesses } from "@/lib/admin.functions";
import { requireMasterAccess } from "@/lib/master.functions";
import { formatPrice } from "@/lib/format";
import { isExpiredTrial } from "@/lib/trial-store";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/painel/assinantes")({
  loader: () => (typeof window === "undefined" ? undefined : requireMasterAccess()),
  head: () => ({
    meta: [
      { title: "Assinantes — Painel master" },
      { name: "description", content: "Comércios com assinatura do Agenda Agora." },
    ],
  }),
  component: AssinantesPage,
});

const formatPhone = (value: string) => {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

function AssinantesPage() {
  const listFn = useServerFn(listAllBusinesses);
  const businesses = useQuery({ queryKey: ["master-businesses"], queryFn: () => listFn() });
  const rows = (businesses.data ?? []).filter(
    (b) => b.current_month_status === "pago" && !isExpiredTrial(b),
  );

  return (
    <div className="mx-auto w-full p-4 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
          <BadgeCheck className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold">(Assinantes)</h1>
          <p className="text-sm text-muted-foreground">
            Comércios que assinaram o Agenda Agora e estão com o mês fechado conosco.
          </p>
        </div>
        <div className="ml-auto">
          <Link to="/painel/master">
            <Button variant="secondary">Voltar</Button>
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((b) => (
          <div key={b.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {b.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{b.name}</p>
                <p className="text-xs text-muted-foreground">{b.category}</p>
              </div>
              <span className="ml-auto rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                Pago
              </span>
            </div>
            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Dono</dt>
                <dd>{b.owner_name ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Telefone</dt>
                <dd>{b.phone ? formatPhone(b.phone) : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Mensalidade</dt>
                <dd className="font-semibold">{formatPrice(b.monthly_fee_cents ?? 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Mês pago</dt>
                <dd>{new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Agendamentos</dt>
                <dd>{b.appointments}</dd>
              </div>
            </dl>
          </div>
        ))}
        {!businesses.isPending && !rows.length && (
          <p className="text-sm text-muted-foreground">
            Nenhum assinante com o mês pago no momento.
          </p>
        )}
      </div>
    </div>
  );
}

