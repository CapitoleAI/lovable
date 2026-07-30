import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";
import { vfsFileSchema } from "./vfs";
import { commitVfsTree } from "./github-vfs.server";

type AuthSession = { authenticated?: boolean; email?: string };

const commitVfsInputSchema = z.object({
  owner: z.string().trim().min(1).max(120),
  repo: z.string().trim().min(1).max(120),
  branch: z.string().trim().min(1).max(120).default("main"),
  message: z.string().trim().min(1).max(500).default("chore: sync generated app"),
  files: z.array(vfsFileSchema).min(1).max(400),
});

/**
 * Commit multi-fichiers du VFS sur GitHub (API Git Tree).
 * Préparé pour le mode « Application Web » — pas encore appelé depuis l'UI.
 */
export const commitAppVfs = createServerFn({ method: "POST" })
  .inputValidator((input) => commitVfsInputSchema.parse(input))
  .handler(async ({ data }) => {
    const password = process.env.SESSION_SECRET;
    if (!password) throw new Error("SESSION_SECRET is not set");
    const session = await useSession<AuthSession>({
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
    });
    if (!session.data.authenticated) throw new Error("Not authenticated");

    return commitVfsTree(data);
  });
