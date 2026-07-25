import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PromptsManager } from "@/components/prompts-manager";
import {
  orchestrateChat,
  type OrchestratorAction,
} from "@/lib/orchestrator.functions";
import type { BrandIdentity, PageContent } from "@/lib/sites-schema";

export type ChatMessage = { role: "user" | "assistant"; content: string };

interface Props {
  mode: "edit" | "empty" | "create";
  siteName?: string;
  brand?: Partial<BrandIdentity>;
  pages?: PageContent[];
  creationContext?: unknown;
  onAction: (action: OrchestratorAction) => void | Promise<void>;
  onCreateWizard?: () => void;
}

export function WorkspaceChat({
  mode,
  siteName,
  brand,
  pages,
  creationContext,
  onAction,
  onCreateWizard,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const orchestrate = useServerFn(orchestrateChat);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }, [mode, siteName]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
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

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      for (const a of actions) {
        if (a.type === "open_create_wizard") {
          onCreateWizard?.();
        } else {
          await onAction(a);
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
        ? "Directeur d'agence à l'écoute. Décrivez votre projet : nom, thème, ville, ambiance…"
        : "Bienvenue. Décrivez le site que vous voulez créer, ou cliquez sur « + Nouveau site » à droite.";

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">{emptyHint}</p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-tr-md bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                    : "max-w-[85%] text-sm text-foreground"
                }
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Réflexion…
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="relative">
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
            placeholder={
              mode === "edit"
                ? "Modifier ce site avec l'IA…"
                : "Poser une question ou décrire un site…"
            }
            className="min-h-[60px] resize-none pr-24"
            disabled={busy}
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setPromptsOpen(true)}
              title="Gérer les prompts système"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-8 w-8"
              onClick={send}
              disabled={busy || !input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <PromptsManager open={promptsOpen} onOpenChange={setPromptsOpen} />
    </div>
  );
}
