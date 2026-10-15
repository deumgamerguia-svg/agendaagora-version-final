import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { friendlyError } from "@/lib/error-page";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  History,
  KeyRound,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/lib/business";
import { formatPrice } from "@/lib/format";
import { formatPhoneBR } from "@/lib/format-phone";
import { getLedgerStatement } from "@/lib/ledger.functions";
import {
  getPaymentRules,
  getWithdrawalPixKeyValidationError,
  requestWithdrawal,
  savePaymentRules,
  saveWithdrawalPin,
  getWithdrawalPinStatus,
  saveWithdrawalPixKey,
  withdrawalPixKeyTypes,
} from "@/lib/withdrawal.functions";
import { saveServiceDeposit } from "@/lib/services.functions";
import { getLatestPixKeyApproval, submitPixKeyApproval } from "@/lib/pix-approvals.functions";
import { PageHeader, NoBusiness } from "@/components/painel/PageHeader";
import { AgpayBackground } from "@/components/painel/AgpayBackground";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WithdrawalPixKeyType = (typeof withdrawalPixKeyTypes)[number];

const pixKeyTypeLabel: Record<WithdrawalPixKeyType, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  telefone: "Telefone",
  aleatoria: "Chave aleatória",
};

const AGPAY_STATS = [
  { end: 120, suffix: "K+", dec: 0, label: "TRANSAÇÕES / DIA" },
  { end: 99.9, suffix: "%", dec: 1, label: "UPTIME GARANTIDO" },
  { end: 94, suffix: "%", dec: 0, label: "TAXA DE APROVAÇÃO" },
  { end: 5, suffix: "min", dec: 0, label: "PARA INTEGRAR" },
] as const;

function formatAgpayStat(value: number, dec: number, suffix: string) {
  return `${dec ? value.toFixed(1) : Math.floor(value)}${suffix}`;
}

const AGPAY_FEATURES = [
  {
    num: "01",
    title: "PIX Instantâneo",
    desc: "Receba em segundos com QR Code ou Código Copia e Cola, com confirmação automática do sinal no momento do agendamento.",
    badge: "Confirmação imediata",
  },
  {
    num: "02",
    title: "Sinal Antecipado",
    desc: "Reduza cancelamentos e faltas cobrando um sinal antecipado no momento em que o cliente agenda.",
    badge: "Menos faltas",
  },
  {
    num: "03",
    title: "Agenda Protegida",
    desc: "Proteja sua agenda contra clientes que reservam e não aparecem, solicitando o sinal antes de confirmar.",
    badge: "Agenda protegida",
  },
] as const;

/** Lista de recursos do AgPay com revelação em cascata. */
function AgpayFeatures() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        setVisible(true);
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="agpay-features mx-auto mt-6 max-w-md">
      {AGPAY_FEATURES.map((f, i) => (
        <div
          key={f.num}
          className={`agpay-feature${visible ? " is-visible" : ""}`}
          style={visible ? { transitionDelay: `${i * 0.12}s` } : undefined}
        >
          <div className="agpay-feature-num">{f.num}</div>
          <p className="agpay-feature-title">{f.title}</p>
          <p className="agpay-feature-desc">{f.desc}</p>
          {f.badge && <span className="agpay-feature-badge">{f.badge}</span>}
        </div>
      ))}
    </div>
  );
}

/** Grade de estatísticas do AgPay com contadores animados. */ function AgpayStats() {
  const ref = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<string[]>(() =>
    AGPAY_STATS.map((t) => formatAgpayStat(0, t.dec, t.suffix)),
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValues(AGPAY_STATS.map((t) => formatAgpayStat(t.end, t.dec, t.suffix)));
      setVisible(true);
      return;
    }
    const timers: number[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        setVisible(true);
        AGPAY_STATS.forEach((t, index) => {
          const dur = 2000;
          const step = 16;
          const inc = t.end / (dur / step);
          let cur = 0;
          const id = window.setInterval(() => {
            cur = Math.min(cur + inc, t.end);
            const text = formatAgpayStat(cur, t.dec, t.suffix);
            setValues((prev) => prev.map((v, i) => (i === index ? text : v)));
            if (cur >= t.end) window.clearInterval(id);
          }, step);
          timers.push(id);
        });
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach((id) => window.clearInterval(id));
    };
  }, []);

  return (
    <div ref={ref} className="agpay-stats-section mx-auto mt-14 max-w-md">
      <div className="agpay-stats-header-bar">PIX INSTANTÂNEO ✦ ANTIFRAUDE</div>
      <div className="agpay-stats-grid">
        {AGPAY_STATS.map((t, i) => (
          <div
            key={t.label}
            className={`agpay-stat-card${visible ? " is-visible" : ""}`}
            style={visible ? { transitionDelay: `${i * 0.12}s` } : undefined}
          >
            <div className="agpay-stat-number">{values[i]}</div>
            <div className="agpay-stat-label">{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/painel/as-pay")({
  head: () => ({
    meta: [
      { title: "Ag Pay — Agenda Agora" },
      { name: "description", content: "Saldo dos sinais pagos pelos clientes para agendar." },
      { property: "og:title", content: "Ag Pay — Agenda Agora" },
      { property: "og:description", content: "Saldo dos sinais pagos pelos clientes." },
    ],
  }),
  component: AsPayPage,
});

const PIX_MODES = [
  {
    id: "desabilitado",
    label: "Desabilitado",
    desc: "Quando a função de Pix automático está desabilitada, não é apresentada nenhuma opção de pagamento para o cliente.",
  },
  {
    id: "opcional",
    label: "Opcional",
    desc: "Quando a função opcional está habilitada, o Pix é apresentado ao cliente após a confirmação do agendamento, e ele pode antecipar o pagamento, que será processado e validado automaticamente.",
  },
  {
    id: "obrigatorio",
    label: "Obrigatório",
    desc: "Na função obrigatória, o sistema solicitará o pagamento antes de confirmar o agendamento. O cliente realiza o agendamento, e após isso, entra em uma fila de pendência, tendo o prazo de 5 minutos antes que o agendamento seja cancelado automaticamente. O pagamento é confirmado e validado por meio da nossa plataforma, garantindo o recebimento antes do agendamento definitivo. Enquanto o agendamento estiver aguardando pagamento, o horário escolhido não estará disponível para outros clientes. Caso o pagamento não seja efetuado, o horário volta a ficar disponível automaticamente.",
  },
] as const;

type PixMode = (typeof PIX_MODES)[number]["id"];

/** Painel "Configuração de sinal dos serviços" (atalho na tela de regras). */
function ServiceDepositPanel({ businessId }: { businessId: string }) {
  const queryClient = useQueryClient();
  const saveDepositFn = useServerFn(saveServiceDeposit);
  const [unit, setUnit] = useState<"fixed" | "percent">("fixed");
  const [rows, setRows] = useState<
    { id: string; name: string; requiresDeposit: boolean; amount: string }[]
  >([]);
  const [initializedFor, setInitializedFor] = useState<string | null>(null);

  const servicesQuery = useQuery({
    queryKey: ["rules-services", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select(
          "id, name, price_cents, requires_deposit, deposit_cents, deposit_mode, deposit_percent_bps",
        )
        .eq("business_id", businessId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        name: string;
        price_cents: number | null;
        requires_deposit: boolean | null;
        deposit_cents: number | null;
        deposit_mode: string | null;
        deposit_percent_bps: number | null;
      }[];
    },
  });

  useEffect(() => {
    if (!servicesQuery.data || initializedFor === businessId) return;
    setRows(
      servicesQuery.data.map((s) => ({
        id: s.id,
        name: s.name,
        requiresDeposit: !!s.requires_deposit,
        amount:
          (s.deposit_mode ?? "fixed") === "percent"
            ? String((s.deposit_percent_bps ?? 0) / 100)
            : ((s.deposit_cents ?? 0) / 100).toFixed(2).replace(".", ","),
      })),
    );
    const firstMode = servicesQuery.data[0]?.deposit_mode;
    setUnit(firstMode === "percent" ? "percent" : "fixed");
    setInitializedFor(businessId);
  }, [servicesQuery.data, initializedFor, businessId]);

  const saveAll = useMutation({
    mutationFn: async () => {
      for (const row of rows) {
        const normalized = row.amount.replace(",", ".");
        const parsed = Number(normalized);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error(`Valor inválido em "${row.name}".`);
        }
        const amount = unit === "percent" ? Math.round(parsed * 100) : Math.round(parsed * 100);
        await saveDepositFn({
          data: {
            businessId,
            serviceId: row.id,
            requiresDeposit: row.requiresDeposit,
            depositMode: unit,
            amount,
          },
        });
      }
    },
    onSuccess: async () => {
      toast.success("Sinal dos serviços salvo.");
      await queryClient.invalidateQueries({ queryKey: ["rules-services", businessId] });
      await queryClient.invalidateQueries({ queryKey: ["services", businessId] });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const setAll = (on: boolean) =>
    setRows((prev) => prev.map((r) => ({ ...r, requiresDeposit: on })));
  const allOn = rows.length > 0 && rows.every((r) => r.requiresDeposit);

  return (
    <div className="mx-auto mt-8 max-w-xl">
      <h2 className="text-xl font-bold text-[#e8b93e]">Configuração de sinal dos serviços</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[#b8bec7]">
        Configure aqui os valores que serão aplicados nas cobranças que antecedem os agendamentos,
        podem ser utilizadas porcentagens ou valores para o sinal
      </p>

      <div className="mt-4 flex justify-end gap-2">
        {(["fixed", "percent"] as const).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setUnit(u)}
            aria-pressed={unit === u}
            className={`h-10 w-14 rounded-xl text-sm font-bold transition-colors ${
              unit === u
                ? "bg-[linear-gradient(180deg,#f6d97a,#d9a83f)] text-[#231a03]"
                : "border border-[#c9a227]/50 text-[#e8b93e]"
            }`}
          >
            {u === "fixed" ? "R$" : "%"}
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-[#2c2c31] bg-[#101013]">
        <button
          type="button"
          onClick={() => setAll(!allOn)}
          className="flex w-full items-center gap-3 border-b border-[#2c2c31] bg-[#232327] px-4 py-3"
        >
          <span
            aria-hidden="true"
            className={`flex size-5 items-center justify-center rounded-[5px] border text-sm leading-none transition-colors ${
              allOn
                ? "border-[#e8b93e] bg-[#e8b93e] text-[#231a03]"
                : "border-[#4a4e57] text-transparent"
            }`}
          >
            ✓
          </span>
          <span className="text-sm font-bold uppercase tracking-wide text-white">Todos</span>
        </button>
        {servicesQuery.isLoading && (
          <p className="px-4 py-6 text-center text-sm text-[#8b8e96]">Carregando serviços…</p>
        )}
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-3 border-b border-[#2c2c31] bg-[#232327] px-4 py-3 last:border-b-0"
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={row.requiresDeposit}
              aria-label={`Sinal para ${row.name}`}
              onClick={() =>
                setRows((prev) =>
                  prev.map((r) =>
                    r.id === row.id ? { ...r, requiresDeposit: !r.requiresDeposit } : r,
                  ),
                )
              }
              className={`flex size-5 shrink-0 items-center justify-center rounded-[5px] border text-sm leading-none transition-colors ${
                row.requiresDeposit
                  ? "border-[#e8b93e] bg-[#e8b93e] text-[#231a03]"
                  : "border-[#4a4e57] text-transparent"
              }`}
            >
              ✓
            </button>
            <span className="min-w-0 flex-1 truncate text-sm font-bold uppercase tracking-wide text-white">
              {row.name}
            </span>
            <input
              value={row.amount}
              onChange={(e) =>
                setRows((prev) =>
                  prev.map((r) =>
                    r.id === row.id
                      ? {
                          ...r,
                          amount: e.target.value
                            .replace(unit === "percent" ? /[^0-9]/g : /[^0-9,]/g, "")
                            .slice(0, 8),
                        }
                      : r,
                  ),
                )
              }
              inputMode="decimal"
              aria-label={`Valor do sinal para ${row.name}`}
              className="w-20 shrink-0 rounded-md bg-transparent px-1 py-1 text-right text-sm font-semibold text-white outline-none focus:ring-1 focus:ring-[#e8b93e]/50"
            />
          </div>
        ))}
        {!servicesQuery.isLoading && rows.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-[#8b8e96]">
            Nenhum serviço cadastrado. Cadastre serviços no menu Serviços.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => saveAll.mutate()}
        disabled={saveAll.isPending}
        className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[10px] border-0 bg-[linear-gradient(90deg,#9a7118_0%,#d9a83f_25%,#f6d97a_50%,#d9a83f_75%,#9a7118_100%)] text-base font-bold text-[#231a03] shadow-[0_10px_24px_rgba(217,168,63,0.35)] transition hover:brightness-[1.06] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saveAll.isPending ? "Salvando…" : "Salvar alterações"}
      </button>
    </div>
  );
}

/** Tela "Configuração de regras" da carteira AgPay. */
function PaymentRulesView({
  businessId,
  pixKey,
  pixApproved,
  onBack,
}: {
  businessId: string;
  pixKey: string | null;
  pixApproved: boolean;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const getRulesFn = useServerFn(getPaymentRules);
  const saveRulesFn = useServerFn(savePaymentRules);
  const [payTab, setPayTab] = useState<"pix" | "cartao">("pix");
  const [exceptionSearch, setExceptionSearch] = useState("");

  const rulesQuery = useQuery({
    queryKey: ["payment-rules", businessId],
    queryFn: () => getRulesFn({ data: { businessId } }),
  });
  const mode: PixMode = (rulesQuery.data?.pixMode as PixMode) ?? "opcional";
  const exceptions: string[] = rulesQuery.data?.pixExceptionClients ?? [];

  const customersQuery = useQuery({
    queryKey: ["rules-customers", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("name, phone")
        .eq("business_id", businessId)
        .order("name")
        .limit(200);
      if (error) throw error;
      const seen = new Map<string, string | null>();
      for (const c of data ?? []) {
        const name = (c.name ?? "").trim();
        if (!name || seen.has(name)) continue;
        seen.set(name, (c.phone ?? null) as string | null);
      }
      return [...seen.entries()].map(([name, phone]) => ({ name, phone }));
    },
  });
  const customerNames = useMemo(() => customersQuery.data ?? [], [customersQuery.data]);

  const save = useMutation({
    mutationFn: (input: { pixMode: PixMode; pixExceptionClients: string[] }) =>
      saveRulesFn({ data: { businessId, ...input } }),
    onSuccess: () => {
      toast.success("Regras salvas.");
      void queryClient.invalidateQueries({ queryKey: ["payment-rules", businessId] });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const setMode = (next: PixMode) => {
    if (next === mode || save.isPending) return;
    save.mutate({ pixMode: next, pixExceptionClients: exceptions });
  };

  const toggleException = (name: string) => {
    if (save.isPending) return;
    const has = exceptions.includes(name);
    const next = has ? exceptions.filter((n) => n !== name) : [...exceptions, name].slice(0, 200);
    save.mutate({ pixMode: mode, pixExceptionClients: next });
  };

  const searchTerm = exceptionSearch.trim().toLowerCase();
  const suggestions = searchTerm
    ? customerNames
        .filter((c) => c.name.toLowerCase().includes(searchTerm) && !exceptions.includes(c.name))
        .slice(0, 6)
    : [];

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#9aa4b2] transition-colors hover:text-white"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Voltar
      </button>

      <h1 className="mt-3 text-center text-2xl font-bold text-[#e8b93e]">Configuração de regras</h1>

      <div className="mx-auto mt-6 max-w-xl">
        <p className="text-sm font-semibold text-white">Chave cadastrada</p>
        <span
          className={`mt-1.5 inline-block rounded-md px-2.5 py-1 text-xs font-bold ${
            pixApproved ? "bg-[#1db954] text-white" : "bg-[#8a6d1c] text-white"
          }`}
        >
          {pixApproved ? "Verificada" : "Pendente"}
        </span>
        <p className="mt-2 rounded-lg bg-[#232327] px-4 py-3 text-sm text-[#b8bec7]">
          {pixKey || "Nenhuma chave cadastrada"}
        </p>
      </div>

      <div className="mx-auto mt-6 grid max-w-xl grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setPayTab("pix")}
          aria-pressed={payTab === "pix"}
          className={`h-11 rounded-full text-sm font-bold uppercase tracking-wide transition-colors ${
            payTab === "pix"
              ? "bg-[linear-gradient(90deg,#9a7118,#f6d97a,#9a7118)] text-[#231a03]"
              : "border border-[#c9a227]/60 text-[#e8b93e] hover:bg-[#c9a227]/10"
          }`}
        >
          Pix
        </button>
        <button
          type="button"
          onClick={() => toast.info("Pagamento com cartão em breve.")}
          aria-pressed={false}
          className="h-11 rounded-full border border-[#c9a227]/60 text-sm font-bold uppercase tracking-wide text-[#e8b93e] transition-colors hover:bg-[#c9a227]/10"
        >
          Cartão
        </button>
      </div>

      {payTab === "pix" && (
        <div className="mx-auto mt-6 max-w-xl space-y-5">
          {PIX_MODES.map((m) => {
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMode(m.id)}
                className="block w-full text-left"
              >
                <span className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`flex size-5 items-center justify-center rounded-[5px] border text-sm leading-none transition-colors ${
                      active
                        ? "border-[#e8b93e] bg-[#e8b93e] text-[#231a03]"
                        : "border-[#4a4e57] bg-transparent text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span
                    className={`text-[0.95rem] font-bold ${active ? "text-[#e8b93e]" : "text-white"}`}
                  >
                    {m.label}
                  </span>
                </span>
                <span className="mt-1.5 block text-sm leading-relaxed text-[#b8bec7]">
                  {m.desc}
                </span>
              </button>
            );
          })}

          <div>
            <p className="text-sm font-semibold text-[#e8b93e]">
              Configure as exceções em que não será obrigatório o pagamento para clientes ou
              assinantes.
            </p>
            <div className="mt-4 border-b border-[#c9a227]/50 pb-1">
              <span className="text-sm font-semibold text-[#e8b93e]">Cliente</span>
            </div>
            <div className="relative mt-3">
              <input
                value={exceptionSearch}
                onChange={(e) => setExceptionSearch(e.target.value)}
                placeholder="Informe o cliente"
                aria-label="Informe o cliente"
                className="h-11 w-full rounded-lg bg-[#101013] px-4 pr-10 text-sm text-white outline-none placeholder:text-[#5c5c64] focus:ring-1 focus:ring-[#e8b93e]/50"
              />
              <Search
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#8b8e96]"
                aria-hidden="true"
              />
            </div>
            {suggestions.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-lg border border-[#2c2c31] bg-[#101013]">
                {suggestions.map(({ name, phone }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      toggleException(name);
                      setExceptionSearch("");
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#e8b93e]/10"
                  >
                    <UserRound className="size-4 shrink-0 text-[#8b8e96]" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">{name}</span>
                      <span className="block text-xs text-[#8b8e96]">
                        {phone ? formatPhoneBR(phone) : "Sem telefone"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {exceptions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {exceptions.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#c9a227]/50 bg-[#c9a227]/10 px-3 py-1 text-xs text-[#e8b93e]"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => toggleException(name)}
                      aria-label={`Remover ${name} das exceções`}
                      className="text-[#e8b93e]/70 hover:text-white"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <p className="text-center text-sm font-medium text-[#25d366]">
            Todas as transações são intermediadas pela empresa Agenda Serviço
          </p>
          <ServiceDepositPanel businessId={businessId} />
          <details className="text-center">
            <summary className="cursor-pointer list-none text-sm font-semibold text-[#e8b93e] underline-offset-4 hover:underline">
              Termos e Regras
            </summary>
            <div className="mx-auto mt-3 max-w-xl rounded-xl border border-[#2c2c31] bg-[#101013] p-4 text-left text-sm leading-relaxed text-[#b8bec7]">
              Ao usar a carteira AgPay, você concorda que os sinais recebidos são intermediados pela
              Agenda Serviço e liberados conforme as regras configuradas. Saques são enviados
              exclusivamente para a chave Pix aprovada em seu nome. Valores, prazos e taxas podem
              ser atualizados e serão sempre exibidos antes da confirmação.
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

type WalletEntry = {
  id: string;
  type: string;
  amountCents: number;
  description: string;
  date: string;
};

/** Visão detalhada "Sua Carteira": valores, ações e histórico. */
function WalletDetailView({
  availableCents,
  pendingCents,
  entries,
  onBack,
  onWithdraw,
}: {
  availableCents: number;
  pendingCents: number;
  entries: WalletEntry[];
  onBack: () => void;
  onWithdraw: () => void;
}) {
  const [tab, setTab] = useState<"todos" | "entradas" | "saidas">("todos");
  const [period, setPeriod] = useState<"hoje" | "semana" | "mes">("hoje");
  const [customDay, setCustomDay] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);

  const filtered = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return entries.filter((e) => {
      const t = new Date(e.date).getTime();
      if (tab === "entradas" && e.amountCents < 0) return false;
      if (tab === "saidas" && e.amountCents >= 0) return false;
      if (customDay) {
        return e.date.slice(0, 10) === customDay;
      }
      if (period === "hoje") return t >= startOfToday;
      if (period === "semana") return t >= startOfToday - 6 * 86400000;
      const d = new Date(e.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
  }, [entries, tab, period, customDay]);

  const money = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#9aa4b2] transition-colors hover:text-white"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Voltar
      </button>

      <h1 className="mt-3 text-2xl font-bold text-[#e8b93e]">Sua Carteira</h1>

      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white">Valor disponível</p>
            <p className="text-2xl font-extrabold text-[#22c55e]">{money(availableCents)}</p>
          </div>
          <button
            type="button"
            onClick={onWithdraw}
            className="h-10 shrink-0 rounded-full bg-[linear-gradient(90deg,#9a7118,#f6d97a,#9a7118)] px-6 text-sm font-bold text-[#231a03] shadow-[0_10px_24px_rgba(217,168,63,0.35)] transition hover:brightness-[1.06]"
          >
            Efetuar Saque
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white">Valor pendente</p>
            <p className="text-2xl font-extrabold text-[#38bdf8]">{money(pendingCents)}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCalendar((v) => !v)}
            aria-expanded={showCalendar}
            className="h-10 shrink-0 rounded-full bg-[#38bdf8] px-6 text-sm font-bold text-[#06202e] transition hover:brightness-110"
          >
            Calendário
          </button>
        </div>
        {showCalendar && (
          <input
            type="date"
            value={customDay}
            onChange={(e) => setCustomDay(e.target.value)}
            aria-label="Filtrar por dia"
            className="h-10 w-full rounded-lg border border-[#30333a] bg-[#0d0e11] px-3 text-sm text-white outline-none [color-scheme:dark] focus-visible:border-[#38bdf8]"
          />
        )}
      </div>

      <div className="my-4 h-px w-full bg-[#c9a227]/40" />

      <h2 className="text-base font-semibold text-white">Histórico de transações</h2>
      <div className="mt-2 flex gap-4 border-b border-white/10 text-sm font-semibold">
        {(
          [
            ["todos", "Todos"],
            ["entradas", "Entradas"],
            ["saidas", "Saídas"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`pb-2 transition-colors ${
              tab === id
                ? "border-b-2 border-[#e8b93e] text-[#e8b93e]"
                : "text-[#8b8e96] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        {(
          [
            ["hoje", "Hoje"],
            ["semana", "Semana"],
            ["mes", "Mês"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setPeriod(id);
              setCustomDay("");
            }}
            aria-pressed={period === id && !customDay}
            className={`rounded-lg border px-4 py-1.5 text-xs font-semibold transition-colors ${
              period === id && !customDay
                ? "border-[#e8b93e] text-[#e8b93e]"
                : "border-[#3a3d44] text-[#8b8e96] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
        {customDay && (
          <button
            type="button"
            onClick={() => setCustomDay("")}
            className="rounded-lg border border-[#e8b93e] px-3 py-1.5 text-xs font-semibold text-[#e8b93e]"
          >
            {customDay.split("-").reverse().join("/")} ✕
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {filtered.length === 0 && (
          <p className="rounded-xl border border-[#24272e] bg-[#0d0e11] px-4 py-6 text-center text-sm text-[#656871]">
            Nenhuma transação neste período.
          </p>
        )}
        {filtered.map((e) => (
          <div
            key={e.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[#24272e] bg-[#0d0e11] px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {e.description || (e.amountCents >= 0 ? "Recebimento" : "Saque")}
              </p>
              <p className="text-xs text-[#656871]">
                {new Date(e.date).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </p>
            </div>
            <p
              className={`shrink-0 text-sm font-bold ${e.amountCents >= 0 ? "text-[#22c55e]" : "text-[#f87171]"}`}
            >
              {e.amountCents >= 0 ? "+" : ""}
              {money(e.amountCents)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Formulário "Solicitar saque" reutilizado na carteira e no modal. */
function SaqueForm({
  inputId,
  withdrawalAmount,
  setWithdrawalAmount,
  onSubmit,
  isPending,
  hasPixKey,
  statementError,
}: {
  inputId: string;
  withdrawalAmount: string;
  setWithdrawalAmount: (v: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  hasPixKey: boolean;
  statementError: unknown;
}) {
  return (
    <div className="relative z-10">
      <h2 className="font-semibold">Solicitar saque</h2>
      <p className="mt-1 text-sm text-muted-foreground">Saque mínimo de R$ 13,00.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 space-y-2">
          <Label htmlFor={inputId}>Valor em reais</Label>
          <Input
            id={inputId}
            inputMode="decimal"
            placeholder="13,00"
            value={withdrawalAmount}
            onChange={(event) => setWithdrawalAmount(event.target.value)}
          />
        </div>
        <Button
          className="self-end"
          disabled={isPending || !hasPixKey || Number(withdrawalAmount.replace(",", ".")) < 13}
          onClick={onSubmit}
        >
          {isPending ? "Solicitando…" : "Sacar via Pix"}
        </Button>
      </div>
      {!hasPixKey && (
        <p className="mt-2 text-sm text-amber-300">Cadastre uma chave Pix para solicitar saques.</p>
      )}
      {statementError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          Não foi possível carregar o extrato. Tente novamente.
        </p>
      )}
    </div>
  );
}

function AsPayPage() {
  const { businessId, business } = useBusiness();
  const queryClient = useQueryClient();
  const saveWithdrawalPixKeyFn = useServerFn(saveWithdrawalPixKey);
  const getLedgerStatementFn = useServerFn(getLedgerStatement);
  const requestWithdrawalFn = useServerFn(requestWithdrawal);
  const [withdrawalAmount, setWithdrawalAmount] = useState("");

  const {
    data: statement,
    isLoading: statementLoading,
    error: statementError,
  } = useQuery({
    queryKey: ["wallet-statement", businessId],
    enabled: !!businessId,
    queryFn: () => getLedgerStatementFn({ data: { businessId: businessId! } }),
  });

  const withdraw = useMutation({
    mutationFn: () =>
      requestWithdrawalFn({
        data: {
          businessId: businessId!,
          amountCents: Math.round(Number(withdrawalAmount.replace(",", ".")) * 100),
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: ({ withdrawal }) => {
      setWithdrawalAmount("");
      toast.success(
        withdrawal?.status === "paid"
          ? "Saque concluído via Pix."
          : "Saque enviado para processamento. Aguarde a confirmação do Pix.",
      );
      void queryClient.invalidateQueries({ queryKey: ["wallet-statement", businessId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const { data: withdrawalPixKey } = useQuery({
    queryKey: ["withdrawal-pix-key", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("withdrawal_pix_key, withdrawal_pix_key_type")
        .eq("id", businessId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [pixKey, setPixKey] = useState("");
  const [started, setStarted] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [walletDetail, setWalletDetail] = useState(false);
  const [saqueOpen, setSaqueOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetStep, setSheetStep] = useState<"pix" | "pin">("pix");
  const [sheetPixKey, setSheetPixKey] = useState("");
  const [sheetPin, setSheetPin] = useState("");
  const [sheetPinConfirm, setSheetPinConfirm] = useState("");
  const [sheetSaving, setSheetSaving] = useState(false);
  const [sheetMounted, setSheetMounted] = useState(false);

  useEffect(() => {
    setSheetMounted(true);
  }, []);

  const openWallet = () => {
    setSheetOpen(false);
    setStarted(true);
  };
  const [pixKeyType, setPixKeyType] = useState<WithdrawalPixKeyType>("telefone");
  const latestPixApprovalFn = useServerFn(getLatestPixKeyApproval);
  const submitPixApprovalFn = useServerFn(submitPixKeyApproval);
  const saveWithdrawalPinFn = useServerFn(saveWithdrawalPin);
  const getWithdrawalPinStatusFn = useServerFn(getWithdrawalPinStatus);
  const { data: pixApproval } = useQuery({
    queryKey: ["pix-key-approval", businessId],
    enabled: !!businessId,
    queryFn: () => latestPixApprovalFn({ data: { businessId: businessId! } }),
  });
  const { data: pinStatus } = useQuery({
    queryKey: ["withdrawal-pin-status", businessId],
    enabled: !!businessId,
    queryFn: () => getWithdrawalPinStatusFn({ data: { businessId: businessId! } }),
  });

  // Preenchido uma única vez e aprovado: vai direto para a carteira.
  const onboarded = pixApproval?.status === "aprovado" && pinStatus?.pinSet === true;
  useEffect(() => {
    if (onboarded) setStarted(true);
  }, [onboarded]);

  const finishOnboarding = async () => {
    if (!businessId) return;
    const pin = sheetPin.trim();
    if (!/^\d{4}$/.test(pin)) {
      toast.error("Digite uma senha de 4 dígitos numéricos.");
      return;
    }
    if (pin !== sheetPinConfirm.trim()) {
      toast.error("As senhas não conferem. Digite novamente.");
      return;
    }
    setSheetSaving(true);
    try {
      const key = sheetPixKey.trim();
      setPixKey(key);
      await saveWithdrawalPixKeyFn({ data: { businessId, pixKey: key, pixKeyType } });
      await submitPixApprovalFn({ data: { businessId, keyType: pixKeyType, key } });
      await saveWithdrawalPinFn({ data: { businessId, pin } });
      toast.success("Chave Pix enviada para aprovação.");
      await queryClient.invalidateQueries({ queryKey: ["pix-key-approval", businessId] });
      await queryClient.invalidateQueries({
        queryKey: ["withdrawal-pin-status", businessId],
      });
      openWallet();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSheetSaving(false);
    }
  };
  const submitPixApproval = useMutation({
    mutationFn: () =>
      submitPixApprovalFn({
        data: { businessId: businessId!, keyType: pixKeyType, key: pixKey.trim() },
      }),
    onSuccess: () => {
      toast.success("Chave Pix enviada para aprovação.");
      void queryClient.invalidateQueries({ queryKey: ["pix-key-approval", businessId] });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
  const pixKeyError = pixKey.trim() ? getWithdrawalPixKeyValidationError(pixKeyType, pixKey) : null;

  useEffect(() => {
    setPixKey(withdrawalPixKey?.withdrawal_pix_key ?? "");
    setPixKeyType(
      (withdrawalPixKey?.withdrawal_pix_key_type as WithdrawalPixKeyType) ?? "telefone",
    );
  }, [withdrawalPixKey]);

  const savePixKey = useMutation({
    mutationFn: () =>
      saveWithdrawalPixKeyFn({
        data: { businessId: businessId!, pixKey: pixKey.trim(), pixKeyType },
      }),
    onSuccess: () => {
      toast.success("Chave PIX de saque salva.");
      void queryClient.invalidateQueries({ queryKey: ["withdrawal-pix-key", businessId] });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  if (!businessId) return <NoBusiness />;

  if (rulesOpen) {
    const rulesPixKey = withdrawalPixKey?.withdrawal_pix_key?.trim() || pixKey.trim() || null;
    return (
      <div className="agpay-theme space-y-6">
        <PaymentRulesView
          businessId={businessId}
          pixKey={rulesPixKey}
          pixApproved={pixApproval?.status === "aprovado"}
          onBack={() => setRulesOpen(false)}
        />
      </div>
    );
  }

  if (!started) {
    return (
      <div className="agpay-theme space-y-6">
        <section aria-label="Abrir carteira" className="relative w-full px-6 pb-8 pt-10">
          <AgpayBackground
            accent="#4A90E2"
            light="#8ABAF0"
            morphAccentTo="#D9A83F"
            morphLightTo="#F3D27A"
            morphDelayMs={500}
            morphDurationMs={1200}
            goldEdges
            goldWash
            words={["AGPAY", "PIX", "SALDO", "GATEWAY", "AGPAY", "PAGAMENTO", "AGPAY"]}
          />
          <div className="relative z-10 mx-auto max-w-xl text-center">
            <p className="lembretes-hero-eyebrow lembretes-fade-slide-up lembretes-delay-1">
              Carteira <span className="ew-white">Ag Pay</span>
            </p>
            <h1 className="lembretes-hero-title lembretes-fade-slide-up lembretes-delay-2 mx-auto mt-4 max-w-md">
              Seu saldo <span>Ag Pay</span>
            </h1>
            <p className="lembretes-hero-sub lembretes-fade-slide-up lembretes-delay-3 mx-auto mt-6 max-w-md">
              Receba sinais via Pix, acompanhe o saldo e crie cobranças com velocidade e segurança.
            </p>
            <button
              type="button"
              onClick={() => {
                setSheetStep("pix");
                setSheetOpen(true);
              }}
              className="agpay-btn-gold lembretes-fade-slide-up lembretes-delay-4 mt-10"
            >
              Abrir Carteira
              <ChevronRight className="size-4 shrink-0" strokeWidth={2.5} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Aviso abaixo"
              className="agpay-aviso-outline lembretes-fade-slide-up lembretes-delay-5 mt-10"
            >
              Aviso Abaixo
            </button>
            <div className="lembretes-scroll-cue lembretes-fade-slide-up lembretes-delay-6 mt-10">
              <span>Scroll</span>
              <span aria-hidden="true" className="lembretes-scroll-line" />
            </div>
            <div className="lembretes-fade-slide-up lembretes-delay-7 mx-auto mt-14 max-w-md text-left">
              <p className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="inline-block h-px w-10 shrink-0 bg-[#e8b93e] shadow-[0_0_8px_rgba(232,185,62,0.8)]"
                />
                <span className="lembretes-hero-eyebrow" style={{ textIndent: 0 }}>
                  Receber sinais
                </span>
              </p>
              <h2 className="lembretes-hero-title small mt-3">
                Receba <span>e saque</span>
              </h2>
              <p className="lembretes-hero-sub mt-4">
                Aqui você configura a chave Pix, recebe os sinais dos agendamentos e saca o saldo
                para a sua conta quando quiser.
              </p>
            </div>
            <AgpayStats />
            <AgpayFeatures />
          </div>
        </section>
        {sheetMounted &&
          sheetOpen &&
          createPortal(
            <div
              className="fixed inset-0 z-[70]"
              role="dialog"
              aria-modal="true"
              aria-label="Configurações do Pix"
            >
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setSheetOpen(false)}
                className="agpay-pix-sheet-backdrop absolute inset-0 h-full w-full cursor-default"
              />
              <div className="agpay-pix-sheet fixed left-1/2 top-1/2 w-[min(28rem,calc(100vw-2rem))] px-6 pb-8 pt-6 text-center">
                <p className="text-sm font-semibold tracking-wide text-[#2ee6a8]">
                  <span aria-hidden="true">❖</span> Configurações do Pix
                </p>
                {sheetStep === "pix" ? (
                  <>
                    <p className="mt-6 text-[1.35rem] font-light leading-snug text-white">
                      Configure sua <strong className="font-bold">Chave Pix</strong> para o
                      recebimento dos valores que serão intermediados e processados pela empresa{" "}
                      <strong className="font-bold">Agenda Serviço</strong>.
                    </p>
                    <input
                      value={sheetPixKey}
                      onChange={(event) => setSheetPixKey(event.target.value)}
                      placeholder="Sua chave pix"
                      aria-label="Sua chave Pix"
                      className="agpay-pix-sheet-input mt-8"
                    />
                    <p className="mt-8 text-[1.2rem] font-light leading-snug text-white">
                      Para a sua segurança, a chave será encaminhada para aprovação e nossa equipe
                      irá validar e verificar sua chave Pix para garantir a titularidade.
                    </p>
                    <button
                      type="button"
                      disabled={!sheetPixKey.trim()}
                      onClick={() => setSheetStep("pin")}
                      className="agpay-pix-sheet-advance mt-8 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Avançar
                      <ChevronRight
                        className="size-5 shrink-0"
                        strokeWidth={2.5}
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={openWallet}
                      className="mt-4 text-xl font-medium text-[#e8b93e] transition-colors hover:text-[#f3d27a]"
                    >
                      Configurar mais tarde
                    </button>
                  </>
                ) : (
                  <>
                    <p className="agpay-pix-sheet-title mt-6">Senha de transferência</p>
                    <p className="mt-2 text-[1.1rem] font-light leading-snug text-white/80">
                      É uma senha que será solicitada sempre que você for executar uma transação da
                      sua carteira
                    </p>
                    <label
                      htmlFor="agpay-pin"
                      className="mt-8 block text-[1.1rem] font-light text-white/80"
                    >
                      Digite uma senha de 4 dígitos
                    </label>
                    <input
                      id="agpay-pin"
                      value={sheetPin}
                      onChange={(event) =>
                        setSheetPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      placeholder="••••"
                      aria-label="Digite uma senha de 4 dígitos"
                      inputMode="numeric"
                      type="password"
                      maxLength={4}
                      autoComplete="new-password"
                      className="agpay-pix-sheet-input mt-3"
                    />
                    <label
                      htmlFor="agpay-pin-confirm"
                      className="mt-6 block text-[1.1rem] font-light text-white/80"
                    >
                      Confirme sua senha
                    </label>
                    <input
                      id="agpay-pin-confirm"
                      value={sheetPinConfirm}
                      onChange={(event) =>
                        setSheetPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      placeholder="••••"
                      aria-label="Confirme sua senha"
                      inputMode="numeric"
                      type="password"
                      maxLength={4}
                      autoComplete="new-password"
                      className="agpay-pix-sheet-input agpay-pix-sheet-input-secondary mt-3"
                    />
                    {sheetPinConfirm.length === 4 && sheetPin !== sheetPinConfirm && (
                      <p role="alert" className="mt-3 text-sm text-red-400">
                        As senhas não conferem.
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={
                        sheetSaving || sheetPin.length !== 4 || sheetPin !== sheetPinConfirm
                      }
                      onClick={() => void finishOnboarding()}
                      className="agpay-pix-sheet-advance mt-8 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sheetSaving ? "Salvando…" : "Avançar"}
                      <ChevronRight
                        className="size-5 shrink-0"
                        strokeWidth={2.5}
                        aria-hidden="true"
                      />
                    </button>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )}
      </div>
    );
  }

  if (walletDetail) {
    return (
      <div className="agpay-theme mx-auto w-full max-w-2xl space-y-6">
        <WalletDetailView
          availableCents={statement?.availableCents ?? 0}
          pendingCents={statement?.pendingChargesCents ?? 0}
          entries={
            (statement?.entries ?? []) as {
              id: string;
              type: string;
              amountCents: number;
              description: string;
              date: string;
            }[]
          }
          onBack={() => setWalletDetail(false)}
          onWithdraw={() => setSaqueOpen(true)}
        />
        {sheetMounted &&
          saqueOpen &&
          createPortal(
            <div
              className="fixed inset-0 z-[70] grid overflow-y-auto p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Solicitar saque"
            >
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setSaqueOpen(false)}
                className="fixed inset-0 h-full w-full cursor-default bg-black/60"
              />
              <div className="agpay-glow-card relative m-auto w-full max-w-md p-4 sm:p-5">
                <div className="relative z-10">
                  <button
                    type="button"
                    onClick={() => setSaqueOpen(false)}
                    aria-label="Voltar"
                    className="relative z-10 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#9aa4b2] transition-colors hover:text-white"
                  >
                    <ChevronLeft className="size-4" aria-hidden="true" />
                    Voltar
                  </button>
                  <div className="mt-3">
                    <SaqueForm
                      inputId="withdrawal-amount-modal"
                      withdrawalAmount={withdrawalAmount}
                      setWithdrawalAmount={setWithdrawalAmount}
                      onSubmit={() => withdraw.mutate()}
                      isPending={withdraw.isPending}
                      hasPixKey={!!withdrawalPixKey?.withdrawal_pix_key}
                      statementError={statementError}
                    />
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )}
      </div>
    );
  }

  const available = statement?.availableCents ?? 0;
  const pending = statement?.pendingChargesCents ?? 0;
  const locked = statement?.lockedCents ?? 0;

  return (
    <div>
      <PageHeader
        title="Sua carteira"
        subtitle={`Sinais pagos pelos clientes de ${business?.name ?? "seu negócio"}.`}
      />

      <button
        type="button"
        onClick={() => setWalletDetail(true)}
        aria-label="Abrir detalhes da carteira"
        className="report-luminous-card report-effect-strong mx-auto block w-full max-w-2xl cursor-pointer p-6 text-left transition-transform hover:-translate-y-0.5"
      >
        <div className="relative z-10 space-y-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.18)]">
              <CircleDollarSign className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Saldo disponível
              </p>
              <p className="font-display text-3xl font-bold text-primary">
                {statementLoading ? "Carregando…" : formatPrice(available)}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-500/25 bg-sky-500/10 text-sky-400">
              <History className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Total recebido
              </p>
              <p className="font-display text-2xl font-bold">
                {statementLoading ? "Carregando…" : formatPrice(statement?.totalReceivedCents ?? 0)}
              </p>
            </div>
          </div>

          {locked > 0 && (
            <p className="text-sm text-muted-foreground">
              Em saque (aguardando confirmação do Pix): {formatPrice(locked)}
            </p>
          )}
          {statement?.withdrawalsBlocked && (
            <p role="alert" className="text-sm text-amber-300">
              Seu saldo está negativo por um estorno. Novos saques ficam bloqueados até a revisão do
              administrador.
            </p>
          )}

          <div className="h-px w-full bg-white/10" />

          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.18)]">
              <Clock3 className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Saldo pendente
              </p>
              <p className="font-display text-3xl font-bold">{formatPrice(pending)}</p>
            </div>
          </div>
        </div>
      </button>

      <p className="mx-auto mt-5 max-w-2xl text-center text-sm text-muted-foreground">
        Todas as transações de sinal são intermediadas pelo Agenda Agora.
      </p>

      <div className="mx-auto mt-6 max-w-2xl text-center">
        <button
          type="button"
          onClick={() => setRulesOpen(true)}
          className="inline-flex h-11 items-center justify-center rounded-full bg-[linear-gradient(90deg,#9a7118,#f6d97a,#9a7118)] px-10 text-base font-bold text-[#231a03] shadow-[0_10px_24px_rgba(217,168,63,0.35)] transition hover:brightness-[1.06]"
        >
          Configuração de regras
        </button>
        <p className="mt-4 text-sm font-medium text-[#25d366]">
          Todas as transações são intermediadas pela empresa Agenda Serviço
        </p>
        <p className="mt-1 text-sm text-[#8b8e96]">CNPJ 45.187.843/0001-87</p>
      </div>

      <section className="report-luminous-card report-effect-medium as-pay-card mx-auto mt-8 max-w-2xl p-4 sm:p-5">
        <div className="relative z-10">
          <div className="as-pay-section-title">
            <KeyRound aria-hidden="true" />
            <h2>Chave PIX de saque</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Cadastre a chave para onde os saques do seu saldo devem ser enviados.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pix-key-type">Tipo de chave</Label>
              <select
                id="pix-key-type"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={pixKeyType}
                onChange={(e) => setPixKeyType(e.target.value as WithdrawalPixKeyType)}
              >
                {withdrawalPixKeyTypes.map((type) => (
                  <option key={type} value={type}>
                    {pixKeyTypeLabel[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pix-key">Chave PIX</Label>
              <Input
                id="pix-key"
                placeholder="Sua chave PIX"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                aria-invalid={!!pixKeyError}
                aria-describedby={pixKeyError ? "pix-key-error" : undefined}
              />
              {pixKeyError && (
                <p id="pix-key-error" role="alert" className="text-sm text-destructive">
                  {pixKeyError}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              disabled={!pixKey.trim() || !!pixKeyError || savePixKey.isPending}
              onClick={() => savePixKey.mutate()}
            >
              Salvar chave PIX
            </Button>
            <Button
              variant="secondary"
              disabled={!pixKey.trim() || !!pixKeyError}
              onClick={() => submitPixApproval.mutate()}
            >
              Enviar Pix para aprovação
            </Button>
          </div>
          {pixApproval && (
            <p
              className={`mt-2 text-sm ${
                pixApproval.status === "aprovado"
                  ? "text-emerald-400"
                  : pixApproval.status === "recusado"
                    ? "text-destructive"
                    : "text-amber-300"
              }`}
            >
              {pixApproval.status === "aprovado"
                ? "Chave Pix aprovada pela equipe. Você já pode sacar."
                : pixApproval.status === "recusado"
                  ? "Chave Pix recusada. Envie uma nova chave no nome do titular da conta mãe."
                  : "Chave Pix aguardando aprovação da equipe."}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
