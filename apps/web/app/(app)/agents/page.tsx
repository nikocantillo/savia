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
  ChevronDown,
  ArrowLeft,
  Zap,
  Shield,
  Activity,
  Eye,
  Search,
  Bell,
  Mail,
  FileText,
  Plus,
  Trash2,
  GripVertical,
  Settings2,
  ArrowRight,
} from "lucide-react";

// ── Agent metadata ─────────────────────────────────────────────────

const AGENT_META: Record<string, {
  icon: typeof TrendingUp;
  color: string;
  gradient: string;
  description: string;
  steps: { id: string; label: string; icon: typeof Eye; description: string }[];
}> = {
  price_monitor: {
    icon: TrendingUp,
    color: "text-blue-500",
    gradient: "from-blue-500 to-cyan-500",
    description: "Detecta alzas de precios, busca alternativas más baratas y genera recomendaciones.",
    steps: [
      { id: "observe", label: "Observar", icon: Eye, description: "Carga historial de precios de todos los productos" },
      { id: "detect", label: "Detectar alzas", icon: TrendingUp, description: "Identifica productos con aumento de precio" },
      { id: "alternatives", label: "Buscar alternativas", icon: Search, description: "Compara precios entre proveedores" },
      { id: "alert", label: "Crear alertas", icon: Bell, description: "Genera alertas para hallazgos importantes" },
      { id: "notify", label: "Notificar", icon: Mail, description: "Envía email con hallazgos críticos" },
    ],
  },
  supplier_eval: {
    icon: Shield,
    color: "text-purple-500",
    gradient: "from-purple-500 to-pink-500",
    description: "Califica proveedores por precio, consistencia y cumplimiento.",
    steps: [
      { id: "observe", label: "Analizar datos", icon: Eye, description: "Recopila datos de facturas por proveedor" },
      { id: "score", label: "Puntuar", icon: Activity, description: "Calcula score de competitividad y consistencia" },
      { id: "compliance", label: "Verificar acuerdos", icon: Shield, description: "Compara precios reales vs. negociados" },
      { id: "alert", label: "Crear alertas", icon: Bell, description: "Alerta sobre proveedores con bajo puntaje" },
      { id: "report", label: "Generar reporte", icon: FileText, description: "Resumen ejecutivo con recomendaciones" },
    ],
  },
};

const PREDEFINED_ACTIONS: Record<string, { id: string; label: string; icon: typeof Bell; description: string }[]> = {
  price_monitor: [
    { id: "create_alert", label: "Crear alerta", icon: Bell, description: "Generar alerta en el sistema" },
    { id: "send_email", label: "Enviar email", icon: Mail, description: "Notificar por correo electrónico" },
    { id: "find_alternatives", label: "Buscar alternativas", icon: Search, description: "Comparar precios con otros proveedores" },
  ],
  supplier_eval: [
    { id: "create_alert", label: "Crear alerta", icon: Bell, description: "Generar alerta para proveedores críticos" },
    { id: "send_email", label: "Enviar email", icon: Mail, description: "Notificar evaluaciones críticas" },
    { id: "generate_report", label: "Generar reporte", icon: FileText, description: "Resumen ejecutivo con rankings" },
  ],
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

const RULE_CONDITIONS = [
  { id: "price_increase", label: "Precio sube más de" },
  { id: "price_decrease", label: "Precio baja más de" },
  { id: "supplier_score_below", label: "Score de proveedor menor a" },
  { id: "new_supplier", label: "Nuevo proveedor detectado" },
];

const RULE_ACTIONS = [
  { id: "create_alert", label: "Crear alerta" },
  { id: "send_email", label: "Enviar email" },
  { id: "send_email_urgent", label: "Enviar email urgente" },
];

// ── Types ──────────────────────────────────────────────────────────

interface CustomRule {
  id: string;
  condition: string;
  threshold: number;
  action: string;
}

// ── Main component ─────────────────────────────────────────────────

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<AgentRunDetail | null>(null);
  const [selectedRunAgent, setSelectedRunAgent] = useState<AgentConfig | null>(null);
  const [runs, setRuns] = useState<Record<string, AgentRun[]>>({});
  const [loadingRuns, setLoadingRuns] = useState<string | null>(null);
  const [showRules, setShowRules] = useState<string | null>(null);
  const [dragOverStep, setDragOverStep] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchAgents = useCallback(async () => {
    try {
      await api.post("/agents/setup", {});
      const data = await api.get<AgentConfig[]>("/agents");
      setAgents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleTrigger = async (agentId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTriggering(agentId);
    try {
      await api.post(`/agents/${agentId}/trigger`, {});
      toast("success", "Agente ejecutándose en segundo plano");
      setTimeout(async () => {
        await fetchAgents();
        await loadRuns_(agentId);
      }, 4000);
    } catch (err: any) {
      toast("error", err.message || "Error al ejecutar agente");
    } finally {
      setTriggering(null);
    }
  };

  const handleToggle = async (agent: AgentConfig, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const updated = await api.put<AgentConfig>(`/agents/${agent.id}`, { is_enabled: !agent.is_enabled });
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, is_enabled: !a.is_enabled } : a)));
      toast("success", agent.is_enabled ? "Agente desactivado" : "Agente activado");
    } catch (err: any) {
      toast("error", err.message || "Error al actualizar");
    }
  };

  const handleActionToggle = async (agent: AgentConfig, actionId: string) => {
    const currentActions = agent.config?.actions || {};
    const newActions = { ...currentActions, [actionId]: !currentActions[actionId] };
    const newConfig = { ...agent.config, actions: newActions };
    try {
      await api.put(`/agents/${agent.id}`, { config: newConfig });
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, config: newConfig } : a)));
    } catch (err: any) {
      toast("error", "Error al actualizar acción");
    }
  };

  const handleAddRule = async (agent: AgentConfig) => {
    const currentRules: CustomRule[] = agent.config?.rules || [];
    const newRule: CustomRule = {
      id: `rule_${Date.now()}`,
      condition: "price_increase",
      threshold: 10,
      action: "create_alert",
    };
    const newConfig = { ...agent.config, rules: [...currentRules, newRule] };
    try {
      await api.put(`/agents/${agent.id}`, { config: newConfig });
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, config: newConfig } : a)));
    } catch (err: any) {
      toast("error", "Error al agregar regla");
    }
  };

  const handleUpdateRule = async (agent: AgentConfig, ruleId: string, field: string, value: any) => {
    const currentRules: CustomRule[] = agent.config?.rules || [];
    const updated = currentRules.map((r) => (r.id === ruleId ? { ...r, [field]: value } : r));
    const newConfig = { ...agent.config, rules: updated };
    try {
      await api.put(`/agents/${agent.id}`, { config: newConfig });
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, config: newConfig } : a)));
    } catch {}
  };

  const handleDeleteRule = async (agent: AgentConfig, ruleId: string) => {
    const currentRules: CustomRule[] = agent.config?.rules || [];
    const newConfig = { ...agent.config, rules: currentRules.filter((r) => r.id !== ruleId) };
    try {
      await api.put(`/agents/${agent.id}`, { config: newConfig });
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, config: newConfig } : a)));
    } catch {}
  };

  const loadRuns_ = async (agentId: string) => {
    setLoadingRuns(agentId);
    try {
      const data = await api.get<AgentRun[]>(`/agents/${agentId}/runs`);
      setRuns((prev) => ({ ...prev, [agentId]: data }));
    } catch {}
    setLoadingRuns(null);
  };

  const loadRunDetail = async (agent: AgentConfig, runId: string) => {
    try {
      const data = await api.get<AgentRunDetail>(`/agents/${agent.id}/runs/${runId}`);
      setSelectedRun(data);
      setSelectedRunAgent(agent);
    } catch (err) { console.error(err); }
  };

  const toggleExpand = (agentId: string) => {
    if (expandedAgent === agentId) {
      setExpandedAgent(null);
    } else {
      setExpandedAgent(agentId);
      if (!runs[agentId]) loadRuns_(agentId);
    }
  };

  // ── Run Detail View ──────────────────────────────────────────────

  if (selectedRun && selectedRunAgent) {
    const statusCfg = STATUS_CONFIG[selectedRun.status] || STATUS_CONFIG.completed;
    const StatusIcon = statusCfg.icon;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedRun(null); setSelectedRunAgent(null); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Button>
          <div className="flex items-center gap-2">
            <StatusIcon className={`h-4 w-4 ${statusCfg.color} ${selectedRun.status === "running" ? "animate-spin" : ""}`} />
            <span className="font-medium">{statusCfg.label}</span>
          </div>
          <span className="text-sm text-muted-foreground">{formatDate(selectedRun.started_at)}</span>
        </div>

        {selectedRun.findings_summary && (
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" /> Resumen del Agente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{selectedRun.findings_summary}</p>
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
                          <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1.5">Alternativas detectadas</p>
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

  // ── Main Panel ───────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Agentes</h1>
          <p className="text-muted-foreground">Panel de agentes autónomos — configura sus acciones y reglas</p>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={2} />
      ) : (
        <div className="space-y-4">
          {agents.map((agent) => {
            const meta = AGENT_META[agent.agent_type] || AGENT_META.price_monitor;
            const Icon = meta.icon;
            const isExpanded = expandedAgent === agent.id;
            const agentRuns = runs[agent.id] || [];
            const actions = PREDEFINED_ACTIONS[agent.agent_type] || [];
            const agentActions = agent.config?.actions || {};
            const agentRules: CustomRule[] = agent.config?.rules || [];
            const lastStatus = STATUS_CONFIG[agent.last_run_status || ""] || null;

            return (
              <Card
                key={agent.id}
                className={`border-0 shadow-md transition-all duration-300 overflow-hidden ${isExpanded ? "shadow-xl" : "hover:shadow-lg"}`}
              >
                {/* Header — clickable to expand */}
                <div
                  className="flex items-center gap-4 p-5 cursor-pointer select-none"
                  onClick={() => toggleExpand(agent.id)}
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${meta.gradient} shadow-lg shrink-0 ${
                      !agent.is_enabled ? "opacity-40 grayscale" : ""
                    }`}
                  >
                    <Icon className="h-5 w-5 text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{agent.name}</h3>
                      <Badge variant={agent.is_enabled ? "default" : "secondary"} className="text-xs">
                        {agent.is_enabled ? "Activo" : "Inactivo"}
                      </Badge>
                      {lastStatus && agent.last_run_findings != null && agent.last_run_findings > 0 && (
                        <Badge variant="outline" className="text-xs">{agent.last_run_findings} hallazgos</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{meta.description}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => handleToggle(agent, e)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        agent.is_enabled ? "bg-primary" : "bg-muted"
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        agent.is_enabled ? "translate-x-6" : "translate-x-1"
                      }`} />
                    </button>
                    <Button
                      variant="outline" size="sm" className="hidden sm:flex"
                      onClick={(e) => handleTrigger(agent.id, e)}
                      disabled={triggering === agent.id}
                    >
                      {triggering === agent.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="border-t animate-slide-up">
                    {/* ── Workflow Pipeline ──────────────────── */}
                    <div className="p-5 pb-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Pipeline de ejecución</h4>
                      <div className="flex items-start gap-0 overflow-x-auto pb-2">
                        {meta.steps.map((step, i) => {
                          const StepIcon = step.icon;
                          return (
                            <div key={step.id} className="flex items-start shrink-0">
                              <div
                                className="group relative flex flex-col items-center w-24 cursor-default"
                                draggable
                                onDragStart={(e) => e.dataTransfer.setData("step", step.id)}
                                onDragOver={(e) => { e.preventDefault(); setDragOverStep(step.id); }}
                                onDragLeave={() => setDragOverStep(null)}
                                onDrop={() => setDragOverStep(null)}
                              >
                                <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
                                  dragOverStep === step.id
                                    ? "ring-2 ring-primary ring-offset-2 scale-110"
                                    : "group-hover:scale-105"
                                } bg-gradient-to-br ${meta.gradient} shadow-md`}>
                                  <StepIcon className="h-4 w-4 text-white" />
                                </div>
                                <p className="text-[11px] font-medium text-center mt-2 leading-tight">{step.label}</p>
                                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-popover border rounded-lg px-3 py-2 text-xs shadow-lg whitespace-nowrap z-10 pointer-events-none">
                                  {step.description}
                                </div>
                              </div>
                              {i < meta.steps.length - 1 && (
                                <div className="flex items-center h-10 px-1 shrink-0">
                                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Actions + Rules ────────────────────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-t">
                      {/* Predefined Actions */}
                      <div className="p-5 lg:border-r">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Acciones</h4>
                        <div className="space-y-2">
                          {actions.map((action) => {
                            const ActionIcon = action.icon;
                            const enabled = agentActions[action.id] !== false;
                            return (
                              <div
                                key={action.id}
                                className="flex items-center gap-3 rounded-xl p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                              >
                                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${enabled ? "bg-primary/10" : "bg-muted"}`}>
                                  <ActionIcon className={`h-4 w-4 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium ${!enabled ? "text-muted-foreground" : ""}`}>{action.label}</p>
                                  <p className="text-xs text-muted-foreground">{action.description}</p>
                                </div>
                                <button
                                  onClick={() => handleActionToggle(agent, action.id)}
                                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
                                    enabled ? "bg-primary" : "bg-muted-foreground/30"
                                  }`}
                                >
                                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                    enabled ? "translate-x-4.5" : "translate-x-0.5"
                                  }`} style={{ transform: `translateX(${enabled ? "18px" : "2px"})` }} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Custom Rules */}
                      <div className="p-5 border-t lg:border-t-0">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reglas personalizadas</h4>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleAddRule(agent)}>
                            <Plus className="h-3 w-3 mr-1" /> Agregar
                          </Button>
                        </div>
                        {agentRules.length === 0 ? (
                          <div
                            className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-6 text-center cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-colors"
                            onClick={() => handleAddRule(agent)}
                          >
                            <Settings2 className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">Clic para agregar una regla personalizada</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {agentRules.map((rule) => (
                              <div key={rule.id} className="flex items-center gap-2 rounded-xl bg-muted/30 p-3">
                                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 cursor-grab" />
                                <div className="flex-1 flex flex-wrap items-center gap-2 text-sm min-w-0">
                                  <span className="text-muted-foreground shrink-0">Si</span>
                                  <select
                                    value={rule.condition}
                                    onChange={(e) => handleUpdateRule(agent, rule.id, "condition", e.target.value)}
                                    className="rounded-lg border border-border bg-card text-foreground px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                                  >
                                    {RULE_CONDITIONS.map((c) => (
                                      <option key={c.id} value={c.id}>{c.label}</option>
                                    ))}
                                  </select>
                                  {rule.condition !== "new_supplier" && (
                                    <>
                                      <input
                                        type="number"
                                        value={rule.threshold}
                                        onChange={(e) => handleUpdateRule(agent, rule.id, "threshold", Number(e.target.value))}
                                        className="w-16 rounded-lg border border-border bg-card text-foreground px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/30 text-center"
                                      />
                                      <span className="text-muted-foreground text-xs">{rule.condition.includes("score") ? "pts" : "%"}</span>
                                    </>
                                  )}
                                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <select
                                    value={rule.action}
                                    onChange={(e) => handleUpdateRule(agent, rule.id, "action", e.target.value)}
                                    className="rounded-lg border border-border bg-card text-foreground px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                                  >
                                    {RULE_ACTIONS.map((a) => (
                                      <option key={a.id} value={a.id}>{a.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <button
                                  onClick={() => handleDeleteRule(agent, rule.id)}
                                  className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Run history ────────────────────────── */}
                    <div className="border-t p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Últimas ejecuciones</h4>
                        <Button
                          size="sm" className="h-7 text-xs gradient-brand border-0 text-white"
                          onClick={(e) => handleTrigger(agent.id, e)}
                          disabled={triggering === agent.id}
                        >
                          {triggering === agent.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                          Ejecutar ahora
                        </Button>
                      </div>
                      {loadingRuns === agent.id ? (
                        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
                        </div>
                      ) : agentRuns.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-3">Sin ejecuciones todavía.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {agentRuns.slice(0, 5).map((run) => {
                            const sCfg = STATUS_CONFIG[run.status] || STATUS_CONFIG.completed;
                            const SIcon = sCfg.icon;
                            return (
                              <div
                                key={run.id}
                                className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
                                onClick={() => loadRunDetail(agent, run.id)}
                              >
                                <SIcon className={`h-4 w-4 ${sCfg.color} shrink-0 ${run.status === "running" ? "animate-spin" : ""}`} />
                                <span className="text-sm flex-1 truncate">
                                  {run.findings_summary || sCfg.label}
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                  {run.findings_count > 0 && (
                                    <Badge variant="secondary" className="text-[10px] h-5">{run.findings_count}</Badge>
                                  )}
                                  <span className="text-[11px] text-muted-foreground">{formatDate(run.started_at)}</span>
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
