"use client";

import { useEffect, useState, useCallback } from "react";
import { api, AgentConfig, AgentRun, AgentRunDetail } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/skeleton-loader";
import { useToast } from "@/components/toast";
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  TrendingUp,
  AlertTriangle,
  Info,
  ChevronRight,
  ArrowLeft,
  Shield,
  Activity,
  Sparkles,
  BrainCircuit,
  RefreshCw,
  MessageSquare,
  Eye,
  ChevronDown,
  Settings2,
} from "lucide-react";

// ── Agent personas ──────────────────────────────────────────────────

const PERSONAS: Record<string, {
  icon: typeof TrendingUp;
  gradient: string;
  name: string;
  role: string;
  avatar: string;
  greeting: string;
  emptyState: string;
  capabilities: string[];
}> = {
  price_monitor: {
    icon: TrendingUp,
    gradient: "from-blue-500 to-cyan-500",
    name: "Monitor de Precios",
    role: "Analista de costos",
    avatar: "📊",
    greeting: "Estoy revisando los precios de tus facturas para detectar alzas inusuales y encontrar mejores opciones.",
    emptyState: "Aún no he analizado ninguna factura. Ejecuta un análisis o sube una factura para que empiece a trabajar.",
    capabilities: ["Detecta alzas de precios", "Busca proveedores más baratos", "Alerta cambios críticos"],
  },
  supplier_eval: {
    icon: Shield,
    gradient: "from-purple-500 to-pink-500",
    name: "Evaluador de Proveedores",
    role: "Auditor de proveedores",
    avatar: "🏪",
    greeting: "Evalúo a cada proveedor por precio, consistencia y cumplimiento de acuerdos para que sepas en quién confiar.",
    emptyState: "Necesito más facturas para evaluar a tus proveedores. Sube facturas para que empiece a generar reportes.",
    capabilities: ["Puntúa proveedores de 0-100", "Detecta incumplimientos", "Identifica los mejores y peores"],
  },
};

const SEVERITY: Record<string, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  critical: { icon: XCircle, color: "text-red-600 dark:text-red-400", bg: "border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10" },
  warning: { icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", bg: "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10" },
  info: { icon: Info, color: "text-blue-600 dark:text-blue-400", bg: "border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10" },
};

// ── Main ────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, AgentRun[]>>({});
  const [detail, setDetail] = useState<{ agent: AgentConfig; run: AgentRunDetail } | null>(null);
  const [showSettings, setShowSettings] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchAgents = useCallback(async () => {
    try {
      await api.post("/agents/setup", {});
      const data = await api.get<AgentConfig[]>("/agents");
      setAgents(data);
      for (const a of data) {
        api.get<AgentRun[]>(`/agents/${a.id}/runs?limit=5`).then((r) => setRuns((p) => ({ ...p, [a.id]: r }))).catch(() => {});
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleTrigger = async (agent: AgentConfig) => {
    setTriggering(agent.id);
    try {
      await api.post(`/agents/${agent.id}/trigger`, {});
      toast("success", "Análisis completado");
      await fetchAgents();
    } catch (err: any) {
      toast("error", err.message || "Error al ejecutar");
    } finally { setTriggering(null); }
  };

  const handleToggle = async (agent: AgentConfig) => {
    try {
      await api.put(`/agents/${agent.id}`, { is_enabled: !agent.is_enabled });
      setAgents((p) => p.map((a) => (a.id === agent.id ? { ...a, is_enabled: !a.is_enabled } : a)));
      toast("success", agent.is_enabled ? "Agente pausado" : "Agente activado");
    } catch { toast("error", "Error al actualizar"); }
  };

  const handleSetting = async (agent: AgentConfig, key: string, value: number) => {
    const newConfig = { ...agent.config, [key]: value };
    try {
      await api.put(`/agents/${agent.id}`, { config: newConfig });
      setAgents((p) => p.map((a) => (a.id === agent.id ? { ...a, config: newConfig } : a)));
    } catch {}
  };

  const openRun = async (agent: AgentConfig, runId: string) => {
    try {
      const run = await api.get<AgentRunDetail>(`/agents/${agent.id}/runs/${runId}`);
      setDetail({ agent, run });
    } catch {}
  };

  // ── Run detail ───────────────────────────────────────────────────

  if (detail) {
    const { agent, run } = detail;
    const persona = PERSONAS[agent.agent_type] || PERSONAS.price_monitor;

    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>

        {/* Agent message header */}
        <div className="flex gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${persona.gradient} text-lg shrink-0 shadow-md`}>
            {persona.avatar}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">{persona.name}</span>
              <span className="text-xs text-muted-foreground">{formatDate(run.started_at)}</span>
            </div>
            {run.findings_summary ? (
              <div className="mt-2 rounded-2xl rounded-tl-sm bg-muted/50 border border-border/50 p-4">
                <p className="text-sm leading-relaxed whitespace-pre-line">{run.findings_summary}</p>
              </div>
            ) : (
              <div className="mt-2 rounded-2xl rounded-tl-sm bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">Todo bien, no encontré problemas.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Findings */}
        {run.findings.length > 0 && (
          <div className="pl-[52px] space-y-3">
            {run.findings.map((f) => {
              const sv = SEVERITY[f.severity] || SEVERITY.info;
              const FI = sv.icon;
              const alts = f.data?.alternatives as Array<{ name: string; avg_price: number }> | undefined;
              return (
                <div key={f.id} className={`rounded-2xl border p-4 ${sv.bg}`}>
                  <div className="flex gap-2.5">
                    <FI className={`h-4 w-4 mt-0.5 shrink-0 ${sv.color}`} />
                    <div>
                      <p className="text-sm font-semibold">{f.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">{f.description}</p>
                      {alts && alts.length > 0 && (
                        <p className="text-xs mt-1.5">
                          <span className="font-semibold text-green-700 dark:text-green-400">💡 Alternativa: </span>
                          {alts.map((a, i) => (
                            <span key={i} className="text-muted-foreground">{a.name} (${a.avg_price?.toLocaleString("es-CO")}){i < alts.length - 1 ? ", " : ""}</span>
                          ))}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Stats */}
        <div className="pl-[52px] flex gap-2 text-xs text-muted-foreground">
          <span>{run.findings_count} hallazgos</span>
          <span>·</span>
          <span>{run.actions_count} acciones realizadas</span>
        </div>
      </div>
    );
  }

  // ── Main: AI Agents Feed ─────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl gradient-brand shadow-xl mx-auto mb-4">
          <BrainCircuit className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold">Tu equipo de IA</h1>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
          Estos agentes trabajan en segundo plano analizando cada factura que subes. Te avisan cuando algo necesita tu atención.
        </p>
      </div>

      {loading ? <TableSkeleton rows={2} /> : (
        <div className="space-y-6">
          {agents.map((agent) => {
            const persona = PERSONAS[agent.agent_type] || PERSONAS.price_monitor;
            const agentRuns = runs[agent.id] || [];
            const lastRun = agentRuns[0];
            const isTriggering = triggering === agent.id;
            const isSettingsOpen = showSettings === agent.id;

            return (
              <div key={agent.id} className={`rounded-3xl border bg-card overflow-hidden transition-opacity ${!agent.is_enabled ? "opacity-50" : ""}`}>

                {/* Agent identity */}
                <div className="p-5 pb-4">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${persona.gradient} text-xl shrink-0 shadow-lg`}>
                      {persona.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-bold">{persona.name}</h2>
                        {agent.is_enabled && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-500/15 px-1.5 py-0.5 rounded-full">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" /> Activo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{persona.role}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setShowSettings(isSettingsOpen ? null : agent.id)}
                        className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
                        title="Configuración"
                      >
                        <Settings2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Greeting / what it does */}
                  <div className="mt-3 rounded-2xl rounded-tl-sm bg-muted/40 border border-border/50 p-3.5">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      <MessageSquare className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5 opacity-50" />
                      {persona.greeting}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {persona.capabilities.map((cap, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-background border border-border/60 rounded-full px-2.5 py-1 text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3 text-primary" />
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Action button */}
                  <div className="flex items-center gap-3 mt-4">
                    <Button
                      onClick={() => handleTrigger(agent)}
                      disabled={isTriggering || !agent.is_enabled}
                      size="sm"
                      className="gradient-brand border-0 text-white shadow-md rounded-xl"
                    >
                      {isTriggering ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          Analizando...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                          Analizar ahora
                        </>
                      )}
                    </Button>
                    {!agent.is_enabled && (
                      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => handleToggle(agent)}>
                        Activar agente
                      </Button>
                    )}
                  </div>
                </div>

                {/* Collapsible settings */}
                {isSettingsOpen && (
                  <div className="border-t bg-muted/20 p-5 animate-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Configuración</h4>
                      <button
                        onClick={() => handleToggle(agent)}
                        className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${agent.is_enabled ? "bg-green-500" : "bg-muted-foreground/20"}`}
                      >
                        <span className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                          style={{ transform: `translateX(${agent.is_enabled ? "18px" : "3px"})` }}
                        />
                      </button>
                    </div>
                    {(PERSONAS[agent.agent_type]?.name ? [
                      ...(agent.agent_type === "price_monitor" ? [
                        { key: "threshold_pct", label: "Alertar si el precio sube más de", unit: "%", default: 5, min: 1, max: 50 },
                        { key: "lookback_days", label: "Comparar con los últimos", unit: "días", default: 30, min: 7, max: 180 },
                      ] : [
                        { key: "lookback_days", label: "Evaluar los últimos", unit: "días", default: 60, min: 7, max: 365 },
                        { key: "min_invoices", label: "Mín. facturas para evaluar", unit: "facturas", default: 2, min: 1, max: 20 },
                      ]),
                    ] : []).map((s) => {
                      const value = agent.config?.[s.key] ?? s.default;
                      return (
                        <div key={s.key} className="mb-3 last:mb-0">
                          <div className="flex justify-between mb-1">
                            <span className="text-xs">{s.label}</span>
                            <span className="text-xs font-bold font-mono">{value} {s.unit}</span>
                          </div>
                          <input type="range" min={s.min} max={s.max} value={value}
                            onChange={(e) => handleSetting(agent, s.key, Number(e.target.value))}
                            className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer accent-primary"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Latest findings (the AI's output) */}
                {agentRuns.length > 0 ? (
                  <div className="border-t">
                    <button
                      className="w-full flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted/30 transition-colors"
                      onClick={() => {
                        const r = agentRuns[0];
                        if (r) openRun(agent, r.id);
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Último análisis
                      {lastRun && lastRun.findings_count > 0 && (
                        <Badge variant="destructive" className="text-[10px] h-4 px-1.5 ml-1">{lastRun.findings_count}</Badge>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                    </button>

                    {/* Quick preview of last run */}
                    {lastRun?.findings_summary && (
                      <div className="px-5 pb-4 -mt-1">
                        <div className="rounded-xl bg-muted/30 border border-border/40 p-3">
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            <Sparkles className="h-3 w-3 inline mr-1 text-primary" />
                            {lastRun.findings_summary}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                            <span>{formatDate(lastRun.started_at)}</span>
                            {lastRun.findings_count > 0 && <span>· {lastRun.findings_count} hallazgos</span>}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Previous runs */}
                    {agentRuns.length > 1 && (
                      <div className="border-t">
                        {agentRuns.slice(1, 4).map((run) => (
                          <div
                            key={run.id}
                            onClick={() => openRun(agent, run.id)}
                            className="flex items-center gap-2.5 px-5 py-2 hover:bg-muted/30 cursor-pointer transition-colors text-xs text-muted-foreground border-t border-border/30 first:border-t-0"
                          >
                            {run.status === "completed" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                            )}
                            <span className="flex-1 truncate">{run.findings_summary || (run.status === "completed" ? "Sin hallazgos" : "Error")}</span>
                            <span className="shrink-0">{formatDate(run.started_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="border-t px-5 py-4">
                    <p className="text-xs text-muted-foreground text-center">{persona.emptyState}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
