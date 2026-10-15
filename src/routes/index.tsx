import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agenda Agora — sistema de agendamento para comércios" },
      {
        name: "description",
        content:
          "Painel de agendamentos para barbearias, salões, consultórios e clínicas. Agenda, serviços, profissionais e clientes em um só lugar.",
      },
      { property: "og:title", content: "Agenda Agora" },
      { property: "og:description", content: "Painel de agendamentos para o seu negócio." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/auth" });
  },
});
