import { useEffect, useState } from "react";
import { friendlyError } from "@/lib/error-page";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarX2, Clock3, Eye, LockKeyhole, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { setAppointmentStatus } from "@/lib/appointments.functions";
import { useBusiness } from "@/lib/business";
import {
  STATUSES,
  statusLabel,
  toDateInput,
  localToIso,
  addMinutesIso,
  formatPrice,
} from "@/lib/format";
import { NoBusiness } from "@/components/painel/PageHeader";
import { AtenasOverviewHero } from "@/components/painel/AtenasOverviewHero";
import { AgendaDateSelector } from "@/components/painel/AgendaDateSelector";
import { ProfessionalAvatar, ProfessionalBubbles } from "@/components/painel/ProfessionalBubbles";
import { formatPhoneBR } from "@/lib/format-phone";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/painel/")({
  head: () => ({
    meta: [
      { title: "Agenda do dia — Agenda Agora" },
      { name: "description", content: "Veja e gerencie os agendamentos do dia do seu negócio." },
      { property: "og:title", content: "Agenda do dia — Agenda Agora" },
      { property: "og:description", content: "Veja e gerencie os agendamentos do dia." },
    ],
  }),
  component: AgendaPage,
});

const START_HOUR = 8;
const END_HOUR = 19;

function buildSlots() {
  const slots: string[] = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h !== END_HOUR) slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
}

const SLOTS = buildSlots();

function slotOf(iso: string) {
  const d = new Date(iso);
  const m = d.getMinutes() < 30 ? "00" : "30";
  return `${String(d.getHours()).padStart(2, "0")}:${m}`;
}

const emptyForm = {
  customer_name: "",
  customer_phone: "",
  service_id: "",
  professional_id: "",
  time: "09:00",
  notes: "",
};

/** Símbolo oficial do Pix (Font Awesome Free 6.5.2 — brands/pix). */
function PixGlyph() {
  return (
    <svg viewBox="0 0 512 512" className="size-4" fill="currentColor" aria-label="Pix">
      <path d="M242.4 292.5C247.8 287.1 257.1 287.1 262.5 292.5L339.5 369.5C353.7 383.7 372.6 391.5 392.6 391.5H407.7L310.6 488.6C280.3 518.1 231.1 518.1 200.8 488.6L103.3 391.2H112.6C132.6 391.2 151.5 383.4 165.7 369.2L242.4 292.5zM262.5 218.9C256.1 224.4 247.9 224.5 242.4 218.9L165.7 142.2C151.5 127.1 132.6 120.2 112.6 120.2H103.3L200.7 22.76C231.1-7.586 280.3-7.586 310.6 22.76L407.8 119.9H392.6C372.6 119.9 353.7 127.7 339.5 141.9L262.5 218.9zM112.6 142.7C126.4 142.7 139.1 148.3 149.7 158.1L226.4 234.8C233.6 241.1 243 245.6 252.5 245.6C261.9 245.6 271.3 241.1 278.5 234.8L355.5 157.8C365.3 148.1 378.8 142.5 392.6 142.5H430.3L488.6 200.8C518.9 231.1 518.9 280.3 488.6 310.6L430.3 368.9H392.6C378.8 368.9 365.3 363.3 355.5 353.5L278.5 276.5C264.6 262.6 240.3 262.6 226.4 276.6L149.7 353.2C139.1 363 126.4 368.6 112.6 368.6H80.78L22.76 310.6C-7.586 280.3-7.586 231.1 22.76 200.8L80.78 142.7H112.6z" />
    </svg>
  );
}

function AgendaPage() {
  const { businessId, business, canViewCustomerPhone } = useBusiness();
  const queryClient = useQueryClient();
  const setAppointmentStatusFn = useServerFn(setAppointmentStatus);
  const [day, setDay] = useState(() => toDateInput(new Date()));
  const [pickedProfessionalId, setPickedProfessionalId] = useState<string | null>(null);
  // Duração da animação de troca do painel da agenda (ms). As setas de dia
  // usam 1000ms (dá tempo de carregar os clientes); a troca de profissional usa 280ms.
  const [agendaSwapMs, setAgendaSwapMs] = useState(280);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [encaixeMode, setEncaixeMode] = useState(false);
  const [encaixeOpen, setEncaixeOpen] = useState(false);

  const { data: services } = useQuery({
    queryKey: ["services", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("business_id", businessId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: professionals } = useQuery({
    queryKey: ["professionals", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("*")
        .eq("business_id", businessId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Sem escolha explícita, vale o primeiro profissional; se o escolhido sumiu, volta ao primeiro.
  const selectedProfessionalId =
    professionals?.find((p) => p.id === pickedProfessionalId)?.id ?? professionals?.[0]?.id ?? null;
  const selectedProfessional = professionals?.find((p) => p.id === selectedProfessionalId) ?? null;

  const { data: appointments } = useQuery({
    queryKey: ["appointments", businessId, day, selectedProfessionalId],
    enabled: !!businessId && professionals !== undefined,
    queryFn: async () => {
      const start = new Date(`${day}T00:00:00`).toISOString();
      const end = new Date(`${day}T23:59:59`).toISOString();
      let query = supabase
        .from("appointments")
        .select(
          "*, services(name, price_cents, requires_deposit, deposit_mode, deposit_percent_bps, deposit_cents), professionals(name)",
        )
        .eq("business_id", businessId!)
        .gte("starts_at", start)
        .lte("starts_at", end)
        .not("status", "in", "(aguardando_sinal,cancelado)");
      // Itens sem profissional (ex.: horário bloqueado) valem para todos.
      if (selectedProfessionalId) {
        query = query.or(`professional_id.eq.${selectedProfessionalId},professional_id.is.null`);
      }
      const { data, error } = await query.order("starts_at");
      if (error) throw error;
      return data;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["appointments", businessId, day] });

  const create = useMutation({
    mutationFn: async () => {
      const service = services?.find((s) => s.id === form.service_id);
      const startsAt = localToIso(day, form.time);
      const rawNotes = form.notes?.trim() ?? "";
      const notes = encaixeMode ? `[ENCAIXE]${rawNotes ? ` ${rawNotes}` : ""}` : rawNotes || null;
      const { error } = await supabase.from("appointments").insert({
        business_id: businessId!,
        service_id: form.service_id || null,
        professional_id: form.professional_id || null,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone || null,
        starts_at: startsAt,
        ends_at: addMinutesIso(startsAt, service?.duration_minutes ?? 30),
        notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agendamento criado!");
      setOpen(false);
      setEncaixeOpen(false);
      setForm(emptyForm);
      setEncaixeMode(false);
      void invalidate();
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const blockSlot = useMutation({
    mutationFn: async (time: string) => {
      const startsAt = localToIso(day, time);
      const { error } = await supabase.from("appointments").insert({
        business_id: businessId!,
        customer_name: "Bloqueado",
        starts_at: startsAt,
        ends_at: addMinutesIso(startsAt, 30),
        status: "bloqueado",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Horário bloqueado.");
      void invalidate();
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await setAppointmentStatusFn({
        data: { id, status: status as (typeof STATUSES)[number]["value"] },
      });
    },
    onSuccess: () => void invalidate(),
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agendamento removido.");
      setDetail(null);
      void invalidate();
    },
  });

  const selected = (appointments ?? []).find((a) => a.id === detail) ?? null;
  const [detailForm, setDetailForm] = useState({ name: "", phone: "" });
  useEffect(() => {
    if (selected)
      setDetailForm({
        name: selected.customer_name,
        phone: selected.customer_phone ?? "",
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const updateSelectedCustomer = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const { error } = await supabase
        .from("appointments")
        .update({ customer_name: detailForm.name, customer_phone: detailForm.phone || null })
        .eq("id", selected.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dados do cliente atualizados.");
      void invalidate();
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  if (!businessId) return <NoBusiness />;

  const bySlot = new Map<
    string,
    (typeof appointments extends (infer T)[] | undefined ? T : never)[]
  >();
  for (const a of appointments ?? []) {
    const key = slotOf(a.starts_at);
    bySlot.set(key, [...(bySlot.get(key) ?? []), a]);
  }

  // Enquanto os agendamentos do dia/profissional atual ainda não chegaram,
  // exibimos um estado de carregamento animado (skeleton) no lugar da lista.
  const agendaLoading = appointments === undefined;

  const weekday = new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" });
  // Capitalização garantida via JS (primeira letra e após hífen: "Quarta-Feira"),
  // sem depender do text-transform do CSS.
  const weekdayLabel = weekday.replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
  const openNewAt = (time: string, encaixe = false) => {
    const next = { ...emptyForm, time, professional_id: selectedProfessionalId ?? "" };
    setForm(next);
    setEncaixeMode(encaixe);
    setOpen(true);
  };

  /** Rola suavemente até a lista de agendamentos, logo abaixo do header fixo. */
  const scrollToAgenda = () => {
    const el = document.getElementById("minha-agenda");
    if (!el) return;
    const stickyHeader = document.querySelector<HTMLElement>(".owner-panel header.sticky");
    const offset = (stickyHeader?.getBoundingClientRect().height ?? 0) + 8;
    const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset);
    window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <div>
      <h1 className="sr-only">Agenda · {weekday}</h1>
      <AtenasOverviewHero name={business?.name} onSeeAgenda={scrollToAgenda} />
      <AgendaDateSelector
        value={day}
        onChange={(next) => {
          setAgendaSwapMs(1000);
          setDay(next);
        }}
      />

      <ProfessionalBubbles
        professionals={professionals ?? []}
        selectedId={selectedProfessionalId}
        onSelect={(id) => {
          setAgendaSwapMs(280);
          setPickedProfessionalId(id);
        }}
      />

      {selectedProfessional ? (
        <div
          aria-hidden="true"
          className="relative z-20 -mb-[55px] ml-px size-16 overflow-hidden rounded-full"
        >
          <ProfessionalAvatar professional={selectedProfessional} />
        </div>
      ) : null}
      <div
        id="minha-agenda"
        key={`${day}-${selectedProfessionalId ?? "none"}-${agendaLoading ? "loading" : "ready"}`}
        className="agenda-swap-in mx-auto mt-3 w-[99%] overflow-hidden rounded-md border border-border"
        style={{ animationDuration: `${agendaSwapMs}ms` }}
      >
        <div className="relative flex h-12 items-center gap-3 bg-secondary px-3 text-sm">
          {selectedProfessional ? (
            <span className="min-w-0 truncate pl-16 text-[116%] font-medium capitalize">
              {selectedProfessional.name}
            </span>
          ) : null}
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[116%] capitalize text-white">
            {weekdayLabel}
          </span>
        </div>
        <ul className="font-['Inter',sans-serif]">
          {agendaLoading &&
            SLOTS.slice(0, 6).map((slot) => (
              <li key={slot} className="agenda-skeleton-row" aria-hidden="true">
                <span className="agenda-skeleton-bar agenda-skeleton-bar-time" />
                <span className="agenda-skeleton-bar agenda-skeleton-bar-line" />
              </li>
            ))}
          {!agendaLoading &&
            SLOTS.map((slot) => {
              const items = bySlot.get(slot) ?? [];
              if (!items.length) {
                return (
                  <li key={slot} className="agenda-row agenda-row--free group relative">
                    <button
                      type="button"
                      onClick={() => openNewAt(slot)}
                      className="agenda-row-btn"
                    >
                      <span className="agenda-cell agenda-cell--time">{slot}</span>
                      <span className="agenda-cell agenda-cell--cliente" />
                      <span className="agenda-cell agenda-cell--servico" />
                      <span className="agenda-cell agenda-cell--pago" />
                    </button>
                  </li>
                );
              }
              return items.map((a) => {
                const cancelled = a.status === "cancelado";
                const blocked = a.status === "bloqueado";
                const isEncaixe = a.notes?.trim().toLowerCase().startsWith("[encaixe]");
                const isPublicBooking = !!a.customer_id && !isEncaixe;
                const depositPaid = !!a.deposit_paid_at;
                const tone = blocked
                  ? "blocked"
                  : cancelled
                    ? "cancelled"
                    : isEncaixe
                      ? "encaixe"
                      : isPublicBooking
                        ? "public"
                        : depositPaid
                          ? "admin-pix"
                          : "admin";
                const price = (a.services as { price_cents: number } | null)?.price_cents ?? 0;
                const serviceName = (a.services as { name: string } | null)?.name ?? "Serviço";
                // Espaço do Pix só existe se o serviço tem sinal configurado
                // (mesma regra do catálogo: requires_deposit + valor efetivo > 0)
                // ou se o sinal já foi pago. Sem sinal, a linha usa 3 blocos cheios.
                const svc = a.services as {
                  requires_deposit?: boolean | null;
                  deposit_mode?: string | null;
                  deposit_percent_bps?: number | null;
                  deposit_cents?: number | null;
                } | null;
                const depositConfigured =
                  !!svc?.requires_deposit &&
                  (svc.deposit_mode === "percent"
                    ? price > 0 && (svc.deposit_percent_bps ?? 0) > 0
                    : (svc.deposit_cents ?? 0) > 0);
                const showPixCol = depositPaid || depositConfigured;
                return (
                  <li
                    key={a.id}
                    className={`agenda-row agenda-row--${tone}${showPixCol ? "" : " agenda-row--sem-sinal"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setDetail(a.id)}
                      className="agenda-row-btn"
                    >
                      <span className="agenda-cell agenda-cell--time">{slot}</span>
                      <span className="agenda-cell agenda-cell--cliente">
                        {blocked ? (
                          <span className="agenda-blocked-label">Horário bloqueado</span>
                        ) : (
                          <>
                            {a.customer_name ? (
                              <span className="agenda-cliente-name">{a.customer_name}</span>
                            ) : null}
                            {a.customer_phone && canViewCustomerPhone ? (
                              <span className="agenda-cliente-phone">
                                <span
                                  aria-hidden="true"
                                  className="agenda-whatsapp-icon"
                                  style={{
                                    WebkitMaskImage: "url('/sidebar-whatsapp-mask.png')",
                                    maskImage: "url('/sidebar-whatsapp-mask.png')",
                                    WebkitMaskSize: "contain",
                                    maskSize: "contain",
                                    WebkitMaskRepeat: "no-repeat",
                                    maskRepeat: "no-repeat",
                                    WebkitMaskPosition: "center",
                                    maskPosition: "center",
                                  }}
                                />
                                {formatPhoneBR(a.customer_phone)}
                              </span>
                            ) : null}
                          </>
                        )}
                      </span>
                      <span className="agenda-cell agenda-cell--servico">
                        {blocked ? null : (
                          <>
                            <span className="agenda-servico-label">{serviceName}</span>
                            <span className="agenda-servico-price">{formatPrice(price)}</span>
                          </>
                        )}
                      </span>
                      <span className="agenda-cell agenda-cell--pago">
                        {!blocked && depositPaid ? (
                          <span className="agenda-pago">
                            <PixGlyph />
                            <span>
                              {(a.deposit_cents / 100).toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              });
            })}
        </ul>
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (v) {
            setOpen(true);
            return;
          }
          setOpen(false);
          setForm(emptyForm);
        }}
      >
        <DialogContent className="agenda-booking-dialog overflow-y-auto p-0">
          <DialogHeader className="agenda-booking-dialog-header">
            <div className="flex items-start gap-3 text-left">
              <div className="agenda-booking-dialog-icon">
                <Clock3 className="size-[1.05rem]" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-semibold tracking-[-0.025em] text-[#f1f2f4]">
                  Novo agendamento
                </DialogTitle>
                <p className="mt-1 text-xs leading-relaxed text-[#686b74]">
                  Agendar Serviço às {form.time || "--:--"} —{" "}
                  {new Date(`${day}T12:00:00`)
                    .toLocaleDateString("pt-BR", { weekday: "long" })
                    .replace(/(^|\s)\w/g, (c) => c.toUpperCase())}
                </p>
              </div>
            </div>
          </DialogHeader>
          <div className="agenda-booking-dialog-body">
            <div className="agenda-booking-form-section space-y-5">
              <button
                type="button"
                disabled={!form.time || blockSlot.isPending}
                onClick={() =>
                  form.time &&
                  blockSlot.mutate(form.time, { onSuccess: () => setOpen(false) })
                }
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/40 bg-red-400/[0.06] px-4 py-3 text-sm font-semibold text-red-300 transition-colors hover:bg-red-400/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LockKeyhole className="size-4" aria-hidden="true" />
                {blockSlot.isPending ? "Bloqueando..." : "Bloquear horário"}
              </button>
              <div className="space-y-2">
                <Label className="agenda-booking-label">Serviço</Label>
                <Select
                  value={form.service_id}
                  onValueChange={(v) => setForm({ ...form, service_id: v })}
                >
                  <SelectTrigger className="agenda-booking-input w-full">
                    <SelectValue placeholder="Selecione um serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {(services ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} · {s.duration_minutes} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="agenda-booking-duo grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label className="agenda-booking-label" htmlFor="aname">
                    NOME DO CLIENTE
                  </Label>
                  <Input
                    id="aname"
                    className="agenda-booking-input"
                    placeholder="Nome Cliente"
                    value={form.customer_name}
                    onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="agenda-booking-label" htmlFor="aphone">
                    NÚMERO DO CLIENTE
                  </Label>
                  <Input
                    id="aphone"
                    className="agenda-booking-input"
                    inputMode="numeric"
                    placeholder="(00) 00000-0000"
                    value={formatPhoneBR(form.customer_phone)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        customer_phone: e.target.value.replace(/\D/g, "").slice(0, 11),
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="agenda-booking-label">Profissional</Label>
                  <Select
                    value={form.professional_id}
                    onValueChange={(v) => setForm({ ...form, professional_id: v })}
                  >
                    <SelectTrigger className="agenda-booking-input w-full">
                      <SelectValue placeholder="Qualquer um" />
                    </SelectTrigger>
                    <SelectContent>
                      {(professionals ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="agenda-booking-dialog-footer">
            <Button
              className="agenda-booking-primary-button"
              onClick={() => create.mutate()}
              disabled={!form.customer_name.trim() || create.isPending}
            >
              Agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="agenda-booking-dialog overflow-y-auto p-0">
          <DialogHeader className="agenda-booking-dialog-header">
            <div className="flex items-start gap-3 text-left">
              <div className="agenda-booking-dialog-icon">
                <Clock3 className="size-[1.05rem]" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-semibold tracking-[-0.025em] text-[#f1f2f4]">
                  {selected
                    ? `${slotOf(selected.starts_at)} - ${slotOf(selected.ends_at)} ${new Date(selected.starts_at).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}`
                    : ""}
                </DialogTitle>
                <p className="mt-1 text-xs leading-relaxed text-[#686b74]">
                  Origem:{" "}
                  {(selected?.notes ?? "").startsWith("[ENCAIXE]") ? "Encaixe" : "prof. Agenda"}
                </p>
              </div>
            </div>
          </DialogHeader>

          {selected && (
            <div className="agenda-booking-dialog-body">
              <div className="agenda-booking-form-section space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="agenda-booking-label" htmlFor="dname">
                      NOME DO CLIENTE
                    </Label>
                    <Input
                      id="dname"
                      className="agenda-booking-input"
                      value={detailForm.name}
                      onChange={(e) => setDetailForm((f) => ({ ...f, name: e.target.value }))}
                      onBlur={() => updateSelectedCustomer.mutate()}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="agenda-booking-label" htmlFor="dphone">
                      NÚMERO DO CLIENTE
                    </Label>
                    <Input
                      id="dphone"
                      className="agenda-booking-input"
                      inputMode="numeric"
                      value={formatPhoneBR(detailForm.phone)}
                      onChange={(e) =>
                        setDetailForm((f) => ({
                          ...f,
                          phone: e.target.value.replace(/\D/g, "").slice(0, 11),
                        }))
                      }
                      onBlur={() => updateSelectedCustomer.mutate()}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="agenda-booking-label">SERVIÇOS</Label>
                  <div className="agenda-booking-input flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="font-semibold">
                      {(selected.services as { name: string } | null)?.name ?? "Serviço"}
                    </span>
                    <span>
                      {formatPrice(
                        (selected.services as { price_cents: number } | null)?.price_cents ?? 0,
                      )}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="agenda-booking-label">RESUMO DE PAGAMENTO</Label>
                  <div className="agenda-booking-input rounded-md border px-3 py-2">
                    <span className="font-semibold text-primary">
                      Total pendente{" "}
                      {formatPrice(
                        (selected.services as { price_cents: number } | null)?.price_cents ?? 0,
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="agenda-booking-dialog-footer flex gap-3">
            <Button variant="destructive" className="flex-1" onClick={() => setConfirmCancel(true)}>
              Cancelar serviço
            </Button>
            <Button
              className="flex-1"
              onClick={() => setStatus.mutate({ id: selected!.id, status: "concluido" })}
            >
              Finalizar serviço
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={encaixeOpen}
        onOpenChange={(v) => {
          if (!v) {
            setEncaixeOpen(false);
            setEncaixeMode(false);
          }
        }}
      >
        <DialogContent className="agenda-booking-dialog overflow-y-auto p-0">
          <DialogHeader className="agenda-booking-dialog-header">
            <div className="flex items-start gap-3 text-left">
              <div className="agenda-booking-dialog-icon">
                <Clock3 className="size-[1.05rem]" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-semibold tracking-[-0.025em] text-[#f1f2f4]">
                  Novo agendamento
                </DialogTitle>
                <p className="mt-1 text-xs leading-relaxed text-[#686b74]">
                  Agendar Serviço às {form.time || "--:--"} —{" "}
                  {new Date(`${day}T12:00:00`)
                    .toLocaleDateString("pt-BR", { weekday: "long" })
                    .replace(/(^|\s)\w/g, (c) => c.toUpperCase())}
                </p>
              </div>
            </div>
          </DialogHeader>
          <div className="agenda-booking-dialog-body">
            <div className="agenda-booking-form-section space-y-5">
              <div className="space-y-2">
                <Label className="agenda-booking-label" htmlFor="etime">
                  Horário
                </Label>
                <Input
                  id="etime"
                  className="agenda-booking-input"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="agenda-booking-label" htmlFor="ename">
                  NOME DO CLIENTE
                </Label>
                <Input
                  id="ename"
                  className="agenda-booking-input"
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  placeholder="Nome Cliente"
                />
              </div>
              <div className="space-y-2">
                <Label className="agenda-booking-label" htmlFor="ephone">
                  NÚMERO DO CLIENTE
                </Label>
                <Input
                  id="ephone"
                  className="agenda-booking-input"
                  inputMode="numeric"
                  value={formatPhoneBR(form.customer_phone)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      customer_phone: e.target.value.replace(/\D/g, "").slice(0, 11),
                    })
                  }
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label className="agenda-booking-label">SERVIÇO</Label>
                <Select
                  value={form.service_id}
                  onValueChange={(v) => setForm({ ...form, service_id: v })}
                >
                  <SelectTrigger className="agenda-booking-input w-full">
                    <SelectValue placeholder="Selecione um serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {(services ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} · {s.duration_minutes} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="agenda-booking-label">PROFISSIONAL</Label>
                <Select
                  value={form.professional_id}
                  onValueChange={(v) => setForm({ ...form, professional_id: v })}
                >
                  <SelectTrigger className="agenda-booking-input w-full">
                    <SelectValue placeholder="Agenda" />
                  </SelectTrigger>
                  <SelectContent>
                    {(professionals ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="agenda-booking-dialog-footer">
            <Button
              className="agenda-booking-primary-button"
              onClick={() => create.mutate()}
              disabled={!form.customer_name.trim() || !form.time || create.isPending}
            >
              Agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro será removido permanentemente. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (selected)
                  remove.mutate(selected.id, { onSettled: () => setConfirmDelete(false) });
              }}
              disabled={remove.isPending}
            >
              Excluir agendamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O horário será liberado para outros clientes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (selected)
                  setStatus.mutate(
                    { id: selected.id, status: "cancelado" },
                    { onSettled: () => setConfirmCancel(false) },
                  );
              }}
              disabled={setStatus.isPending}
            >
              Cancelar agendamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Botão de Encaixe — mesmo HTML/CSS de antes, apenas reposicionado:
          gruda (sticky) na parte de baixo da agenda, sempre visível.
          O FAB de suporte (z-40) fica sobre ele, uma camada acima (z-30). */}
      <div className="sticky bottom-3 z-30">
        <button
          type="button"
          onClick={() => {
            setForm({ ...emptyForm, time: "", professional_id: selectedProfessionalId ?? "" });
            setEncaixeMode(true);
            setEncaixeOpen(true);
          }}
          className="group relative isolate mt-2 flex h-[50.4px] w-full items-center justify-center rounded-[15px] border-[0.75px] border-[#6d5519]/70 bg-[radial-gradient(circle_at_22%_28%,rgba(224,175,45,0.18)_0%,rgba(128,92,20,0.08)_34%,transparent_66%),linear-gradient(100deg,#0c0b08_0%,#0b0b0a_60%,#0d0c09_100%)] px-4 text-[0.82rem] font-medium tracking-[-0.01em] text-[#f5f5f5] shadow-[inset_0_1px_0_rgba(255,222,129,0.035),0_0_18px_rgba(210,157,32,0.025)] transition-all duration-200 ease-in-out hover:border-[#8b6a1d]/75 hover:bg-[radial-gradient(circle_at_22%_28%,rgba(224,175,45,0.22)_0%,rgba(128,92,20,0.10)_34%,transparent_66%),linear-gradient(100deg,#0d0c09_0%,#0b0b0a_60%,#0d0c09_100%)] hover:shadow-[inset_0_1px_0_rgba(255,222,129,0.05),0_0_20px_rgba(210,157,32,0.035)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            aria-hidden="true"
            className="encaixe-border-beam pointer-events-none absolute inset-[-1px] z-20 rounded-[15px]"
          />
          <span className="relative z-10">Encaixe</span>
        </button>
      </div>
    </div>
  );
}
