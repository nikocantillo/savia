"use client";

import { useEffect, useState, useCallback } from "react";
import { api, AgentConfig, AgentRun, AgentRunDetail } from "@/lib/api";
import { timeAgo, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/skeleton-loader";
import { useToast } from "@/components/toast";
import {
  TrendingUp,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  ChevronDown,
  Loader2,
  Lightbulb,
  Play,
  Sparkles,
} from "lucide-react";

// ── Agent catalog ───────────────────────────────────────────────────

const AGENT_META: Record<string, {
  icon: typeof TrendingUp;
  color: string;
  bg: string;
  description: string;
}> = {
  price_monitor: {
    icon: TrendingUp,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-500/15",
    description: "Detecta alzas de precio y encuentra alternativas más baratas.",
  },
  supplier_eval: {
    icon: Shield,
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-100 dark:bg-purple-500/15",
    description: "Evalúa la calidad y confiabilidad de tus proveedores.",
  },
};

// ── Types ───────────────────────────────────────────────────────────

interface FeedItem {
  runId: string;
  agentId: string;
  agentType: string;
  summary: string;
  findingsCount: number;
  time: string;
}

// ── Component ───────────────────────────────────────────────────────

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runDetails, setRunDetails] = useState<Record<string, AgentRunDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const { toast } = useToast();

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      await api.post("/agents/setup", {});
      const agentList = await api.get<AgentConfig[]>("/agents");
      setAgents(agentList);

      const runsPerAgent = await Promise.all(
        agentList.map((a) =>
          api.get<AgentRun[]>(`/agents/${a.id}/runs?limit=5`).catch(() => [] as AgentRun[])
        )
      );

      const items: FeedItem[] = [];
      for (let i = 0; i < agentList.length; i++) {
        const agent = agentList[i];
        for (const run of runsPerAgent[i]) {
          if (run.status !== "completed" || run.findings_count === 0) continue;
          items.push({
            runId: run.id,
            agentId: agent.id,
            agentType: agent.agent_type,
            summary: run.findings_summary || `${run.findings_count} hallazgo${run.findings_count > 1 ? "s" : ""}`,
            findingsCount: run.findings_count,
            time: run.started_at,
          });
        }
      }
      items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setFeed(items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Agent actions ────────────────────────────────────────────────

  const handleToggle = async (agent: AgentConfig) => {
    setToggling(agent.id);
    try {
      await api.put(`/agents/${agent.id}`, { is_enabled: !agent.is_enabled });
      setAgents((prev) =>
        prev.map((a) => a.id === agent.id ? { ...a, is_enabled: !a.is_enabled } : a)
      );
      toast("success", agent.is_enabled ? "Agente desactivado" : "Agente activado");
    } catch {
      toast("error", "Error al cambiar estado");
    } finally {
      setToggling(null);
    }
  };

  const handleTrigger = async (agent: AgentConfig) => {
    setTriggering(agent.id);
    try {
      await api.post(`/agents/${agent.id}/trigger`, {});
      toast("success", "Análisis completado");
      await loadData(true);
    } catch (err: any) {
      toast("error", err.message || "Error al ejecutar");
    } finally {
      setTriggering(null);
    }
  };

  // ── Lazy detail loading ──────────────────────────────────────────

  const toggleExpand = async (item: FeedItem) => {
    if (expandedRunId === item.runId) { setExpandedRunId(null); return; }
    setExpandedRunId(item.runId);
    if (runDetails[item.runId]) return;
    setLoadingDetail(item.runId);
    try {
      const detail = await api.get<AgentRunDetail>(`/agents/${item.agentId}/runs/${item.runId}`);
      setRunDetails((prev) => ({ ...prev, [item.runId]: detail }));
    } catch {}
    finally { setLoadingDetail(null); }
  };

  // ── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Agentes</h1>
        <TableSkeleton rows={3} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Agentes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Activa agentes de IA para monitorear tus costos automáticamente.
        </p>
      </div>

      {/* Agent cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {agents.map((agent) => {
          const meta = AGENT_META[agent.agent_type] || AGENT_META.price_monitor;
          const Icon = meta.icon;
          const isTriggering = triggering === agent.id;
          const isToggling = toggling === agent.id;
          const agentFindings = feed.filter((f) => f.agentId === agent.id);
          const lastFinding = agentFindings[0];

          return (
            <div key={agent.id}
              className={`rounded-xl border bg-card overflow-hidden transition-opacity ${!agent.is_enabled ? "opacity-60" : ""}`}
            >
              <div className="p-4">
                {/* Top row: icon + name + toggle */}
                <div className="flex items-center gap-3 mb-2">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${meta.bg} shrink-0`}>
                    <Icon className={`h-[18px] w-[18px] ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{agent.name}</p>
                  </div>
                  <button
                    onClick={() => handleToggle(agent)}
                    disabled={isToggling}
                    className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors shrink-0 ${
                      agent.is_enabled ? "bg-green-500" : "bg-muted-foreground/20"
                    }`}
                  >
                    <span className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                      style={{ transform: `translateX(${agent.is_enabled ? "18px" : "3px"})` }}
                    />
                  </button>
                </div>

                {/* Description */}
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">{meta.description}</p>

                {/* Status + trigger */}
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-muted-foreground">
                    {agent.is_enabled ? (
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                        Activo
                        {lastFinding && <> &middot; {lastFinding.findingsCount} hallazgo{lastFinding.findingsCount > 1 ? "s" : ""}</>}
                      </span>
                    ) : (
                      "Inactivo"
                    )}
                  </div>
                  {agent.is_enabled && (
                    <Button
                      onClick={() => handleTrigger(agent)}
                      disabled={isTriggering}
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs rounded-lg px-2.5"
                    >
                      {isTriggering
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <><Play className="h-3 w-3 mr-1" />Ejecutar</>
                      }
                    </Button>
                  )}
                </div>
              </div>

              {/* Latest finding preview */}
              {lastFinding && agent.is_enabled && (
                <div className="border-t bg-muted/20 px-4 py-2.5">
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    <Sparkles className="h-3 w-3 inline mr-1 text-primary/60" />
                    {lastFinding.summary}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{timeAgo(lastFinding.time)}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Insights feed */}
      {feed.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Hallazgos recientes</h2>
          <div className="space-y-2">
            {feed.map((item) => {
              const isExpanded = expandedRunId === item.runId;
              const detail = runDetails[item.runId];
              const isLoadingThis = loadingDetail === item.runId;
              const meta = AGENT_META[item.agentType] || AGENT_META.price_monitor;
              const AgentIcon = meta.icon;

              return (
                <div key={item.runId} className="rounded-xl border overflow-hidden">
                  <button
                    onClick={() => toggleExpand(item)}
                    className="w-full flex items-start gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
                  >
                    <AgentIcon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug">{item.summary}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{timeAgo(item.time)}</p>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 mt-0.5 transition-transform duration-150 ${
                      isExpanded ? "rotate-180" : ""
                    }`} />
                  </button>

                  {isExpanded && (
                    <div className="border-t px-3 py-3 bg-muted/10 animate-in fade-in duration-100">
                      {isLoadingThis ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />Cargando…
                        </div>
                      ) : detail?.findings?.length ? (
                        <div className="space-y-2.5">
                          {detail.findings.map((f) => {
                            const sev = severityMeta(f.severity);
                            const alts = f.data?.alternatives as Array<{ name: string; avg_price: number }> | undefined;
                            return (
                              <div key={f.id} className="flex items-start gap-2">
                                <sev.Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${sev.color}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium">{f.title}</p>
                                  {f.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.description}</p>
                                  )}
                                  {alts && alts.length > 0 && (
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                      {alts.map((alt, i) => (
                                        <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded px-1.5 py-0.5">
                                          <Lightbulb className="h-3 w-3" />
                                          {alt.name}: {formatCurrency(alt.avg_price)}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Sin detalles.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {feed.length === 0 && (
        <div className="text-center py-10">
          <Sparkles className="h-7 w-7 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Sube facturas para que los agentes empiecen a generar hallazgos.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function severityMeta(s: string) {
  if (s === "critical") return { Icon: XCircle, color: "text-red-500" };
  if (s === "warning") return { Icon: AlertTriangle, color: "text-amber-500" };
  if (s === "info") return { Icon: Info, color: "text-blue-500" };
  return { Icon: CheckCircle2, color: "text-green-500" };
}
