import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertSuperAdmin } from "@/lib/auth/require-super-admin";

/** Owner envia a chave Pix para aprovação. */
export const submitPixKeyApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        keyType: z.string().min(1),
        key: z.string().min(3),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("pix_key_approvals").insert({
      business_id: data.businessId,
      key_type: data.keyType,
      key: data.key,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Owner lê o status da última solicitação. */
export const getLatestPixKeyApproval = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ businessId: z.string().uuid() }).parse(data ?? {}))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("pix_key_approvals")
      .select("id, key_type, key, status, created_at")
      .eq("business_id", data.businessId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    return rows?.[0] ?? null;
  });

/** Master lista todas as solicitações. */
export const listPixKeyApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await assertSuperAdmin(context);
    const { data, error } = await supabaseAdmin
      .from("pix_key_approvals")
      .select("id, business_id, key_type, key, status, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: businesses } = await supabaseAdmin
      .from("businesses")
      .select("id, name, phone, category, owner_id");
    const names = new Map((businesses ?? []).map((b) => [b.id, b]));
    const { data: owners } = await supabaseAdmin.from("profiles").select("id, full_name");
    const ownerNames = new Map((owners ?? []).map((o) => [o.id, o.full_name]));
    return (data ?? []).map((row) => {
      const b = names.get(row.business_id);
      return {
        id: row.id,
        businessId: row.business_id,
        businessName: b?.name ?? "—",
        businessPhone: b?.phone ?? null,
        ownerName: b?.owner_id ? (ownerNames.get(b.owner_id) ?? null) : null,
        keyType: row.key_type,
        key: row.key,
        status: row.status,
        createdAt: row.created_at,
      };
    });
  });

/** Master aprova ou recusa. */
export const setPixKeyApprovalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["aprovado", "recusado"]),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const supabaseAdmin = await assertSuperAdmin(context);
    const { error } = await supabaseAdmin
      .from("pix_key_approvals")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
