"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Bot,
  Sparkles,
  Trash2,
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const WELCOME_MESSAGE: Message = {
  role: "assistant",
  content:
    "👋 ¡Hola! Soy **Sabia IA**, tu asistente de compras. Puedo ayudarte a:\n\n" +
    "• 📊 Analizar tu gasto por proveedor\n" +
    "• 📈 Ver historial de precios\n" +
    "• 🔍 Buscar facturas\n" +
    "• ⚖️ Comparar precios entre proveedores\n" +
    "• 🔔 Revisar alertas de precios\n\n" +
    "¿En qué te puedo ayudar?",
};

const QUICK_ACTIONS = [
  { label: "📊 Resumen de gasto", prompt: "¿Cuál es mi resumen de gasto de los últimos 30 días?" },
  { label: "🔝 Top productos", prompt: "¿Cuáles son los productos en los que más gasto?" },
  { label: "🔔 Alertas", prompt: "¿Tengo alertas de precios pendientes?" },
  { label: "📋 Últimas facturas", prompt: "Muéstrame las últimas facturas" },
];

export function AgentChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, loading]);

  // Focus input when chat opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const userMsg: Message = { role: "user", content: text.trim() };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput("");
      setLoading(true);

      try {
        // Only send the conversation (exclude welcome message formatting)
        const conversationForAPI = newMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await api.post<{ reply: string }>("/agent/chat", {
          messages: conversationForAPI,
        });

        setMessages([
          ...newMessages,
          { role: "assistant", content: res.reply },
        ]);
      } catch (err: any) {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content:
              "❌ Error: " + (err.message || "No se pudo conectar con el agente."),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading]
  );

  const handleClearChat = () => {
    setMessages([WELCOME_MESSAGE]);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Render markdown-lite: bold, bullet points
  const renderContent = (text: string) => {
    return text.split("\n").map((line, i) => {
      // Bold
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
          {i < text.split("\n").length - 1 && <br />}
        </span>
      );
    });
  };

  // ── Floating button (closed state) ────────────────────────────

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all z-50 flex items-center justify-center group"
        title="Chat con Sabia IA"
      >
        <MessageCircle className="h-6 w-6 group-hover:hidden" />
        <Sparkles className="h-6 w-6 hidden group-hover:block" />
      </button>
    );
  }

  // ── Chat panel (open state) ───────────────────────────────────

  return (
    <Card className="fixed bottom-6 right-6 w-[420px] h-[600px] flex flex-col shadow-2xl z-50 border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-primary text-primary-foreground">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <span className="font-semibold text-sm">Sabia IA</span>
          <span className="text-xs opacity-75">Agente</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClearChat}
            className="p-1.5 rounded-md hover:bg-primary-foreground/20 transition-colors"
            title="Limpiar chat"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-md hover:bg-primary-foreground/20 transition-colors"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-background"
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              {renderContent(msg.content)}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-muted rounded-lg px-4 py-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Analizando datos...</span>
            </div>
          </div>
        )}

        {/* Quick actions — show only at start */}
        {messages.length === 1 && !loading && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            {QUICK_ACTIONS.map((action, i) => (
              <button
                key={i}
                onClick={() => sendMessage(action.prompt)}
                className="text-left text-xs px-3 py-2.5 rounded-lg border border-border hover:bg-accent hover:border-primary/30 transition-colors"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t bg-background">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex gap-2"
        >
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pregúntame sobre tus facturas..."
            disabled={loading}
            className="flex-1 text-sm"
          />
          <Button
            type="submit"
            size="icon"
            disabled={loading || !input.trim()}
            className="flex-shrink-0"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </Card>
  );
}
