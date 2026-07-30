import { forwardRef, useImperativeHandle, useState } from "react";
import { ArrowLeft, Check, FileCode2, Folder, Github, Layers, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  APP_STACKS,
  APP_STACK_LABELS,
  buildVfsTree,
  emptyAppSnapshot,
  type AppCreationSnapshot,
  type AppStack,
  type VfsTreeNode,
} from "@/lib/vfs";

export type AppWizardHandle = {
  updateArchitecture: (input: {
    name?: string;
    brief?: string;
    stack?: AppStack;
    features?: string[];
  }) => void;
  goToStep: (step: 1 | 2 | 3) => void;
};

interface Props {
  onSnapshotChange?: (snap: AppCreationSnapshot) => void;
  onExit?: () => void;
}

const STEP_LABELS = ["Architecture & Stack", "Génération VFS", "Déploiement GitHub"] as const;

function TreeView({ nodes, depth = 0 }: { nodes: VfsTreeNode[]; depth?: number }) {
  return (
    <ul className={depth === 0 ? "space-y-0.5" : "space-y-0.5 border-l border-border pl-3"}>
      {nodes.map((n) => (
        <li key={n.path}>
          <div className="flex items-center gap-1.5 py-0.5 text-xs">
            {n.isFile ? (
              <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className={n.isFile ? "text-foreground" : "font-medium"}>{n.name}</span>
          </div>
          {n.children.length > 0 && <TreeView nodes={n.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

export const AppWizard = forwardRef<AppWizardHandle, Props>(function AppWizard(
  { onSnapshotChange, onExit },
  ref,
) {
  const [snap, setSnap] = useState<AppCreationSnapshot>(() => emptyAppSnapshot());

  function patch(next: Partial<AppCreationSnapshot>) {
    setSnap((prev) => {
      const merged = { ...prev, ...next };
      onSnapshotChange?.(merged);
      return merged;
    });
  }

  useImperativeHandle(ref, () => ({
    updateArchitecture(input) {
      patch({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.brief !== undefined ? { brief: input.brief } : {}),
        ...(input.stack !== undefined ? { stack: input.stack } : {}),
        ...(input.features !== undefined ? { features: input.features } : {}),
      });
    },
    goToStep(step) {
      patch({ step });
    },
  }));

  const tree = buildVfsTree(snap.files);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Stepper */}
      <div className="flex items-center justify-between gap-4 border-b border-border bg-background px-5 py-3">
        <div className="flex items-center gap-3">
          {STEP_LABELS.map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3;
            const active = snap.step === n;
            const done = snap.step > n;
            return (
              <button
                key={label}
                type="button"
                onClick={() => patch({ step: n })}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition ${
                  active
                    ? "bg-[#3B6DF5] text-white"
                    : done
                      ? "text-foreground hover:bg-muted"
                      : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px]">
                  {done ? <Check className="h-2.5 w-2.5" /> : n}
                </span>
                {label}
              </button>
            );
          })}
        </div>
        <Button variant="ghost" size="sm" onClick={() => onExit?.()}>
          <X className="mr-1.5 h-3.5 w-3.5" />
          Quitter
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {snap.step === 1 && (
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="h-4 w-4" /> Architecture &amp; Stack
            </div>
            <p className="text-sm text-muted-foreground">
              Décrivez votre application au chat à gauche. Le Tech Lead IA choisira la stack et
              l'architecture avec vous.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {APP_STACKS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => patch({ stack: s })}
                  className={`rounded-lg border p-3 text-left text-sm transition ${
                    snap.stack === s
                      ? "border-[#3B6DF5] bg-[#3B6DF5]/5"
                      : "border-border hover:border-foreground/30"
                  }`}
                >
                  {APP_STACK_LABELS[s]}
                </button>
              ))}
            </div>
            {snap.features.length > 0 && (
              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-xs font-medium">Fonctionnalités retenues</p>
                <ul className="space-y-1">
                  {snap.features.map((f) => (
                    <li key={f} className="text-xs text-muted-foreground">
                      • {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {snap.step === 2 && (
          <div className="mx-auto max-w-2xl space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileCode2 className="h-4 w-4" /> Génération VFS
            </div>
            {snap.files.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                L'arborescence des fichiers générés apparaîtra ici.
              </div>
            ) : (
              <div className="rounded-lg border border-border p-4">
                <TreeView nodes={tree} />
              </div>
            )}
          </div>
        )}

        {snap.step === 3 && (
          <div className="mx-auto max-w-2xl space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Github className="h-4 w-4" /> Déploiement GitHub avancé
            </div>
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Commit multi-fichiers et déploiement : bientôt disponible.
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border bg-background px-5 py-3">
        <Button
          variant="ghost"
          size="sm"
          disabled={snap.step === 1}
          onClick={() => patch({ step: (snap.step - 1) as 1 | 2 | 3 })}
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Retour
        </Button>
        <Button
          size="sm"
          className="bg-[#3B6DF5] text-white hover:bg-[#3361de]"
          disabled={snap.step === 3}
          onClick={() => patch({ step: (snap.step + 1) as 1 | 2 | 3 })}
        >
          Continuer
        </Button>
      </div>
    </div>
  );
});
