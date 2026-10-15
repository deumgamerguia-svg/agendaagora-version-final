import { useState } from "react";
import { friendlyError } from "@/lib/error-page";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarX2, Plus, Repeat2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/lib/business";
import { WEEKDAYS, weekdayLabel, hhmm, toDateInput } from "@/lib/format";
import { createTimeBlock } from "@/lib/time-blocks.functions";
import { validateTimeBlockRange } from "@/lib/time-blocks";
import { NoBusiness } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/painel/bloqueios")({
  head: () => ({
    meta: [
      { title: "Horários bloqueados — Agenda Agora" },
      { name: "description", content: "Bloqueie horários recorrentes ou de uma data específica." },
      { property: "og:title", content: "Horários bloqueados — Agenda Agora" },
      { property: "og:description", content: "Bloqueios recorrentes e específicos." },
    ],
  }),
  component: BloqueiosPage,
});

function BloqueiosPage() {
  const { businessId } = useBusiness();
  const queryClient = useQueryClient();
  const createTimeBlockFn = useServerFn(createTimeBlock);
  const emptyForm = {
    recurring: true,
    weekday: "1",
    date: toDateInput(new Date()),
    starts: "09:00",
    ends: "09:30",
    reason: "",
  };
  const [open, setOpen] = useState(false);
  const [blockToRemove, setBlockToRemove] = useState<string | null>(null);
  const [showRecurring, setShowRecurring] = useState(true);
  const [showSpecific, setShowSpecific] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const isFormDirty = JSON.stringify(form) !== JSON.stringify(emptyForm);

  const blocksQuery = useQuery({
    queryKey: ["time_blocks", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_blocks")
        .select("*")
        .eq("business_id", businessId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["time_blocks", businessId] });
  const timeError = validateTimeBlockRange(form.starts, form.ends);

  const create = useMutation({
    mutationFn: async () =>
      createTimeBlockFn({
        data: {
          businessId: businessId!,
          recurring: form.recurring,
          weekday: form.recurring ? Number(form.weekday) : null,
          blockDate: form.recurring ? null : form.date,
          startsAt: form.starts,
          endsAt: form.ends,
          reason: form.reason || null,
        },
      }),
    onSuccess: () => {
      toast.success("Bloqueio cadastrado!");
      setOpen(false);
      setForm(emptyForm);
      void invalidate();
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("time_blocks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
  });

  if (!businessId) return <NoBusiness />;

  const blocks = blocksQuery.data;
  const filtered = (blocks ?? []).filter((b) => (b.recurring ? showRecurring : showSpecific));

  return (
    <div>
      <section className="report-luminous-card report-effect-strong p-4 sm:p-6">
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ff5a5a]/40 bg-[#ff5a5a]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#ff8080]">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-[#ff6b6b] shadow-[0_0_8px_rgba(255,107,107,0.9)]"
            />
            Bloqueios
          </span>
          <h1 className="mt-2 max-w-2xl font-['Manrope'] text-xl font-black tracking-tight text-white md:text-2xl">
            Horários bloqueados
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#9aa4b2]">
            Defina folgas, pausas e períodos que não podem receber agendamentos.
          </p>
          <div className="relative mt-4">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-6 top-0 z-10 h-[2.7px] w-16 -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,#0187fc,#01fbfd)] shadow-[0_0_12px_rgba(1,251,253,0.9),0_0_30px_rgba(0,30,252,0.7)]"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-6 top-0 z-0 h-8 w-16 bg-[radial-gradient(ellipse_at_50%_0%,rgba(109,179,255,0.28),transparent_75%)] blur-[6px]"
            />
            <Dialog
              open={open}
              onOpenChange={(v) => {
                if (v) {
                  setOpen(true);
                  return;
                }
                if (isFormDirty) {
                  setConfirmDiscard(true);
                  return;
                }
                setOpen(false);
                setForm(emptyForm);
              }}
            >
              <DialogTrigger asChild>
                <Button className="w-full rounded-xl border border-[rgba(51,125,255,0.29)] bg-[rgba(22,119,255,0.09)] text-[#69a2ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_0_18px_rgba(22,119,255,0.08)] hover:border-[rgba(51,125,255,0.5)] hover:bg-[rgba(22,119,255,0.14)] hover:text-[#8fb5ff] sm:w-auto">
                  <Plus className="size-4" strokeWidth={2.2} /> Cadastrar bloqueio
                </Button>
              </DialogTrigger>
            <DialogContent className="professional-dialog max-h-[92vh] max-w-xl overflow-y-auto p-0">
              <DialogHeader className="professional-dialog-header">
                <div className="flex items-start gap-3 text-left">
                  <div className="professional-dialog-icon">
                    <CalendarX2 className="size-[1.05rem]" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="text-lg font-semibold tracking-[-0.025em] text-[#f1f2f4]">
                      Adicionar bloqueio
                    </DialogTitle>
                    <p className="mt-1 text-xs leading-relaxed text-[#686b74]">
                      Escolha se o bloqueio se repete semanalmente ou acontece em uma data
                      específica.
                    </p>
                  </div>
                </div>
              </DialogHeader>
              <div className="professional-dialog-body px-4 pb-4 sm:px-5 sm:pb-5">
                <div className="professional-form-section mt-4 space-y-5">
                  <div>
                    <Label className="professional-section-label">Tipo de bloqueio</Label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className={`bloqueio-type-option${form.recurring ? " is-selected" : ""}`}
                        onClick={() => setForm({ ...form, recurring: true })}
                      >
                        <Repeat2 className="size-4" />
                        Semanal
                      </button>
                      <button
                        type="button"
                        className={`bloqueio-type-option${form.recurring ? "" : " is-selected"}`}
                        onClick={() => setForm({ ...form, recurring: false })}
                      >
                        <CalendarX2 className="size-4" />
                        Data específica
                      </button>
                    </div>
                  </div>
                  {form.recurring ? (
                    <div className="space-y-2">
                      <Label className="professional-section-label">Dia da semana</Label>
                      <Select
                        value={form.weekday}
                        onValueChange={(weekday) => setForm({ ...form, weekday })}
                      >
                        <SelectTrigger className="professional-input w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEKDAYS.map((d) => (
                            <SelectItem key={d.value} value={String(d.value)}>
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label className="professional-section-label" htmlFor="bdate">
                        Data
                      </Label>
                      <Input
                        id="bdate"
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm({ ...form, date: e.target.value })}
                        className="professional-input"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="professional-section-label" htmlFor="bstart">
                        Começo
                      </Label>
                      <Input
                        id="bstart"
                        type="time"
                        value={form.starts}
                        onChange={(e) => setForm({ ...form, starts: e.target.value })}
                        className="professional-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="professional-section-label" htmlFor="bend">
                        Fim
                      </Label>
                      <Input
                        id="bend"
                        type="time"
                        value={form.ends}
                        onChange={(e) => setForm({ ...form, ends: e.target.value })}
                        className="professional-input"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="professional-section-label" htmlFor="breason">
                      Motivo (opcional)
                    </Label>
                    <Input
                      id="breason"
                      value={form.reason}
                      onChange={(e) => setForm({ ...form, reason: e.target.value })}
                      placeholder="Almoço, compromisso pessoal..."
                      className="professional-input"
                    />
                  </div>
                </div>
              </div>
              {timeError && (
                <p role="alert" className="px-4 text-sm text-destructive sm:px-5">
                  {timeError}
                </p>
              )}
              <DialogFooter className="professional-dialog-footer">
                <Button
                  variant="outline"
                  className="professional-secondary-button"
                  onClick={() => {
                    setOpen(false);
                    setForm(emptyForm);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  className="professional-primary-button"
                  onClick={() => create.mutate()}
                  disabled={create.isPending || !!timeError}
                >
                  Criar bloqueio
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </section>
      <div className="report-luminous-card report-effect-strong mt-[4.5%] overflow-hidden">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 z-10 h-[2px] w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#4d9cff] to-transparent shadow-[0_0_14px_rgba(77,155,255,0.9)]"
        />
      <div className="relative z-10 flex flex-wrap items-center gap-2 border-b border-[#22252b] px-4 py-3 sm:px-5">
        <label
          className={`bloqueio-filter-chip focus-within:ring-2 focus-within:ring-ring ${showRecurring ? "is-selected" : ""}`}
        >
          <Checkbox
            className="sr-only"
            checked={showRecurring}
            onCheckedChange={(v) => setShowRecurring(v === true)}
          />
          <Repeat2 className="size-3.5" />
          Recorrentes
        </label>
        <label
          className={`bloqueio-filter-chip focus-within:ring-2 focus-within:ring-ring ${showSpecific ? "is-selected" : ""}`}
        >
          <Checkbox
            className="sr-only"
            checked={showSpecific}
            onCheckedChange={(v) => setShowSpecific(v === true)}
          />
          <CalendarX2 className="size-3.5" />
          Específicos
        </label>
      </div>

      {blocksQuery.isError ? (
        <p role="alert" className="rounded-xl border border-destructive/40 p-6 text-center text-sm">
          Não foi possível carregar os horários bloqueados. Atualize a página e tente novamente.
        </p>
      ) : !filtered.length ? (
        <div className="professional-empty-state">
          <div className="professional-icon-box !size-14">
            <CalendarX2 className="size-6" strokeWidth={2} aria-hidden="true" />
          </div>
          <h3>Nenhum horário bloqueado</h3>
          <p>
            Cadastre uma folga, pausa recorrente ou período específico para impedir novos
            agendamentos.
          </p>
          <Button className="professional-primary-button mt-5" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Criar primeiro bloqueio
          </Button>
        </div>
      ) : (
          <table className="relative z-10 w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Data</th>
                <th className="py-3 pl-[7px] pr-4 text-left">Começo</th>
                <th className="px-4 py-3 text-left">Fim</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} className="border-t border-border/60">
                  <td className="px-4 py-3 font-medium">
                    {b.recurring
                      ? weekdayLabel(b.weekday ?? 0)
                      : new Date(`${b.block_date}T00:00:00`).toLocaleDateString("pt-BR")}
                    {b.reason && (
                      <span className="ml-2 text-xs text-muted-foreground">{b.reason}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{hhmm(b.starts_at)}</td>
                  <td className="px-4 py-3">{hhmm(b.ends_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setBlockToRemove(b.id)}
                      aria-label="Remover bloqueio"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      )}
      </div>
      <AlertDialog
        open={blockToRemove !== null}
        onOpenChange={(value) => !value && setBlockToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover bloqueio?</AlertDialogTitle>
            <AlertDialogDescription>
              Esse horário voltará a ficar disponível para agendamentos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (blockToRemove)
                  remove.mutate(blockToRemove, { onSettled: () => setBlockToRemove(null) });
              }}
              disabled={remove.isPending}
            >
              Remover bloqueio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmDiscard} onOpenChange={(v) => !v && setConfirmDiscard(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem alterações não salvas neste formulário. Se sair agora, elas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscard(false);
                setOpen(false);
                setForm(emptyForm);
              }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
