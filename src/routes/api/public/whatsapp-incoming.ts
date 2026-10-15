import { createFileRoute } from "@tanstack/react-router";
import { handleIncomingWhatsapp } from "@/lib/whatsapp-greeting.server";

export const Route = createFileRoute("/api/public/whatsapp-incoming")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret");
        const expected = process.env["WHATSAPP_WEBHOOK_SECRET"]?.trim();
        if (!expected || secret !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        let payload: unknown = null;
        try {
          payload = await request.json();
        } catch {
          return Response.json({ received: false }, { status: 200 });
        }
        try {
          const outcome = await handleIncomingWhatsapp(payload);
          return Response.json({ received: true, ...outcome });
        } catch (error) {
          console.error(
            "Falha ao processar mensagem recebida:",
            error instanceof Error ? error.message : error,
          );
          return Response.json({ received: true });
        }
      },
    },
  },
});
