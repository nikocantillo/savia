"use client";

import { useEffect, useState, useCallback } from "react";
import { api, AgentConfig, AgentRun, AgentRunDetail } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";

const AGENT_META: Record<string, { icon: typeof TrendingUp; color: string; description: string }> = {
  price_monitor: {
    icon: TrendingUp,
    color: "text-blue-500",
    description: "Detecta alzas de precios, busca alternativas más baratas y genera recomendaciones automáticas.",
  },
  supplier_eval: {
    icon: Shield,
    color: "text-purple-500",
    description: "Califica proveedores por precio, consistencia y cumplimiento de acuerdos.",
  },
};

const SEVERITY_CONFIG: Record<string, { icon: typeof AlertTriangle; color: string; bg: string; label: string }> = {
  critical: { icon: XCircle, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", label: "Crítico" },
  warning: { icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", label: "Advertencia" },
  info: { icon: Info, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", label: "Info" },
};

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  completed: { icon: CheckCircle2, color: "text-green-500", label: "Completado" },
  running: { icon: Loader2, color: "text-blue-500", label: "Ejecutando" },
  queued: { icon: Clock, color: "text-amber-500", label: "En cola" },
  failed: { icon: XCircle, color: "text-red-500", label: "Fallido" },
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<AgentRunDetail | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const { toast } = useToast();

  const fetchAgents = useCallback(async () => {
    try {
      let data = await api.get<AgentConfig[]>("/agents");
      if (data.length === 0) {
        await api.post("/agents/setup", {});
        data = await api.get<AgentConfig[]>("/agents");
      }
      setAgents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleTrigger = async (agentId: string) => {
    setTriggering(agentId);
    try {
      await api.post(`/agents/${agentId}/trigger`, {});
      toast("success", "Agente ejecutándose en segundo plano");
      setTimeout(async () => {
        await fetchAgents();
        if (selectedAgent?.id === agentId) {
          loadRuns(agentId);
        }
      }, 4000);
    } catch (err: any) {
      toast("error", err.message || "Error al ejecutar agente");
    } finally {
      setTriggering(null);
    }
  };

  const handleToggle = async (agent: AgentConfig) => {
    try {
      await api.put(`/agents/${agent.id}`, { is_enabled: !agent.is_enabled });
      setAgents((prev) =>
        prev.map((a) => (a.id === agent.id ? { ...a, is_enabled: !a.is_enabled } : a))
      );
      toast("success", agent.is_enabled ? "Agente desactivado" : "Agente activado");
    } catch (err: any) {
      toast("error", err.message || "Error al actualizar agente");
    }
  };

  const loadRuns = async (agentId: string) => {
    setLoadingRuns(true);
    try {
      const data = await api.get<AgentRun[]>(`/agents/${agentId}/runs`);
      setRuns(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRuns(false);
    }
  };

  const loadRunDetail = async (agentId: string, runId: string) => {
    setLoadingDetail(true);
    try {
      const data = await api.get<AgentRunDetail>(`/agents/${agentId}/runs/${runId}`);
      setSelectedRun(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const openAgent = (agent: AgentConfig) => {
    setSelectedAgent(agent);
    setSelectedRun(null);
    loadRuns(agent.id);
  };

  // ── Run Detail View ──────────────────────────────────────────────

  if (selectedRun && selectedAgent) {
    const statusCfg = STATUS_CONFIG[selectedRun.status] || STATUS_CONFIG.completed;
    const StatusIcon = statusCfg.icon;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedRun(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Button>
          <div className="flex items-center gap-2">
            <StatusIcon className={`h-4 w-4 ${statusCfg.color} ${selectedRun.status === "running" ? "animate-spin" : ""}`} />
            <span className="font-medium">{statusCfg.label}</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {formatDate(selectedRun.started_at)}
          </span>
        </div>

        {selectedRun.findings_summary && (
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" /> Resumen del Agente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {selectedRun.findings_summary}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-4">
          <Badge variant="outline">{selectedRun.findings_count} hallazgos</Badge>
          <Badge variant="outline">{selectedRun.actions_count} acciones</Badge>
          <Badge variant="outline" className="capitalize">{selectedRun.trigger}</Badge>
        </div>

        {selectedRun.error_message && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="py-4">
              <p className="text-sm text-red-600 dark:text-red-400">{selectedRun.error_message}</p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {selectedRun.findings.map((f) => {
            const sevCfg = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.info;
            const SevIcon = sevCfg.icon;
            const alternatives = f.data?.alternatives as Array<{ name: string; avg_price: number }> | undefined;

            return (
              <Card key={f.id} className={`border-l-4 ${f.severity === "critical" ? "border-l-red-500" : f.severity === "warning" ? "border-l-amber-500" : "border-l-blue-500"} border-0 shadow-sm`}>
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 rounded-lg ${sevCfg.bg} p-2`}>
                      <SevIcon className={`h-4 w-4 ${sevCfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{f.title}</p>
                        <Badge variant="outline" className="text-xs">{sevCfg.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-line">{f.description}</p>
                      {alternatives && alternatives.length > 0 && (
                        <div className="mt-3 rounded-lg bg-green-500/5 border border-green-500/20 p-3">
                          <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1.5">
                            Alternativas detectadas
                          </p>
                          {alternatives.map((alt, i) => (
                            <p key={i} className="text-sm text-muted-foreground">
                              {alt.name}: <span className="font-medium">${alt.avg_price?.toLocaleString("es-CO")}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {selectedRun.findings.length === 0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="font-medium">Sin hallazgos</p>
                <p className="text-sm text-muted-foreground">No se detectaron anomalías en esta ejecución.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // ── Agent Detail View ────────────────────────────────────────────

  if (selectedAgent) {
    const meta = AGENT_META[selectedAgent.agent_type] || AGENT_META.price_monitor;
    const AgentIcon = meta.icon;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedAgent(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Agentes
          </Button>
        </div>

        <Card className="border-0 shadow-md">
          <CardContent className="py-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-brand shadow-lg shadow-primary/20">
                  <AgentIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{selectedAgent.name}</h2>
                  <p className="text-sm text-muted-foreground">{meta.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleToggle(selectedAgent)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    selectedAgent.is_enabled ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    selectedAgent.is_enabled ? "translate-x-6" : "translate-x-1"
                  }`} />
                </button>
                <Button
                  onClick={() => handleTrigger(selectedAgent.id)}
                  disabled={triggering === selectedAgent.id}
                  className="gradient-brand border-0 text-white"
                >
                  {triggering === selectedAgent.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  Ejecutar ahora
                </Button>
              </div>
            </div>

            {selectedAgent.config && (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl bg-muted/50 p-4">
                  <p className="text-xs text-muted-foreground mb-1">Umbral de alerta</p>
                  <p className="text-lg font-bold">{selectedAgent.config.threshold_pct ?? 5}%</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-4">
                  <p className="text-xs text-muted-foreground mb-1">Periodo de análisis</p>
                  <p className="text-lg font-bold">{selectedAgent.config.lookback_days ?? 30} días</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-4">
                  <p className="text-xs text-muted-foreground mb-1">Email automático</p>
                  <p className="text-lg font-bold">{selectedAgent.config.auto_email ? "Sí" : "No"}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div>
          <h3 className="text-lg font-semibold mb-4">Historial de ejecuciones</h3>
          {loadingRuns ? (
            <TableSkeleton rows={3} />
          ) : runs.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-8 text-center">
                <Activity className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="font-medium">Sin ejecuciones</p>
                <p className="text-sm text-muted-foreground">Haz clic en &quot;Ejecutar ahora&quot; para la primera ejecución.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => {
                const statusCfg = STATUS_CONFIG[run.status] || STATUS_CONFIG.completed;
                const RunStatusIcon = statusCfg.icon;
                return (
                  <Card
                    key={run.id}
                    className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => loadRunDetail(selectedAgent.id, run.id)}
                  >
                    <CardContent className="py-3 flex items-center gap-4">
                      <RunStatusIcon className={`h-5 w-5 ${statusCfg.color} shrink-0 ${run.status === "running" ? "animate-spin" : ""}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{statusCfg.label}</span>
                          <Badge variant="outline" className="text-xs capitalize">{run.trigger}</Badge>
                          <span className="text-xs text-muted-foreground">{formatDate(run.started_at)}</span>
                        </div>
                        {run.findings_summary && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{run.findings_summary}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {run.findings_count > 0 && (
                          <Badge variant="secondary" className="text-xs">{run.findings_count} hallazgos</Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Agent List View ──────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Agentes</h1>
        <p className="text-muted-foreground">
          Agentes autónomos de IA que monitorean tus datos y te alertan proactivamente
        </p>
      </div>

      {loading ? (
        <TableSkeleton rows={2} />
      ) : agents.length === 0 ? (
        <Card className="border-0 shadow-md">
          <CardContent className="py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl gradient-brand shadow-lg shadow-primary/20 mx-auto mb-4">
              <Bot className="h-8 w-8 text-white" />
            </div>
            <p className="text-lg font-semibold mb-2">Configurar agentes</p>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Los agentes autónomos analizan tus datos continuamente y te notifican cuando detectan anomalías.
            </p>
            <Button onClick={fetchAgents} className="gradient-brand border-0 text-white">
              <Zap className="mr-2 h-4 w-4" /> Activar agentes
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {agents.map((agent) => {
            const meta = AGENT_META[agent.agent_type] || AGENT_META.price_monitor;
            const Icon = meta.icon;
            const lastStatus = STATUS_CONFIG[agent.last_run_status || ""] || null;

            return (
              <Card
                key={agent.id}
                className="border-0 shadow-md hover:shadow-lg transition-all cursor-pointer group"
                onClick={() => openAgent(agent)}
              >
                <CardContent className="py-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                        agent.is_enabled ? "gradient-brand shadow-lg shadow-primary/20" : "bg-muted"
                      }`}>
                        <Icon className={`h-6 w-6 ${agent.is_enabled ? "text-white" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{agent.name}</h3>
                          <Badge variant={agent.is_enabled ? "default" : "secondary"} className="text-xs">
                            {agent.is_enabled ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{meta.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 sm:shrink-0">
                      {lastStatus && (
                        <div className="flex items-center gap-1.5">
                          <lastStatus.icon className={`h-4 w-4 ${lastStatus.color}`} />
                          <span className="text-xs text-muted-foreground">{lastStatus.label}</span>
                          {agent.last_run_findings != null && agent.last_run_findings > 0 && (
                            <Badge variant="outline" className="text-xs ml-1">
                              {agent.last_run_findings} hallazgos
                            </Badge>
                          )}
                        </div>
                      )}
                      {agent.last_run_at && (
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {formatDate(agent.last_run_at)}
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTrigger(agent.id);
                        }}
                        disabled={triggering === agent.id}
                      >
                        {triggering === agent.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
