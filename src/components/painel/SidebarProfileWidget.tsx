import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getLedgerStatement } from "@/lib/ledger.functions";
import { LOGO_ACCEPT } from "@/lib/logo";
import {
  panelAvatarPathFromMetadata,
  panelAvatarTrimmedFromMetadata,
  repairPanelAvatarOnce,
  uploadPanelAvatar,
  usePanelAvatarUrl,
} from "@/lib/panel-avatar";

const SIGNAL_MENU_ID = "sidebar-signal-history";
const WHATSAPP_MASK = "url('/sidebar-whatsapp-mask.png')";

type NetworkSelection = "whatsapp" | "off";
type PaySelection = "agpay" | "off";

export type SidebarProfileWidgetProps = {
  businessId: string | null;
  name: string;
  initial: string;
  role: string;
  statusLabel: string;
  profileOpen: boolean;
  onProfileClick: () => void;
  onLogout: () => void;
};

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isSameLocalDay(isoDate: string, reference: Date) {
  const date = new Date(isoDate);
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

/**
 * Perfil da sidebar — card com avatar/nome/sair, status da conta e as linhas de canais
 * (WhatsApp/OFF) e Ag Pay com o histórico de sinais recebidos hoje (ledger).
 */
export function SidebarProfileWidget({
  businessId,
  name,
  initial,
  role,
  statusLabel,
  profileOpen,
  onProfileClick,
  onLogout,
}: SidebarProfileWidgetProps) {
  const [network, setNetwork] = useState<NetworkSelection>("whatsapp");
  const [pay, setPay] = useState<PaySelection>("agpay");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [repairForgiven, setRepairForgiven] = useState(false);
  const navigate = useNavigate();
  const noticeTimer = useRef<number | null>(null);
  const payRowRef = useRef<HTMLDivElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const { user } = useAuth();
  const avatarPath = panelAvatarPathFromMetadata(user);
  const avatarTrimmed = panelAvatarTrimmedFromMetadata(user);
  const { data: avatarUrl } = usePanelAvatarUrl(avatarPath);
  // Enquanto o arquivo antigo ainda não foi corrigido (e o fallback não venceu),
  // exibe a inicial padrão em vez da foto com as bordas serrilhadas.
  const needsRepair = !avatarTrimmed && !!avatarPath;
  const showPhoto = !!avatarUrl && (repairForgiven || !needsRepair);

  const getLedgerStatementFn = useServerFn(getLedgerStatement);
  const { data: statement, isFetching } = useQuery({
    queryKey: ["sidebar-signals", businessId],
    enabled: historyOpen && !!businessId,
    queryFn: () => getLedgerStatementFn({ data: { businessId: businessId! } }),
  });

  const signals = useMemo(() => {
    const reference = new Date();
    return (statement?.entries ?? []).filter(
      (entry) => entry.type === "payment_credit" && isSameLocalDay(entry.date, reference),
    );
  }, [statement]);

  function announce(message: string) {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2200);
  }

  function openAvatarPicker() {
    if (!businessId) {
      announce("Selecione um estabelecimento para alterar a foto.");
      return;
    }
    avatarInputRef.current?.click();
  }

  async function handleAvatarFile(file: File | undefined) {
    if (!file) return;
    if (!businessId) {
      announce("Selecione um estabelecimento para alterar a foto.");
      return;
    }
    setAvatarBusy(true);
    try {
      await uploadPanelAvatar({ businessId, file, previousPath: avatarPath });
      announce("Foto de perfil atualizada.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "Não foi possível alterar a foto.");
    } finally {
      setAvatarBusy(false);
    }
  }

  useEffect(
    () => () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  // Correção única da foto antiga (bordas brancas gravadas no arquivo). Enquanto
  // ela não estiver corrigida, o avatar mostra a inicial padrão em vez de exibir
  // a foto com o serrilhado. Roda na hora, em background; se falhar nesta sessão,
  // volta a mostrar a foto como está após alguns segundos (fallback) e tenta de
  // novo na próxima abertura — nunca em loop, e nunca com processamento na
  // exibição depois que o arquivo é corrigido.
  useEffect(() => {
    if (!businessId || !avatarPath || avatarTrimmed) return;
    void repairPanelAvatarOnce({ businessId, path: avatarPath, alreadyTrimmed: avatarTrimmed });
    const forgiveness = window.setTimeout(() => setRepairForgiven(true), 8000);
    return () => window.clearTimeout(forgiveness);
  }, [businessId, avatarPath, avatarTrimmed]);

  useEffect(() => {
    if (!historyOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (payRowRef.current && !payRowRef.current.contains(event.target as Node)) {
        setHistoryOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setHistoryOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [historyOpen]);

  return (
    <>
      <div className="sbp-card">
        <div className="sbp-profile">
          <span className="sbp-avatar-wrap">
            <button
              type="button"
              className={`sbp-avatar${avatarBusy ? " is-busy" : ""}${showPhoto ? " has-photo" : ""}`}
              onClick={openAvatarPicker}
              aria-label={avatarUrl ? "Alterar foto de perfil" : "Adicionar foto de perfil"}
              aria-busy={avatarBusy}
              title="Alterar foto"
            >
              {showPhoto ? (
                <img className="sbp-avatar-img" src={avatarUrl} alt="" />
              ) : (
                <span className="sbp-avatar-initial">{initial}</span>
              )}
            </button>
            {!avatarUrl && (
              <span className="sbp-avatar-badge" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none">
                  <path
                    d="M5.2 4.2 6 3h4l.8 1.2H13a1.4 1.4 0 0 1 1.4 1.4v5.1A1.4 1.4 0 0 1 13 12.1H3A1.4 1.4 0 0 1 1.6 10.7V5.6A1.4 1.4 0 0 1 3 4.2h2.2Z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                  <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </span>
            )}
          </span>
          <input
            ref={avatarInputRef}
            type="file"
            accept={LOGO_ACCEPT}
            style={{ display: "none" }}
            aria-label="Selecionar foto do perfil"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void handleAvatarFile(file);
            }}
          />
          <div className="sbp-profile-copy">
            <div className="sbp-profile-topline">
              <button
                type="button"
                className="sbp-profile-name"
                onClick={onProfileClick}
                aria-haspopup="dialog"
                aria-expanded={profileOpen}
                title={name}
              >
                {name}
              </button>
              <button
                type="button"
                className="sbp-logout"
                onClick={onLogout}
                aria-label="Sair da conta"
                title="Sair"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M10 17l5-5-5-5M15 12H3m9-8h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            <div className="sbp-profile-subline">
              <span className="sbp-role">{role}</span>
              <span className={`sbp-status${statusLabel === "Ativo" ? " is-active" : ""}`}>
                {statusLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="sbp-social-row" role="group" aria-label="Redes sociais">
          <button
            type="button"
            className={`sbp-social-button sbp-whatsapp${network === "whatsapp" ? " is-active" : ""}`}
            aria-label="WhatsApp"
            aria-pressed={network === "whatsapp"}
            onClick={() => {
              setNetwork("whatsapp");
              void navigate({ to: "/painel/integracoes" });
            }}
          >
            <span
              className="sbp-whatsapp-icon"
              aria-hidden="true"
              style={{ "--sbp-whatsapp-mask": WHATSAPP_MASK } as CSSProperties}
            />
            <span className="sbp-plat-nome">WhatsApp</span>
          </button>
          <button
            type="button"
            className={`sbp-social-button sbp-off${network === "off" ? " is-active" : ""}`}
            aria-label="Selecionar OFF"
            aria-pressed={network === "off"}
            onClick={() => {
              setNetwork("off");
              announce("Selecionado: OFF.");
            }}
          >
            <span className="sbp-plat-nome">OFF</span>
          </button>
        </div>

        <div
          className="sbp-social-row sbp-agpay-row"
          role="group"
          aria-label="AGPAY"
          ref={payRowRef}
        >
          <button
            type="button"
            className={`sbp-social-button sbp-agpay-button${pay === "agpay" ? " is-active" : ""}`}
            aria-label="Ag Pay"
            aria-pressed={pay === "agpay"}
            onClick={() => {
              setPay("agpay");
              announce("Selecionado: Ag Pay.");
            }}
          >
            <span className="sbp-agpay-brand-lockup">
              <img className="sbp-agpay-brand-icon" src="/sidebar-agpay-icon.png" alt="" />
              <span className="sbp-agpay-name">
                <span className="sbp-agpay-title">Ag Pay</span>
              </span>
            </span>
          </button>
          <button
            type="button"
            className="sbp-signal-history-toggle"
            aria-label="Ver sinais recebidos hoje"
            aria-expanded={historyOpen}
            aria-controls={SIGNAL_MENU_ID}
            onClick={() => setHistoryOpen((value) => !value)}
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="m3 6 5 5 5-5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div
            className="sbp-signal-history-menu"
            id={SIGNAL_MENU_ID}
            role="region"
            aria-label="Sinais recebidos hoje"
            hidden={!historyOpen}
          >
            <div className="sbp-signal-history-heading">
              <span>Sinais recebidos hoje</span>
              <span className="sbp-signal-history-count">{signals.length}</span>
            </div>
            <div className="sbp-signal-history-list">
              {signals.length === 0 ? (
                <div className="sbp-signal-history-empty">
                  {isFetching ? "Carregando sinais…" : "Nenhum sinal recebido hoje."}
                </div>
              ) : (
                signals.map((signal) => (
                  <div className="sbp-signal-history-item" key={signal.id}>
                    <div>
                      <div className="sbp-signal-history-client">
                        {signal.description || "Cliente"}
                      </div>
                      <div className="sbp-signal-history-meta">
                        Pago às{" "}
                        {new Date(signal.date).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <span className="sbp-signal-history-amount">
                      {formatBRL(signal.amountCents)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <button
            type="button"
            className={`sbp-social-button sbp-off${pay === "off" ? " is-active" : ""}`}
            aria-label="Selecionar OFF"
            aria-pressed={pay === "off"}
            onClick={() => {
              setPay("off");
              announce("Selecionado: OFF.");
            }}
          >
            <span className="sbp-plat-nome">OFF</span>
          </button>
        </div>
      </div>
      <div className={`sbp-notice${notice ? " is-visible" : ""}`} role="status" aria-live="polite">
        {notice}
      </div>
    </>
  );
}
