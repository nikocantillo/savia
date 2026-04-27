"use client";

import { useEffect, useState, useCallback } from "react";
import { api, AgentConfig, AgentRun, AgentRunDetail } from "@/lib/api";
import { timeAgo, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/skeleton-loader";
import { useToast } from "@/components/toast";
import {
  Sparkles,
  TrendingUp,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  ChevronDown,
  RefreshCw,
  Loader2,
  Settings2,
  X,
  Lightbulb,
} from "lucide-react";

// ── Helpers ─────────────────────────────────────────────────────────

interface Insight {
  id: string;
  agentType: string;
  runId: string;
  agentId: string;
  severity: string;
  title: string;
  description: string | null;
  data: Record<string, any> | null;
  time: string;
  runSummary: string | null;
}

function severityIcon(s: string) {
  if (s === "critical") return { Icon: XCircle, color: "text-red-500", bg: "bg-red-100 dark:bg-red-500/15", ring: "ring-red-500/20" };
  if (s === "warning") return { Icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-100 dark:bg-amber-500/15", ring: "ring-amber-500/20" };
  return { Icon: Info, color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-500/15", ring: "ring-blue-500/20" };
}

// ── Component ───────────────────────────────────────────────────────

export default function InsightsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [allClear, setAllClear] = useState<{ time: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [sensitivity, setSensitivity] = useState<"bajo" | "medio" | "alto">("medio");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const { toast } = useToast();

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      await api.post("/agents/setup", {});
      const agentList = await api.get<AgentConfig[]>("/agents");
      setAgents(agentList);

      const priceAgent = agentList.find((a) => a.agent_type === "price_monitor");
      if (priceAgent) {
        const s = priceAgent.config?.threshold_pct;
        if (s != null) setSensitivity(s <= 3 ? "alto" : s <= 8 ? "medio" : "bajo");
        setEmailEnabled(priceAgent.config?.auto_email !== false);
      }

      const allInsights: Insight[] = [];
      let latestAllClear: { time: string } | null = null;

      for (const agent of agentList) {
        try {
          const runs = await api.get<AgentRun[]>(`/agents/${agent.id}/runs?limit=10`);
          for (const run of runs) {
            if (run.status !== "completed") continue;
            if (run.findings_count === 0) {
              if (!latestAllClear || new Date(run.started_at) > new Date(latestAllClear.time)) {
                latestAllClear = { time: run.started_at };
              }
              continue;
            }
            try {
              const detail = await api.get<AgentRunDetail>(`/agents/${agent.id}/runs/${run.id}`);
              for (const f of detail.findings) {
                allInsights.push({
                  id: f.id,
                  agentType: agent.agent_type,
                  runId: run.id,
                  agentId: agent.id,
                  severity: f.severity,
                  title: f.title,
                  description: f.description,
                  data: f.data,
                  time: f.created_at || run.started_at,
                  runSummary: run.findings_summary,
                });
              }
            } catch {}
          }
        } catch {}
      }

      allInsights.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setInsights(allInsights);
      setAllClear(latestAllClear);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      for (const agent of agents) {
        if (agent.is_enabled) {
          await api.post(`/agents/${agent.id}/trigger`, {});
        }
      }
      toast("success", "Análisis completado");
      await loadData(true);
    } catch (err: any) {
      toast("error", err.message || "Error al analizar");
    } finally { setRefreshing(false); }
  };

  const handleSensitivity = async (level: "bajo" | "medio" | "alto") => {
    setSensitivity(level);
    const thresholdMap = { alto: 3, medio: 5, bajo: 15 };
    const priceAgent = agents.find((a) => a.agent_type === "price_monitor");
    if (priceAgent) {
      try {
        await api.put(`/agents/${priceAgent.id}`, { config: { ...priceAgent.config, threshold_pct: thresholdMap[level] } });
      } catch {}
    }
  };

  const handleEmailToggle = async () => {
    const next = !emailEnabled;
    setEmailEnabled(next);
    const priceAgent = agents.find((a) => a.agent_type === "price_monitor");
    if (priceAgent) {
      try {
        await api.put(`/agents/${priceAgent.id}`, { config: { ...priceAgent.config, auto_email: next } });
      } catch {}
    }
  };

  // ── Computed summary cards ───────────────────────────────────────

  const priceInsights = insights.filter((i) => i.agentType === "price_monitor");
  const supplierInsights = insights.filter((i) => i.agentType === "supplier_eval");
  const criticalCount = insights.filter((i) => i.severity === "critical").length;

  const savingsTotal = priceInsights.reduce((sum, i) => {
    const alts = i.data?.alternatives as Array<{ avg_price: number }> | undefined;
    const currentPrice = (i.data?.current_price as number) || 0;
    if (alts && alts.length > 0 && currentPrice > 0) {
      const cheapest = Math.min(...alts.map((a) => a.avg_price));
      if (cheapest < currentPrice) return sum + (currentPrice - cheapest);
    }
    return sum;
  }, 0);

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Inteligencia</h1>
          <p className="text-muted-foreground mt-1">Sabia analiza tus facturas y te avisa lo importante.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
            title="Ajustes"
          >
            <Settings2 className="h-5 w-5" />
          </button>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            size="sm"
            className="rounded-xl"
          >
            {refreshing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Analizar
          </Button>
        </div>
      </div>

      {/* Settings panel (collapsible) */}
      {showSettings && (
        <div className="rounded-2xl border bg-card p-5 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Ajustes</h3>
            <button onClick={() => setShowSettings(false)} className="p-1 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-sm mb-2">Sensibilidad de detección</p>
              <div className="flex gap-2">
                {(["bajo", "medio", "alto"] as const).map((level) => (
                  <button key={level} onClick={() => handleSensitivity(level)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                      sensitivity === level
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-muted hover:bg-muted/80 text-muted-foreground"
                    }`}
                  >
                    {level === "bajo" ? "Bajo" : level === "medio" ? "Medio" : "Alto"}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {sensitivity === "alto" ? "Te avisa con alzas desde 3%. Más notificaciones." :
                 sensitivity === "medio" ? "Te avisa con alzas desde 5%. Balance recomendado." :
                 "Te avisa con alzas desde 15%. Solo cambios grandes."}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Notificaciones por email</p>
                <p className="text-[11px] text-muted-foreground">Recibir email cuando haya hallazgos críticos</p>
              </div>
              <button onClick={handleEmailToggle}
                className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${emailEnabled ? "bg-primary" : "bg-muted-foreground/20"}`}
              >
                <span className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                  style={{ transform: `translateX(${emailEnabled ? "18px" : "3px"})` }}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? <TableSkeleton rows={3} /> : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Precios */}
            <div className={`rounded-2xl border p-4 ${
              priceInsights.length === 0 ? "bg-green-50 dark:bg-green-500/5 border-green-200 dark:border-green-500/20" :
              criticalCount > 0 ? "bg-red-50 dark:bg-red-500/5 border-red-200 dark:border-red-500/20" :
              "bg-amber-50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20"
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {priceInsights.length === 0
                  ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                  : <TrendingUp className="h-5 w-5 text-amber-500" />
                }
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Precios</span>
              </div>
              <p className="text-sm font-semibold">
                {priceInsights.length === 0
                  ? "Tus precios están estables"
                  : `${priceInsights.length} producto${priceInsights.length > 1 ? "s" : ""} con cambio de precio`
                }
              </p>
            </div>

            {/* Proveedores */}
            <div className={`rounded-2xl border p-4 ${
              supplierInsights.length === 0 ? "bg-green-50 dark:bg-green-500/5 border-green-200 dark:border-green-500/20" :
              "bg-purple-50 dark:bg-purple-500/5 border-purple-200 dark:border-purple-500/20"
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <Shield className={`h-5 w-5 ${supplierInsights.length === 0 ? "text-green-500" : "text-purple-500"}`} />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Proveedores</span>
              </div>
              <p className="text-sm font-semibold">
                {supplierInsights.length === 0
                  ? "Todos tus proveedores están bien"
                  : `${supplierInsights.length} proveedor${supplierInsights.length > 1 ? "es" : ""} necesita${supplierInsights.length > 1 ? "n" : ""} atención`
                }
              </p>
            </div>

            {/* Ahorro */}
            <div className={`rounded-2xl border p-4 ${
              savingsTotal > 0 ? "bg-emerald-50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20" :
              "bg-muted/30 border-border"
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className={`h-5 w-5 ${savingsTotal > 0 ? "text-emerald-500" : "text-muted-foreground"}`} />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ahorro</span>
              </div>
              <p className="text-sm font-semibold">
                {savingsTotal > 0
                  ? `${formatCurrency(savingsTotal)} de ahorro posible`
                  : "Sin oportunidades de ahorro por ahora"
                }
              </p>
            </div>
          </div>

          {/* Insights feed */}
          {insights.length === 0 ? (
            /* Empty state */
            <div className="text-center py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
                <Sparkles className="h-7 w-7 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold mb-1">Sin hallazgos todavía</h2>
              <p className="text-muted-foreground max-w-sm mx-auto">
                Sube facturas para que Sabia empiece a analizar tus costos y proveedores automáticamente.
              </p>
              {allClear && (
                <p className="text-xs text-muted-foreground mt-4">
                  <CheckCircle2 className="h-3.5 w-3.5 inline mr-1 text-green-500" />
                  Último análisis {timeAgo(allClear.time).toLowerCase()} — todo en orden.
                </p>
              )}
              <Button onClick={handleRefresh} disabled={refreshing} variant="outline" className="mt-6 rounded-xl">
                {refreshing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                Ejecutar análisis manual
              </Button>
            </div>
          ) : (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
                Hallazgos recientes
              </h2>
              <div className="space-y-3">
                {insights.map((insight) => {
                  const { Icon, color, bg, ring } = severityIcon(insight.severity);
                  const isExpanded = expandedId === insight.id;
                  const alts = insight.data?.alternatives as Array<{ name: string; avg_price: number }> | undefined;

                  return (
                    <div key={insight.id}>
                      {/* Insight row */}
                      <div
                        onClick={() => setExpandedId(isExpanded ? null : insight.id)}
                        className={`flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition-all ${
                          isExpanded ? `shadow-md ring-1 ${ring}` : "hover:bg-muted/30"
                        }`}
                      >
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${bg} shrink-0 mt-0.5`}>
                          <Icon className={`h-[18px] w-[18px] ${color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold leading-snug">{insight.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(insight.time)}</p>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="ml-12 mt-1 mb-2 animate-in slide-in-from-top-1 duration-150">
                          {insight.description && (
                            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line mb-3">
                              {insight.description}
                            </p>
                          )}

                          {/* Alternatives */}
                          {alts && alts.length > 0 && (
                            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 p-3 mb-3">
                              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1.5 flex items-center gap-1">
                                <Lightbulb className="h-3.5 w-3.5" />
                                Alternativa más barata
                              </p>
                              {alts.map((alt, i) => (
                                <p key={i} className="text-sm text-muted-foreground">
                                  {alt.name} — <span className="font-semibold">{formatCurrency(alt.avg_price)}</span>
                                </p>
                              ))}
                            </div>
                          )}

                          {/* Run summary if available */}
                          {insight.runSummary && (
                            <p className="text-xs text-muted-foreground border-t border-border/50 pt-2 mt-2">
                              <Sparkles className="h-3 w-3 inline mr-1 text-primary" />
                              {insight.runSummary}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* All clear note if recent runs had no findings */}
              {allClear && (
                <p className="text-xs text-muted-foreground text-center mt-6">
                  <CheckCircle2 className="h-3.5 w-3.5 inline mr-1 text-green-500" />
                  Último análisis sin hallazgos: {timeAgo(allClear.time).toLowerCase()}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
