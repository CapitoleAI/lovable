import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAuthStatus } from "@/lib/auth.functions";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const status = await getAuthStatus();
    throw redirect({ to: status.authenticated ? "/dashboard" : "/login" });
  },
  component: () => null,
});
