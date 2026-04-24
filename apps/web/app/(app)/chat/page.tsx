"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  Plus,
  ArrowDown,
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  {
    title: "Resumen de gasto",
    description: "de los últimos 30 días",
    prompt: "¿Cuál es mi resumen de gasto de los últimos 30 días?",
  },
  {
    title: "Top productos",
    description: "en los que más gasto",
    prompt: "¿Cuáles son los productos en los que más gasto?",
  },
  {
    title: "Alertas de precios",
    description: "pendientes por revisar",
    prompt: "¿Tengo alertas de precios pendientes?",
  },
  {
    title: "Últimas facturas",
    description: "cargadas recientemente",
    prompt: "Muéstrame las últimas facturas",
  },
  {
    title: "Comparar proveedores",
    description: "precios de un producto",
    prompt: "Compara los precios de mis proveedores para los productos más comunes",
  },
  {
    title: "Reporte mensual",
    description: "compras por proveedor",
    prompt: "Dame un reporte de compras netas por proveedor del año actual",
  },
];

function renderMarkdown(text: string) {
  return text.split("\n").map((line, i, arr) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={j} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={j}>{part}</span>;
    });
    return (
      <span key={i}>
        {parts}
        {i < arr.length - 1 && <br />}
      </span>
    );
  });
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (isAtBottom()) scrollToBottom();
  }, [messages, loading, isAtBottom, scrollToBottom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => setShowScrollBtn(!isAtBottom());
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [isAtBottom]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
    }
  }, [input]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: Message = { role: "user", content: trimmed };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput("");
      setLoading(true);

      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      try {
        const conversationForAPI = newMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await api.post<{ reply: string }>("/agent/chat", {
          messages: conversationForAPI,
        });

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: res.reply },
        ]);
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Error: " + (err.message || "No se pudo conectar con el agente."),
          },
        ]);
      } finally {
        setLoading(false);
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    },
    [messages, loading]
  );

  const handleNewChat = () => {
    setMessages([]);
    setInput("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">Savia AI</h1>
            <p className="text-xs text-muted-foreground">Asistente de compras</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewChat}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva conversación
          </Button>
        )}
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isEmpty ? (
          /* ── Empty state / welcome ──────────────────── */
          <div className="flex flex-col items-center justify-center h-full px-4">
            <div className="max-w-2xl w-full space-y-8">
              <div className="text-center space-y-3">
                <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-2xl font-semibold">¿En qué te puedo ayudar?</h2>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  Soy tu asistente de compras. Pregúntame sobre facturas, gastos,
                  precios, proveedores o alertas.
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s.prompt)}
                    className="text-left p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-accent/50 transition-all group"
                  >
                    <p className="text-sm font-medium group-hover:text-primary transition-colors">
                      {s.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {s.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── Conversation ───────────────────────────── */
          <div className="max-w-3xl mx-auto w-full px-4 py-6 space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className="flex gap-3">
                {/* Avatar */}
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    msg.role === "assistant"
                      ? "bg-primary/10"
                      : "bg-foreground/10"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <Bot className="h-4 w-4 text-primary" />
                  ) : (
                    <User className="h-4 w-4 text-foreground/70" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {msg.role === "assistant" ? "Savia AI" : "Tú"}
                  </p>
                  <div className="text-sm leading-relaxed prose-sm">
                    {renderMarkdown(msg.content)}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading */}
            {loading && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Savia AI
                  </p>
                  <div className="flex items-center gap-2 py-2">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:0ms]" />
                      <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:150ms]" />
                      <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:300ms]" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Analizando...
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-32 left-1/2 -translate-x-1/2 h-8 w-8 rounded-full bg-background border shadow-md flex items-center justify-center hover:bg-accent transition-colors z-10"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}

      {/* Input area */}
      <div className="border-t bg-background px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="relative flex items-end gap-2 rounded-2xl border bg-muted/30 px-4 py-3 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu mensaje..."
              disabled={loading}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 max-h-[200px] py-0.5"
            />
            <Button
              type="submit"
              size="icon"
              disabled={loading || !input.trim()}
              className="h-8 w-8 rounded-lg flex-shrink-0"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Savia AI puede cometer errores. Verifica la información importante.
          </p>
        </div>
      </div>
    </div>
  );
}
