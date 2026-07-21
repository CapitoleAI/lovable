import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";

import { createHash, timingSafeEqual } from "node:crypto";

type AuthSession = { authenticated?: boolean; email?: string };

function getSessionConfig() {
  const password = process.env.SESSION_SECRET;
  if (!password) throw new Error("SESSION_SECRET is not set");
  return {
    password,
    name: "auth-session",
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none" as const,
      path: "/",
      partitioned: true,
    },
  };
}

function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const expectedEmail = process.env.AUTH_EMAIL;
    const expectedPassword = process.env.AUTH_PASSWORD;
    if (!expectedEmail || !expectedPassword) {
      throw new Error("Auth env vars not configured");
    }
    const emailOk = safeEqual(
      data.email.trim().toLowerCase(),
      expectedEmail.trim().toLowerCase(),
    );
    const passOk = safeEqual(data.password, expectedPassword);
    if (!emailOk || !passOk) {
      return { ok: false as const };
    }
    const session = await useSession<AuthSession>(getSessionConfig());
    await session.update({ authenticated: true, email: expectedEmail });
    return { ok: true as const };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<AuthSession>(getSessionConfig());
  await session.clear();
  return { ok: true as const };
});

export const getAuthStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await useSession<AuthSession>(getSessionConfig());
    return {
      authenticated: Boolean(session.data.authenticated),
      email: session.data.email ?? null,
    };
  },
);

