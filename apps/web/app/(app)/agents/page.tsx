"use client";

import { useEffect, useState, useCallback } from "react";
import { api, AgentConfig, AgentRun, AgentRunDetail } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TableSkeleton } from "@/components/skeleton-loader";
import { useToast } from "@/components/toast";
import {
  Bot,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  AlertTriangle,
  Info,
  ChevronRight,
  ArrowLeft,
  Zap,
  Shield,
  Activity,
  Sparkles,
} from "lucide-react";

// ── Agent info ──────────────────────────────────────────────────────

const AGENTS: Record<string, {
  icon: typeof TrendingUp;
  gradient: string;
  emoji: string;
  title: string;
  subtitle: string;
  what: string;
  settings: { key: string; label: string; unit: string; default: number; min: number; max: number; step: number }[];
}> = {
  price_monitor: {
    icon: TrendingUp,
    gradient: "from-blue-500 to-cyan-500",
    emoji: "📈",
    title: "Monitor de Precios",
    subtitle: "Detecta alzas automáticamente",
    what: "Cada vez que subes una factura, este agente compara los precios con el historial y te avisa si algo subió más de lo normal. También busca si otro proveedor lo vende más barato.",
    settings: [
      { key: "threshold_pct", label: "Alertar si el precio sube más de", unit: "%", default: 5, min: 1, max: 50, step: 1 },
      { key: "lookback_days", label: "Comparar con los últimos", unit: "días", default: 30, min: 7, max: 180, step: 1 },
    ],
  },
  supplier_eval: {
    icon: Shield,
    gradient: "from-purple-500 to-pink-500",
    emoji: "🏪",
    title: "Evaluador de Proveedores",
    subtitle: "Califica a tus proveedores",
    what: "Analiza el historial de cada proveedor y les da un puntaje basado en sus precios, consistencia y si cumplen los precios que negociaste. Te avisa cuando un proveedor está fallando.",
    settings: [
      { key: "lookback_days", label: "Evaluar los últimos", unit: "días", default: 60, min: 7, max: 365, step: 1 },
      { key: "min_invoices", label: "Mínimo de facturas para evaluar", unit: "facturas", default: 2, min: 1, max: 20, step: 1 },
    ],
  },
};

const SEVERITY_MAP: Record<string, { icon: typeof AlertTriangle; color: string; bg: string; label: string }> = {
  critical: { icon: XCircle, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30", label: "Crítico" },
  warning: { icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30", label: "Advertencia" },
  info: { icon: Info, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30", label: "Info" },
};

const STATUS_MAP: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  completed: { icon: CheckCircle2, color: "text-green-500", label: "Completado" },
  running: { icon: Loader2, color: "text-blue-500", label: "Ejecutando" },
  failed: { icon: XCircle, color: "text-red-500", label: "Falló" },
};

// ── Main ────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, AgentRun[]>>({});
  const [detail, setDetail] = useState<{ agent: AgentConfig; run: AgentRunDetail } | null>(null);
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
      toast("success", "Análisis completado — revisa los resultados");
      await fetchAgents();
    } catch (err: any) {
      toast("error", err.message || "Error al ejecutar");
    } finally { setTriggering(null); }
  };

  const handleToggle = async (agent: AgentConfig) => {
    try {
      await api.put<AgentConfig>(`/agents/${agent.id}`, { is_enabled: !agent.is_enabled });
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
    const meta = AGENTS[agent.agent_type] || AGENTS.price_monitor;
    const st = STATUS_MAP[run.status] || STATUS_MAP.completed;
    const SI = st.icon;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {meta.title}
        </Button>

        <div className="flex items-center gap-3">
          <SI className={`h-5 w-5 ${st.color} ${run.status === "running" ? "animate-spin" : ""}`} />
          <h2 className="font-bold text-lg">{st.label}</h2>
          <span className="text-sm text-muted-foreground">{formatDate(run.started_at)}</span>
        </div>

        {run.findings_summary && (
          <div className="rounded-2xl bg-gradient-to-r from-primary/5 to-transparent border border-primary/20 p-5">
            <div className="flex gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <p className="text-sm leading-relaxed whitespace-pre-line">{run.findings_summary}</p>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Badge variant="outline">{run.findings_count} hallazgos</Badge>
          <Badge variant="outline">{run.actions_count} acciones</Badge>
        </div>

        {run.findings.length === 0 ? (
          <div className="text-center py-10">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="font-semibold text-lg">Todo en orden</p>
            <p className="text-muted-foreground">No se detectaron problemas.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {run.findings.map((f) => {
              const sv = SEVERITY_MAP[f.severity] || SEVERITY_MAP.info;
              const FI = sv.icon;
              const alts = f.data?.alternatives as Array<{ name: string; avg_price: number }> | undefined;
              return (
                <div key={f.id} className={`rounded-2xl border p-4 ${sv.bg}`}>
                  <div className="flex gap-3">
                    <FI className={`h-5 w-5 mt-0.5 shrink-0 ${sv.color}`} />
                    <div>
                      <p className="font-semibold text-sm">{f.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">{f.description}</p>
                      {alts && alts.length > 0 && (
                        <div className="mt-2 text-xs">
                          <span className="font-semibold text-green-700 dark:text-green-400">Alternativas: </span>
                          {alts.map((a, i) => (
                            <span key={i} className="text-muted-foreground">{a.name} (${a.avg_price?.toLocaleString("es-CO")}){i < alts.length - 1 ? ", " : ""}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Main view ────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-brand shadow-lg">
            <Bot className="h-5 w-5 text-white" />
          </div>
          Agentes IA
        </h1>
        <p className="text-muted-foreground mt-2">
          Los agentes analizan cada factura automáticamente y te avisan cuando detectan algo importante.
        </p>
      </div>

      {loading ? <TableSkeleton rows={2} /> : (
        <div className="space-y-6">
          {agents.map((agent) => {
            const meta = AGENTS[agent.agent_type] || AGENTS.price_monitor;
            const Icon = meta.icon;
            const agentRuns = runs[agent.id] || [];
            const isTriggering = triggering === agent.id;

            return (
              <div key={agent.id} className={`rounded-3xl border bg-card overflow-hidden transition-all ${!agent.is_enabled ? "opacity-50" : ""}`}>
                {/* Top section */}
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.gradient} shadow-lg shrink-0`}>
                      <Icon className="h-7 w-7 text-white" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="font-bold text-lg">{meta.title}</h2>
                        {agent.is_enabled && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-500/15 px-2 py-0.5 rounded-full">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Activo
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{meta.what}</p>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-3 mt-5">
                    <Button
                      onClick={() => handleTrigger(agent)}
                      disabled={isTriggering}
                      className="gradient-brand border-0 text-white shadow-lg"
                    >
                      {isTriggering ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                      {isTriggering ? "Analizando..." : "Ejecutar ahora"}
                    </Button>
                    <button
                      onClick={() => handleToggle(agent)}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${agent.is_enabled ? "bg-green-500" : "bg-muted-foreground/20"}`}
                    >
                      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${agent.is_enabled ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                    <span className="text-xs text-muted-foreground">{agent.is_enabled ? "Se ejecuta con cada factura" : "Pausado"}</span>
                  </div>
                </div>

                {/* Settings (sliders) */}
                <div className="border-t bg-muted/30 px-6 py-4 space-y-4">
                  {meta.settings.map((s) => {
                    const value = agent.config?.[s.key] ?? s.default;
                    return (
                      <div key={s.key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm">{s.label}</span>
                          <span className="text-sm font-bold font-mono">{value} <span className="text-muted-foreground font-normal">{s.unit}</span></span>
                        </div>
                        <input
                          type="range"
                          min={s.min} max={s.max} step={s.step} value={value}
                          onChange={(e) => handleSetting(agent, s.key, Number(e.target.value))}
                          className="w-full h-2 bg-border rounded-full appearance-none cursor-pointer accent-primary"
                        />
                        <div className="flex justify-between mt-0.5">
                          <span className="text-[10px] text-muted-foreground">{s.min} {s.unit}</span>
                          <span className="text-[10px] text-muted-foreground">{s.max} {s.unit}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Recent runs */}
                {agentRuns.length > 0 && (
                  <div className="border-t">
                    <div className="px-6 py-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Últimos resultados</h4>
                    </div>
                    {agentRuns.slice(0, 3).map((run) => {
                      const rs = STATUS_MAP[run.status] || STATUS_MAP.completed;
                      const RI = rs.icon;
                      return (
                        <div
                          key={run.id}
                          onClick={() => openRun(agent, run.id)}
                          className="flex items-center gap-3 px-6 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors border-t border-border/50"
                        >
                          <RI className={`h-4 w-4 shrink-0 ${rs.color} ${run.status === "running" ? "animate-spin" : ""}`} />
                          <span className="text-sm flex-1 truncate">{run.findings_summary || rs.label}</span>
                          {run.findings_count > 0 && (
                            <Badge variant="secondary" className="text-[10px] h-5">{run.findings_count}</Badge>
                          )}
                          <span className="text-[11px] text-muted-foreground shrink-0">{formatDate(run.started_at)}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-50" />
                        </div>
                      );
                    })}
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
