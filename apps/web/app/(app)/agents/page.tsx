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

export default function InsightsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runDetails, setRunDetails] = useState<Record<string, AgentRunDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [sensitivity, setSensitivity] = useState<"bajo" | "medio" | "alto">("medio");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const { toast } = useToast();

  // ── Load: setup + agents + runs (all parallel) ───────────────────

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      await api.post("/agents/setup", {});
      const agentList = await api.get<AgentConfig[]>("/agents");
      setAgents(agentList);

      const priceAgent = agentList.find((a) => a.agent_type === "price_monitor");
      if (priceAgent) {
        const t = priceAgent.config?.threshold_pct;
        if (t != null) setSensitivity(t <= 3 ? "alto" : t <= 8 ? "medio" : "bajo");
        setEmailEnabled(priceAgent.config?.auto_email !== false);
      }

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

  // ── Expand: fetch detail lazily ──────────────────────────────────

  const toggleExpand = async (item: FeedItem) => {
    if (expandedRunId === item.runId) {
      setExpandedRunId(null);
      return;
    }
    setExpandedRunId(item.runId);
    if (runDetails[item.runId]) return;

    setLoadingDetail(item.runId);
    try {
      const detail = await api.get<AgentRunDetail>(`/agents/${item.agentId}/runs/${item.runId}`);
      setRunDetails((prev) => ({ ...prev, [item.runId]: detail }));
    } catch {}
    finally { setLoadingDetail(null); }
  };

  // ── Refresh: trigger all enabled agents ──────────────────────────

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all(
        agents.filter((a) => a.is_enabled).map((a) => api.post(`/agents/${a.id}/trigger`, {}))
      );
      toast("success", "Análisis completado");
      await loadData(true);
    } catch (err: any) {
      toast("error", err.message || "Error al analizar");
    } finally {
      setRefreshing(false);
    }
  };

  // ── Settings handlers ────────────────────────────────────────────

  const handleSensitivity = async (level: "bajo" | "medio" | "alto") => {
    setSensitivity(level);
    const thresholdMap = { alto: 3, medio: 5, bajo: 15 };
    const priceAgent = agents.find((a) => a.agent_type === "price_monitor");
    if (priceAgent) {
      try {
        await api.put(`/agents/${priceAgent.id}`, {
          config: { ...priceAgent.config, threshold_pct: thresholdMap[level] },
        });
      } catch {}
    }
  };

  const handleEmailToggle = async () => {
    const next = !emailEnabled;
    setEmailEnabled(next);
    const priceAgent = agents.find((a) => a.agent_type === "price_monitor");
    if (priceAgent) {
      try {
        await api.put(`/agents/${priceAgent.id}`, {
          config: { ...priceAgent.config, auto_email: next },
        });
      } catch {}
    }
  };

  // ── Computed summary values ──────────────────────────────────────

  const priceCount = feed.filter((i) => i.agentType === "price_monitor").length;
  const supplierCount = feed.filter((i) => i.agentType === "supplier_eval").length;

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Inteligencia</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sabia analiza tus facturas y te avisa lo importante.
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            title="Ajustes"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <Button onClick={handleRefresh} disabled={refreshing} size="sm" variant="outline" className="rounded-lg h-8">
            {refreshing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Analizar</>
            }
          </Button>
        </div>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="rounded-xl border bg-card p-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Ajustes</span>
            <button onClick={() => setShowSettings(false)} className="p-1 rounded-md hover:bg-muted">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Sensibilidad de detección</p>
              <div className="flex gap-1.5">
                {(["bajo", "medio", "alto"] as const).map((level) => (
                  <button key={level} onClick={() => handleSensitivity(level)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      sensitivity === level
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {level === "bajo" ? "Bajo" : level === "medio" ? "Medio" : "Alto"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">Notificaciones por email</span>
              <button onClick={handleEmailToggle}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  emailEnabled ? "bg-primary" : "bg-muted-foreground/20"
                }`}
              >
                <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                  style={{ transform: `translateX(${emailEnabled ? "16px" : "2px"})` }}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? <TableSkeleton rows={3} /> : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-2.5">
            <SummaryCard
              icon={priceCount === 0 ? CheckCircle2 : TrendingUp}
              iconColor={priceCount === 0 ? "text-green-500" : "text-amber-500"}
              label="Precios"
              value={priceCount === 0 ? "Estables" : `${priceCount} alerta${priceCount > 1 ? "s" : ""}`}
              accent={priceCount === 0 ? "green" : "amber"}
            />
            <SummaryCard
              icon={Shield}
              iconColor={supplierCount === 0 ? "text-green-500" : "text-purple-500"}
              label="Proveedores"
              value={supplierCount === 0 ? "Sin novedad" : `${supplierCount} atención`}
              accent={supplierCount === 0 ? "green" : "purple"}
            />
            <SummaryCard
              icon={Lightbulb}
              iconColor={feed.length > 0 ? "text-emerald-500" : "text-muted-foreground"}
              label="Hallazgos"
              value={feed.length > 0 ? `${feed.length} total` : "Ninguno"}
              accent={feed.length > 0 ? "emerald" : "neutral"}
            />
          </div>

          {/* Feed */}
          {feed.length === 0 ? (
            <div className="text-center py-12">
              <Sparkles className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-medium mb-1">Todo en orden</p>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Sube facturas para que Sabia empiece a analizar tus costos automáticamente.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {feed.map((item) => {
                const isExpanded = expandedRunId === item.runId;
                const detail = runDetails[item.runId];
                const isLoadingThis = loadingDetail === item.runId;
                const sev = item.agentType === "price_monitor" ? "warning" : "info";
                const { Icon, color, bg } = severityIcon(sev);

                return (
                  <div key={item.runId} className="rounded-xl border overflow-hidden">
                    <button
                      onClick={() => toggleExpand(item)}
                      className="w-full flex items-start gap-3 p-3.5 text-left hover:bg-muted/30 transition-colors"
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg} shrink-0 mt-0.5`}>
                        <Icon className={`h-4 w-4 ${color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug">{item.summary}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{timeAgo(item.time)}</p>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform duration-150 ${
                        isExpanded ? "rotate-180" : ""
                      }`} />
                    </button>

                    {isExpanded && (
                      <div className="border-t px-3.5 py-3 bg-muted/10 animate-in fade-in duration-100">
                        {isLoadingThis ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />Cargando detalles…
                          </div>
                        ) : detail?.findings?.length ? (
                          <div className="space-y-2.5">
                            {detail.findings.map((f) => {
                              const fs = severityIcon(f.severity);
                              const alts = f.data?.alternatives as Array<{ name: string; avg_price: number }> | undefined;
                              return (
                                <div key={f.id} className="flex items-start gap-2.5">
                                  <fs.Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${fs.color}`} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{f.title}</p>
                                    {f.description && (
                                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.description}</p>
                                    )}
                                    {alts && alts.length > 0 && (
                                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {alts.map((alt, i) => (
                                          <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-md px-2 py-0.5">
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
                          <p className="text-xs text-muted-foreground">Sin detalles disponibles.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Summary card ────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, iconColor, label, value, accent }: {
  icon: typeof TrendingUp;
  iconColor: string;
  label: string;
  value: string;
  accent: "green" | "amber" | "purple" | "emerald" | "neutral";
}) {
  const bgMap = {
    green: "bg-green-50 dark:bg-green-500/5 border-green-200/60 dark:border-green-500/15",
    amber: "bg-amber-50 dark:bg-amber-500/5 border-amber-200/60 dark:border-amber-500/15",
    purple: "bg-purple-50 dark:bg-purple-500/5 border-purple-200/60 dark:border-purple-500/15",
    emerald: "bg-emerald-50 dark:bg-emerald-500/5 border-emerald-200/60 dark:border-emerald-500/15",
    neutral: "bg-muted/30 border-border",
  };

  return (
    <div className={`rounded-xl border p-3 ${bgMap[accent]}`}>
      <Icon className={`h-4 w-4 mb-1.5 ${iconColor}`} />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}

// ── Severity helper ─────────────────────────────────────────────────

function severityIcon(s: string) {
  if (s === "critical") return { Icon: XCircle, color: "text-red-500", bg: "bg-red-100 dark:bg-red-500/15" };
  if (s === "warning") return { Icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-100 dark:bg-amber-500/15" };
  return { Icon: Info, color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-500/15" };
}
