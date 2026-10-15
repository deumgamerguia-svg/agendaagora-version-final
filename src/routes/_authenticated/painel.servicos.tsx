import { useEffect, useState } from "react";
import { friendlyError } from "@/lib/error-page";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ImagePlus, Pencil, Plus, Scissors, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/lib/business";
import { formatPrice } from "@/lib/format";
import { LOGO_BUCKET, decodeBusinessImageFile, validateLogoFile } from "@/lib/logo";
import { effectiveDepositCents, percentToBps, type DepositMode } from "@/lib/deposit-amount";
import { saveService } from "@/lib/services.functions";
import { NoBusiness, EmptyList } from "@/components/painel/PageHeader";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ServiceCategories } from "@/components/painel/ServiceCategories";

export const Route = createFileRoute("/_authenticated/painel/servicos")({
  head: () => ({
    meta: [
      { title: "Serviços — Agenda Agora" },
      { name: "description", content: "Cadastre serviços, valores, imagens e profissionais." },
      { property: "og:title", content: "Serviços — Agenda Agora" },
      { property: "og:description", content: "Gerencie os serviços oferecidos pelo negócio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServicosPage,
});

type Form = {
  id?: string;
  name: string;
  duration: string;
  price: string;
  deposit: string;
  depositMode: DepositMode;
  depositPercent: string;
  requiresDeposit: boolean;
  description: string;
  isCombo: boolean;
  showPrice: boolean;
  showDuration: boolean;
  showService: boolean;
  imagePath: string | null;
  professionalIds: string[];
  /** Dias da semana em que o serviço pode ser agendado (1=seg ... 6=sáb). */
  availableDays: number[];
};

const ALL_WEEK_DAYS = [1, 2, 3, 4, 5, 6];
const WEEK_DAY_LABELS: Record<number, string> = {
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
};

const empty: Form = {
  name: "",
  duration: "30",
  price: "0",
  deposit: "0",
  depositMode: "fixed",
  depositPercent: "0",
  requiresDeposit: false,
  description: "",
  isCombo: false,
  showPrice: true,
  showDuration: true,
  showService: true,
  imagePath: null,
  professionalIds: [],
  availableDays: [1, 2, 3, 4, 5, 6],
};

const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const percentText = (bps: number) => String(bps / 100).replace(".", ",");

// O provedor Pix exige cobrança mínima de R$ 5,00.
const MIN_PIX_DEPOSIT_CENTS = 500;

function parseCents(value: string) {
  const parsed = Number(value.trim().replace(",", ".") || "0");
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

type DepositDraft =
  | { ok: true; priceCents: number; depositCents: number; bps: number; effectiveCents: number }
  | { ok: false; error: string };

/** Prévia do sinal no painel; o servidor valida e recalcula tudo ao salvar. */
function depositDraft(form: Form): DepositDraft {
  const priceCents = parseCents(form.price);
  if (priceCents === null) return { ok: false, error: "Informe um valor do serviço válido." };
  const depositCents = form.depositMode === "fixed" ? parseCents(form.deposit) : 0;
  if (depositCents === null) return { ok: false, error: "Informe um sinal em R$ válido." };
  let bps = 0;
  if (form.depositMode === "percent") {
    try {
      bps = percentToBps(Number(form.depositPercent.trim().replace(",", ".") || "0"));
    } catch (error) {
      return {
        ok: false,
        error: friendlyError(error, "validar o percentual"),
      };
    }
  }
  const effectiveCents = effectiveDepositCents({
    requires_deposit: form.requiresDeposit,
    deposit_mode: form.depositMode,
    deposit_percent_bps: bps,
    price_cents: priceCents,
    deposit_cents: depositCents,
  });
  if (form.requiresDeposit && effectiveCents === 0) {
    return {
      ok: false,
      error: "Informe um valor de sinal maior que R$ 0,00 ou desative a exigência de sinal.",
    };
  }
  return { ok: true, priceCents, depositCents, bps, effectiveCents };
}

// Mesmos tipos/limite do bucket business-logos; a extensão vem do tipo para casar com a política.
function ServicosPage() {
  const { businessId } = useBusiness();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [formSnapshot, setFormSnapshot] = useState<Form>(empty);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const isFormDirty = JSON.stringify(form) !== JSON.stringify(formSnapshot);
  const [serviceToRemove, setServiceToRemove] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"servicos" | "categorias">("servicos");
  const saveServiceFn = useServerFn(saveService);
  const deposit = depositDraft(form);
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const { data: storedPreview } = useQuery({
    queryKey: ["service-image", form.imagePath],
    enabled: open && !!form.imagePath && !localPreview,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(LOGO_BUCKET)
        .createSignedUrl(form.imagePath!, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  const previewUrl = localPreview ?? (form.imagePath ? storedPreview : null) ?? null;

  const resetImageState = () => {
    setLocalPreview(null);
    setImageError(null);
  };

  const servicesQuery = useQuery({
    queryKey: ["services", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("business_id", businessId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const linksQuery = useQuery({
    queryKey: ["service-links", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_professionals")
        .select("service_id,professional_id")
        .eq("business_id", businessId!);
      if (error) throw error;
      return data;
    },
  });

  const services = servicesQuery.data;
  const links = linksQuery.data;

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["services", businessId] }),
      qc.invalidateQueries({ queryKey: ["service-links", businessId] }),
    ]);

  const save = useMutation({
    mutationFn: async () => {
      if (!deposit.ok) throw new Error(deposit.error);
      // Sinal, preço e imagem são validados e gravados no servidor (saveService).
      const { id } = await saveServiceFn({
        data: {
          ...(form.id ? { id: form.id } : {}),
          businessId: businessId!,
          name: form.name.trim(),
          durationMinutes: Number(form.duration) || 30,
          priceCents: deposit.priceCents,
          requiresDeposit: form.requiresDeposit,
          depositMode: form.depositMode,
          depositCents: deposit.depositCents,
          depositPercentBps: deposit.bps,
          description: form.description || null,
          isCombo: form.isCombo,
          showPrice: form.showPrice,
          showDuration: form.showDuration,
          showService: form.showService,
          imagePath: form.imagePath,
          availableDays: [...form.availableDays].sort((a, b) => a - b),
        },
      });
      const removed = await supabase.from("service_professionals").delete().eq("service_id", id);
      if (removed.error) throw removed.error;
      if (form.professionalIds.length) {
        const added = await supabase.from("service_professionals").insert(
          form.professionalIds.map((professional_id) => ({
            business_id: businessId!,
            service_id: id,
            professional_id,
          })),
        );
        if (added.error) throw added.error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Serviço atualizado!" : "Serviço cadastrado!");
      setOpen(false);
      setForm(empty);
      setFormSnapshot(empty);
      resetImageState();
      void refresh();
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { data, error } = await supabase
        .from("services")
        .update({ active })
        .eq("id", id)
        .eq("business_id", businessId!)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("O serviço não foi encontrado para atualizar.");
    },
    onSuccess: () => void refresh(),
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Serviço removido.");
      void refresh();
    },
  });

  const edit = (s: NonNullable<typeof services>[number]) => {
    if (!links) {
      toast.error("Não foi possível carregar os vínculos do serviço. Tente novamente.");
      return;
    }
    // T034: deposit_mode/deposit_percent_bps ainda não estão no types.ts gerado; antes
    // da migration service_deposit_percent o serviço é tratado como valor fixo.
    const depositColumns = s as typeof s &
      Partial<{ deposit_mode: DepositMode; deposit_percent_bps: number }>;
    const next: Form = {
      id: s.id,
      name: s.name,
      duration: String(s.duration_minutes),
      price: money(s.price_cents),
      deposit: money(s.deposit_cents),
      depositMode: depositColumns.deposit_mode === "percent" ? "percent" : "fixed",
      depositPercent: percentText(depositColumns.deposit_percent_bps ?? 0),
      requiresDeposit: s.requires_deposit,
      description: s.description ?? "",
      isCombo: s.is_combo ?? false,
      showPrice: s.show_price ?? true,
      showDuration: s.show_duration ?? true,
      showService: s.show_service ?? true,
      imagePath: s.image_path ?? null,
      professionalIds: (links ?? [])
        .filter((l) => l.service_id === s.id)
        .map((l) => l.professional_id),
      availableDays: [...((s as { available_days?: number[] | null }).available_days ?? [1, 2, 3, 4, 5, 6])],
    };
    setForm(next);
    setFormSnapshot(next);
    resetImageState();
    setOpen(true);
  };

  // O caminho só entra no formulário (e em services.image_path ao salvar) após upload bem-sucedido.
  const upload = async (file?: File) => {
    if (!file || !businessId) return;
    const signature = await validateLogoFile(file, "service");
    if (!signature.valid) {
      setImageError(signature.message);
      return;
    }
    if (!(await decodeBusinessImageFile(file))) {
      setImageError("O arquivo não contém uma imagem válida. Escolha outra imagem.");
      return;
    }
    setImageError(null);
    setUploading(true);
    const path = `${businessId}/services/${crypto.randomUUID()}.${signature.extension}`;
    const { error } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type });
    setUploading(false);
    if (error) {
      setImageError("Não foi possível enviar a imagem. Tente novamente.");
      return;
    }
    setLocalPreview(URL.createObjectURL(file));
    setForm((v) => ({ ...v, imagePath: path }));
  };

  const allWeekDaysOn =
    ALL_WEEK_DAYS.every((d) => form.availableDays.includes(d)) && form.availableDays.length > 0;
  const toggleWeekDay = (d: number) =>
    setForm({
      ...form,
      availableDays: form.availableDays.includes(d)
        ? form.availableDays.filter((x) => x !== d)
        : [...form.availableDays, d].sort((a, b) => a - b),
    });
  const toggleAllWeekDays = (on: boolean) =>
    setForm({ ...form, availableDays: on ? [...ALL_WEEK_DAYS] : [] });

  if (!businessId) return <NoBusiness />;

  return (
    <div>
      <section className="professional-list-panel">
        <div className="professional-segmented-header">
          <button
            type="button"
            className={panelTab === "servicos" ? "is-active" : ""}
            onClick={() => setPanelTab("servicos")}
          >
            Serviços
          </button>
          <button
            type="button"
            className={panelTab === "categorias" ? "is-active" : ""}
            onClick={() => setPanelTab("categorias")}
          >
            Categoria
          </button>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            if (v) {
              setForm(empty);
              setFormSnapshot(empty);
              setOpen(true);
              return;
            }
            if (isFormDirty) {
              setConfirmDiscard(true);
              return;
            }
            setOpen(false);
            setForm(empty);
            resetImageState();
          }}
        >
          {panelTab === "servicos" ? (
            <>
              <div className="relative z-10 border-b border-[#25272c] px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="professional-icon-box !size-9">
                  <Scissors className="size-4" strokeWidth={2} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-[0.98rem] font-semibold text-[#eef0f4]">
                    Serviços cadastrados
                  </h2>
                  <p className="mt-0.5 text-xs text-[#62656e]">
                    Gerencie preços, duração, sinal e profissionais vinculados.
                  </p>
                </div>
              </div>
              <DialogTrigger asChild>
                <Button className="rounded-xl border border-[rgba(51,125,255,0.29)] bg-[rgba(22,119,255,0.09)] text-[#69a2ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_0_18px_rgba(22,119,255,0.08)] hover:border-[rgba(51,125,255,0.5)] hover:bg-[rgba(22,119,255,0.14)] hover:text-[#8fb5ff]">
                  <Plus className="size-4" strokeWidth={2.2} /> Cadastrar serviço
                </Button>
              </DialogTrigger>
            </div>
          </div>
          {servicesQuery.isError ? (
            <p
              role="alert"
              className="m-4 rounded-xl border border-destructive/40 p-6 text-center text-sm"
            >
              Não foi possível carregar os serviços. Atualize a página e tente novamente.
            </p>
          ) : !services?.length ? (
            <div className="p-4">
              <EmptyList text="Nenhum serviço cadastrado." />
            </div>
          ) : (
            <div className="relative z-10 divide-y divide-[#22252b]">
              {services.map((s) => (
                <div key={s.id} className="professional-person-row">
                  <div className="professional-avatar service-avatar-box">
                    <Scissors className="size-4" strokeWidth={1.8} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[#eef0f3]">{s.name}</p>
                      {s.is_combo && <span className="professional-badge">Combo</span>}
                    </div>
                    <p className="mt-1 text-xs text-[#686b74]">
                      {s.duration_minutes} min · {formatPrice(s.price_cents)} ·{" "}
                      {(links ?? []).filter((l) => l.service_id === s.id).length} vínculo(s)
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-[#70737b]">
                    Ativo{" "}
                    <Switch
                      checked={s.active}
                      onCheckedChange={(active) => toggle.mutate({ id: s.id, active })}
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="professional-icon-action"
                    onClick={() => edit(s)}
                    aria-label={`Editar ${s.name}`}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="professional-icon-action hover:!text-red-400"
                    onClick={() => setServiceToRemove(s.id)}
                    aria-label={`Remover ${s.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <ServiceCategories
          businessId={businessId}
          services={(services ?? []).map((s) => ({
            id: s.id,
            name: s.name,
            category_id: s.category_id ?? null,
          }))}
        />
      )}
            <DialogContent className="professional-dialog max-h-[92vh] max-w-2xl overflow-y-auto p-0">
              <DialogHeader className="professional-dialog-header">
                <div className="flex items-start gap-3 text-left">
                  <div className="professional-dialog-icon">
                    <Scissors className="size-[1.05rem]" strokeWidth={1.8} />
                  </div>
                  <DialogTitle className="text-lg font-semibold tracking-[-0.025em] text-[#f1f2f4]">
                    {form.id ? "Editar serviço" : "Cadastrar serviço"}
                  </DialogTitle>
                </div>
              </DialogHeader>
              <Tabs defaultValue="dados" className="px-4 pb-4 sm:px-5 sm:pb-5">
                <TabsList className="professional-tabs grid w-full grid-cols-3">
                  <TabsTrigger value="dados">Dados</TabsTrigger>
                  <TabsTrigger value="vinculos">Vínculos</TabsTrigger>
                  <TabsTrigger value="imagem">Imagem</TabsTrigger>
                </TabsList>

                <TabsContent value="dados" className="professional-form-section space-y-5 pt-5">
                  <div className="space-y-2">
                    <Label className="professional-section-label">Nome do serviço</Label>
                    <Input
                      className="professional-input"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Corte masculino"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field
                      label="Valor (R$)"
                      value={form.price}
                      onChange={(price) => setForm({ ...form, price })}
                    />
                    <Field
                      label="Tempo (min)"
                      value={form.duration}
                      type="number"
                      onChange={(duration) => setForm({ ...form, duration })}
                    />
                    {form.depositMode === "percent" ? (
                      <Field
                        label="Sinal (%)"
                        value={form.depositPercent}
                        onChange={(depositPercent) => setForm({ ...form, depositPercent })}
                      />
                    ) : (
                      <Field
                        label="Sinal (R$)"
                        value={form.deposit}
                        onChange={(value) => setForm({ ...form, deposit: value })}
                      />
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-end sm:gap-4">
                    <div className="space-y-2">
                      <Label className="professional-section-label" htmlFor="deposit-mode">
                        Tipo de sinal
                      </Label>
                      <Select
                        value={form.depositMode}
                        onValueChange={(depositMode) =>
                          setForm({ ...form, depositMode: depositMode as DepositMode })
                        }
                      >
                        <SelectTrigger id="deposit-mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                          <SelectItem value="percent">Percentual (%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p
                      aria-live="polite"
                      className={
                        deposit.ok &&
                        (!form.requiresDeposit ||
                          deposit.effectiveCents === 0 ||
                          deposit.effectiveCents >= MIN_PIX_DEPOSIT_CENTS)
                          ? "text-sm text-muted-foreground"
                          : "text-sm text-destructive"
                      }
                    >
                      {!deposit.ok
                        ? deposit.error
                        : !form.requiresDeposit
                          ? "Sem sinal: a reserva é confirmada sem Pix."
                          : deposit.effectiveCents === 0
                            ? "Sinal efetivo de R$ 0,00: nenhum Pix será gerado e a reserva é confirmada sem pagamento."
                            : deposit.effectiveCents < MIN_PIX_DEPOSIT_CENTS
                              ? `Sinal efetivo de ${formatPrice(deposit.effectiveCents)}: o valor mínimo para pagamento Pix é R$ 5,00. Ajuste o sinal para R$ 0,00 ou para R$ 5,00 ou mais.`
                              : `Sinal cobrado: ${formatPrice(deposit.effectiveCents)}${
                                  form.depositMode === "percent"
                                    ? " (calculado sobre o valor atual)"
                                    : ""
                                }.`}
                    </p>
                  </div>
                  <Toggle
                    label="Exigir sinal"
                    checked={form.requiresDeposit}
                    onChange={(required) => setForm({ ...form, requiresDeposit: required })}
                  />
                  <div className="space-y-2">
                    <Label className="professional-section-label">Descrição</Label>
                    <Textarea
                      className="professional-input service-description-input min-h-28"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>
                  <Toggle
                    label="Este serviço é um combo"
                    checked={form.isCombo}
                    onChange={(isCombo) => setForm({ ...form, isCombo })}
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Toggle
                      label="Mostrar serviço"
                      checked={form.showService}
                      onChange={(showService) => setForm({ ...form, showService })}
                    />
                    <Toggle
                      label="Mostrar valor"
                      checked={form.showPrice}
                      onChange={(showPrice) => setForm({ ...form, showPrice })}
                    />
                    <Toggle
                      label="Mostrar duração"
                      checked={form.showDuration}
                      onChange={(showDuration) => setForm({ ...form, showDuration })}
                    />
                  </div>
                  {!form.showService && (
                    <p className="text-sm text-amber-400">
                      Serviço oculto não aparece no link de agendamento.
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="vinculos" className="professional-form-section space-y-3 pt-5">
                  <div className="pt-2">
                    <div className="flex items-center justify-between gap-3 py-2">
                      <span className="text-sm font-semibold">Todos</span>
                      <Switch checked={allWeekDaysOn} onCheckedChange={toggleAllWeekDays} />
                    </div>
                    <div className="overflow-hidden rounded-lg border border-border">
                      <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>Dias da semana</span>
                        <span>Vínculo</span>
                      </div>
                      {ALL_WEEK_DAYS.map((d) => (
                        <label
                          key={d}
                          className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-3 border-b border-border/50 px-3 py-2.5 text-sm last:border-0 hover:bg-white/[0.02]"
                        >
                          <span>{WEEK_DAY_LABELS[d] ?? `Dia ${d}`}</span>
                          <Switch
                            checked={form.availableDays.includes(d)}
                            onCheckedChange={() => toggleWeekDay(d)}
                          />
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Dias desligados não oferecem horários para este serviço.
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="imagem" className="professional-form-section space-y-3 pt-5">
                  <label className="service-image-dropzone text-center focus-within:ring-2 focus-within:ring-ring">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Prévia da imagem do serviço"
                        className="mb-3 max-h-40 rounded-md object-contain"
                      />
                    ) : (
                      <ImagePlus className="mb-3 size-8 text-primary" />
                    )}
                    <span className="font-semibold">
                      {uploading
                        ? "Enviando imagem..."
                        : form.imagePath
                          ? "Trocar imagem do serviço"
                          : "Adicionar imagem do serviço"}
                    </span>
                    <span id="service-image-hint" className="mt-1 text-xs text-muted-foreground">
                      PNG, JPEG ou WebP, até 5 MB. Ela aparece somente nos detalhes do serviço.
                    </span>
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploading}
                      aria-describedby={
                        imageError ? "service-image-hint service-image-error" : "service-image-hint"
                      }
                      aria-invalid={!!imageError}
                      onChange={(e) => {
                        void upload(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {imageError && (
                    <p id="service-image-error" role="alert" className="text-sm text-destructive">
                      {imageError}
                    </p>
                  )}
                </TabsContent>
              </Tabs>
              <DialogFooter className="professional-dialog-footer">
                <Button
                  className="professional-primary-button"
                  onClick={() => save.mutate()}
                  disabled={!form.name.trim() || !deposit.ok || save.isPending || uploading}
                >
                  {uploading ? "Enviando..." : "Salvar serviço"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
      </section>
      <AlertDialog
        open={serviceToRemove !== null}
        onOpenChange={(open) => !open && setServiceToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              O serviço será removido e deixará de aparecer para novos agendamentos. Essa ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (serviceToRemove)
                  remove.mutate(serviceToRemove, { onSettled: () => setServiceToRemove(null) });
              }}
              disabled={remove.isPending}
            >
              Excluir serviço
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
                setForm(empty);
                resetImageState();
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

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="professional-section-label">{label}</Label>
      <Input
        className="professional-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="professional-choice-row justify-between text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
