import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Cog, Loader2, Plus, RotateCcw, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PromptsManager } from "@/components/prompts-manager";
import {
  orchestrateChat,
  type OrchestratorAction,
} from "@/lib/orchestrator.functions";
import type { BrandIdentity, PageContent } from "@/lib/sites-schema";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  versionId?: string;
  hasFileChanges?: boolean;
};

interface Props {
  mode: "edit" | "empty" | "create";
  siteName?: string;
  brand?: Partial<BrandIdentity>;
  pages?: PageContent[];
  creationContext?: unknown;
  onAction: (action: OrchestratorAction) => void | Promise<void>;
  onCreateWizard?: () => void;
  initialMessages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
  onMessageProcessed?: (versionId: string) => void;
  onRevertToVersion?: (versionId: string) => void;
  /** Prompt injected from outside (e.g. "Fix bug"). Change `nonce` to trigger a send. */
  externalPrompt?: { text: string; nonce: number };
  onExternalPromptSent?: () => void;
}

const FILE_ACTION_TYPES = new Set(["write_file", "modify_file", "delete_file"]);

export function WorkspaceChat({
  mode,
  siteName,
  brand,
  pages,
  creationContext,
  onAction,
  onCreateWizard,
  initialMessages,
  onMessagesChange,
  onMessageProcessed,
  onRevertToVersion,
  externalPrompt,
  onExternalPromptSent,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const orchestrate = useServerFn(orchestrateChat);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages(initialMessages ?? []);
    setInput("");
    inputRef.current?.focus();
  }, [mode, siteName]);
  
  // Notify parent when messages change
  useEffect(() => {
    if (onMessagesChange && messages.length > 0) {
      onMessagesChange(messages);
    }
  }, [messages.length]);

  const sentPromptNonce = useRef<number>(0);
  useEffect(() => {
    if (!externalPrompt || externalPrompt.nonce === 0) return;
    if (sentPromptNonce.current === externalPrompt.nonce) return;
    if (busy) return;
    sentPromptNonce.current = externalPrompt.nonce;
    void send(externalPrompt.text).then(() => onExternalPromptSent?.());
  }, [externalPrompt?.nonce, busy]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    if (!override) setInput("");
    const nextHistory: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextHistory);
    setBusy(true);
    try {
      const { reply, actions } = await orchestrate({
        data: {
          mode,
          message: text,
          history: messages,
          site_context:
            mode === "edit"
              ? {
                  name: siteName,
                  brand,
                  pages: (pages ?? []).map((p) => ({ slug: p.slug, seo_title: p.seo_title })),
                }
              : undefined,
          creation_context: mode === "create" ? (creationContext as any) : undefined,
        },
      });

      // Determine if this AI message triggers file changes
      const hasFileChanges = actions.some((a) => FILE_ACTION_TYPES.has(a.type));

      if (hasFileChanges && onMessageProcessed) {
        // First execute actions, then create a version snapshot
        for (const a of actions) {
          if (a.type === "open_create_wizard") {
            onCreateWizard?.();
          } else {
            await onAction(a);
          }
        }
        // Now create the version snapshot AFTER files are modified
        const versionId = crypto.randomUUID();
        onMessageProcessed(versionId);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: reply, versionId, hasFileChanges: true },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
        for (const a of actions) {
          if (a.type === "open_create_wizard") {
            onCreateWizard?.();
          } else {
            await onAction(a);
          }
        }
      }
    } catch (e) {
      toast.error((e as Error).message);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Désolé, une erreur est survenue." },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  const emptyHint =
    mode === "edit"
      ? `Modifier "${siteName ?? ""}" — essayez : « passe la couleur principale en bleu marine » ou « ajoute une page Contact »`
      : mode === "create"
        ? "Décrivez votre projet : nom, thématique, brief créatif. Je vous guide étape par étape."
        : "Bienvenue. Décrivez le site que vous voulez créer, ou cliquez sur « + Nouveau site » à droite.";

  return (
    <div className="flex h-full flex-col bg-[#1D1D1C] text-neutral-100">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#272726] text-neutral-300">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="max-w-xs text-sm text-neutral-400">{emptyHint}</p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i}>
              <div className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-tr-md bg-[#272726] px-3.5 py-2 text-sm text-neutral-100"
                      : "max-w-[85%] text-sm text-neutral-200"
                  }
                >
                  {m.content}
                </div>
              </div>
              {m.role === "assistant" && m.hasFileChanges && m.versionId && (
                <div className="mt-1.5 flex justify-start">
                  <button
                    type="button"
                    onClick={() => onRevertToVersion?.(m.versionId!)}
                    className="inline-flex items-center gap-1 rounded-md border border-[#3a3a38] bg-[#272726] px-2 py-1 text-[11px] text-neutral-400 transition-colors hover:border-[#3B6DF5] hover:text-[#3B6DF5]"
                    title="Restaurer les fichiers à cette version"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restaurer cette version
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Réflexion…
            </div>
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="flex flex-col gap-2 rounded-3xl border border-[#272726] bg-[#272726] p-2 focus-within:border-[#3a3a38]">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Demandez à CapitoleAI…"
            className="min-h-[28px] resize-none border-0 bg-transparent px-2 py-1 text-sm text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-0 focus-visible:ring-offset-0"
            disabled={busy}
          />
          <div className="flex items-center justify-between">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full text-neutral-400 hover:bg-[#3a3a38] hover:text-neutral-100"
              title="Ajouter"
            >
              <Plus className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                className="h-8 gap-1 rounded-full px-2.5 text-sm font-normal text-neutral-100 hover:bg-[#3a3a38]"
                onClick={() => onCreateWizard?.()}
              >
                Créer
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-full text-neutral-400 hover:bg-[#3a3a38] hover:text-neutral-100"
                onClick={() => setPromptsOpen(true)}
                title="Modifier les prompts système"
              >
                <Cog className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                className="h-9 w-9 rounded-full bg-neutral-500 text-white hover:bg-neutral-400 disabled:opacity-50"
                onClick={() => send()}
                disabled={busy || !input.trim()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <PromptsManager open={promptsOpen} onOpenChange={setPromptsOpen} />
    </div>
  );
}