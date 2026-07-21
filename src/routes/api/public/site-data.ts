import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export const Route = createFileRoute("/api/public/site-data")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS_HEADERS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const siteId = url.searchParams.get("site_id");
        if (!siteId) {
          return new Response(
            JSON.stringify({ error: "site_id manquant" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS },
            },
          );
        }
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data, error } = await supabaseAdmin
          .from("sites")
          .select("site_data")
          .eq("id", siteId)
          .maybeSingle();
        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            {
              status: 500,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS },
            },
          );
        }
        if (!data) {
          return new Response(
            JSON.stringify({ error: "Site introuvable" }),
            {
              status: 404,
              headers: { "Content-Type": "application/json", ...CORS_HEADERS },
            },
          );
        }
        return new Response(JSON.stringify(data.site_data ?? {}), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      },
    },
  },
});
