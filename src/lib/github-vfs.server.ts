/**
 * Commit multi-fichiers sur GitHub via l'API Git Data (blobs → tree → commit → ref).
 * Utilisé par le mode « Application Web » (VFS) — non branché dans l'UI pour l'instant.
 */
import type { VfsFile } from "./vfs";

const GH = "https://api.github.com";

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN manquant");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "CapitoleAI-VFS",
  } as Record<string, string>;
}

async function gh<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GH}${path}`, { ...init, headers: ghHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status} sur ${path}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export type CommitVfsInput = {
  owner: string;
  repo: string;
  branch: string;
  message: string;
  files: VfsFile[];
};

export type CommitVfsResult = {
  commit_sha: string;
  tree_sha: string;
  branch: string;
  files_count: number;
  html_url: string;
};

/** Envoie toute l'arborescence du VFS en UN SEUL commit propre. */
export async function commitVfsTree(input: CommitVfsInput): Promise<CommitVfsResult> {
  const { owner, repo, branch, message, files } = input;
  if (files.length === 0) throw new Error("VFS vide : rien à committer");

  // 1. Résoudre la branche (fallback sur la branche par défaut si absente)
  let baseCommitSha: string | null = null;
  let baseTreeSha: string | undefined;
  let branchExists = true;
  try {
    const ref = await gh<{ object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    baseCommitSha = ref.object.sha;
  } catch {
    branchExists = false;
    const repoInfo = await gh<{ default_branch: string }>(`/repos/${owner}/${repo}`);
    const ref = await gh<{ object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(repoInfo.default_branch)}`,
    );
    baseCommitSha = ref.object.sha;
  }
  if (baseCommitSha) {
    const baseCommit = await gh<{ tree: { sha: string } }>(
      `/repos/${owner}/${repo}/git/commits/${baseCommitSha}`,
    );
    baseTreeSha = baseCommit.tree.sha;
  }

  // 2. Un blob par fichier
  const blobs: Array<{ path: string; sha: string }> = [];
  for (const file of files) {
    const blob = await gh<{ sha: string }>(`/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
    });
    blobs.push({ path: file.path, sha: blob.sha });
  }

  // 3. Un tree unique
  const tree = await gh<{ sha: string }>(`/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: blobs.map((b) => ({
        path: b.path,
        mode: "100644",
        type: "blob",
        sha: b.sha,
      })),
    }),
  });

  // 4. Un commit
  const commit = await gh<{ sha: string; html_url: string }>(
    `/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: baseCommitSha ? [baseCommitSha] : [],
      }),
    },
  );

  // 5. Mise à jour (ou création) de la ref
  if (branchExists) {
    await gh(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } else {
    await gh(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });
  }

  return {
    commit_sha: commit.sha,
    tree_sha: tree.sha,
    branch,
    files_count: files.length,
    html_url: commit.html_url,
  };
}
