import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z.object({
  site_id: z.string().uuid(),
  status: z.enum(["generating", "building", "deploying", "deployed", "failed"]),
  deploy_url: z.string().url().optional(),
  build_log_url: z.string().url().optional(),
  error: z.string().max(2000).optional(),
});

export const Route = createFileRoute("/api/public/astro-deploy-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.ASTRO_RUNNER_SECRET;
        if (!secret) return new Response("Not configured", { status: 503 });

        const signature = request.headers.get("x-astro-signature") ?? "";
        const body = await request.text();
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const sig = Buffer.from(signature);
        const exp = Buffer.from(expected);
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let parsed;
        try {
          parsed = payloadSchema.parse(JSON.parse(body));
        } catch (e) {
          return new Response(`Invalid payload: ${(e as Error).message}`, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const update: Record<string, unknown> = { status: parsed.status };
        if (parsed.deploy_url) update.deploy_url = parsed.deploy_url;
        if (parsed.build_log_url) update.build_log_url = parsed.build_log_url;
        if (parsed.error) update.last_error = parsed.error;
        if (parsed.status !== "failed") update.last_error = null;

        const { error } = await supabaseAdmin
          .from("sites")
          .update(update)
          .eq("id", parsed.site_id);
        if (error) return new Response(error.message, { status: 500 });
        return new Response("ok");
      },
    },
  },
});
