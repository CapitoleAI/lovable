import { z } from "zod";

/** Un fichier du Virtual File System généré pour une application complète. */
export const vfsFileSchema = z.object({
  path: z
    .string()
    .trim()
    .min(1)
    .max(300)
    // pas de chemins absolus ni de traversée
    .refine((p) => !p.startsWith("/") && !p.split("/").includes(".."), {
      message: "Chemin de fichier invalide",
    }),
  content: z.string().max(400_000),
});
export type VfsFile = z.infer<typeof vfsFileSchema>;

export const vfsSchema = z.array(vfsFileSchema).max(400);
export type Vfs = VfsFile[];

export const PROJECT_TYPES = ["astro_site", "full_app"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const APP_STACKS = [
  "react_vite",
  "react_node_express",
  "nextjs",
  "node_api",
] as const;
export type AppStack = (typeof APP_STACKS)[number];

export const APP_STACK_LABELS: Record<AppStack, string> = {
  react_vite: "React + Vite (SPA)",
  react_node_express: "React + Node/Express (fullstack)",
  nextjs: "Next.js (fullstack SSR)",
  node_api: "API Node.js seule",
};

/** État du parcours « Application Web » (Phase 3). */
export type AppCreationSnapshot = {
  step: 1 | 2 | 3;
  name: string;
  brief: string;
  stack: AppStack | null;
  features: string[];
  files: VfsFile[];
  repo_full_name: string;
};

export function emptyAppSnapshot(): AppCreationSnapshot {
  return {
    step: 1,
    name: "",
    brief: "",
    stack: null,
    features: [],
    files: [],
    repo_full_name: "",
  };
}

/** Construit une arborescence à partir d'une liste de chemins plats. */
export type VfsTreeNode = {
  name: string;
  path: string;
  children: VfsTreeNode[];
  isFile: boolean;
};

export function buildVfsTree(files: VfsFile[]): VfsTreeNode[] {
  const roots: VfsTreeNode[] = [];
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let level = roots;
    let acc = "";
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part;
      const isFile = i === parts.length - 1;
      let node = level.find((n) => n.name === part && n.isFile === isFile);
      if (!node) {
        node = { name: part, path: acc, children: [], isFile };
        level.push(node);
      }
      level = node.children;
    });
  }
  const sort = (nodes: VfsTreeNode[]): VfsTreeNode[] => {
    nodes.sort((a, b) =>
      a.isFile === b.isFile ? a.name.localeCompare(b.name) : a.isFile ? 1 : -1,
    );
    nodes.forEach((n) => sort(n.children));
    return nodes;
  };
  return sort(roots);
}
