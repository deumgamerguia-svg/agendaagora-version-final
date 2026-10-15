import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, Plus, MailOpen } from "lucide-react";
import { requireMasterAccess } from "@/lib/master.functions";
import {
  createBroadcast,
  deleteBroadcast,
  listBroadcasts,
} from "@/lib/broadcasts.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/painel/notificacoes-alertas")({
  loader: () => (typeof window === "undefined" ? undefined : requireMasterAccess()),
  head: () => ({
    meta: [
      { title: "Notificações e alertas — Painel master" },
      { name: "description", content: "Envie notificações para todos os usuários." },
    ],
  }),
  component: NotificacoesAlertasPage,
});

function NotificacoesAlertasPage() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listBroadcasts);
  const createFn = useServerFn(createBroadcast);
  const deleteFn = useServerFn(deleteBroadcast);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const { data: list = [] } = useQuery({
    queryKey: ["broadcasts"],
    queryFn: () => listFn(),
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: { title: title.trim(), message: message.trim() } }),
    onSuccess: () => {
      toast.success("Notificação enviada para todos os usuários!");
      setOpen(false);
      setTitle("");
      setMessage("");
      void queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Notificação removida.");
      void queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto w-full p-4 sm:p-8">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex size-12 items-center justify-center rounded-xl border border-blue-500/25 bg-blue-500/10 text-blue-400">
          <BellRing className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold uppercase tracking-tight">
            Notificações e Alertas
          </h1>
          <p className="text-sm text-muted-foreground">
            Envie avisos para todos os usuários cadastrados — assinantes ou em teste.
          </p>
        </div>
        <Button
          size="lg"
          className="font-extrabold uppercase tracking-wide"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-4" /> Nova notificação
        </Button>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full table-fixed text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 w-1/4">Título</th>
              <th className="px-4 py-3">Mensagem</th>
              <th className="px-4 py-3 w-28">Status</th>
              <th className="px-4 py-3 w-36">Data de envio</th>
              <th className="px-4 py-3 w-28">Ações</th>
            </tr>
          </thead>
          <tbody>
            {!list.length && (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center">
                  <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-border bg-secondary text-muted-foreground">
                    <MailOpen className="size-5" />
                  </span>
                  <p className="mt-4 text-lg font-extrabold">Nenhuma notificação enviada</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Crie a primeira notificação para comunicar com todos os usuários do sistema.
                  </p>
                  <Button
                    className="mt-5 font-extrabold uppercase tracking-wide"
                    onClick={() => setOpen(true)}
                  >
                    Criar primeira notificação
                  </Button>
                </td>
              </tr>
            )}
            {list.map((b) => (
              <tr key={b.id} className="border-t border-border">
                <td className="px-4 py-3 font-semibold">{b.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{b.message}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-400">
                    Enviada
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(b.createdAt).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-3">
                  <button
                    className="rounded-lg bg-destructive/15 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/25"
                    onClick={() => remove.mutate(b.id)}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova notificação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ntitle">Título</Label>
              <Input
                id="ntitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Atualização importante"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nmsg">Mensagem</Label>
              <Input
                id="nmsg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ex.: Nosso sistema terá manutenção às 02h."
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Esta notificação aparecerá no ícone de sino de todos os usuários (assinantes e em
              teste).
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => create.mutate()}
              disabled={!title.trim() || !message.trim() || create.isPending}
            >
              Enviar para todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
