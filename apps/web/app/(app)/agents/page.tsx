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
  Eye,
  Search,
  Bell,
  Mail,
  FileText,
  Plus,
  Trash2,
  ArrowRight,
  GitBranch,
  Workflow,
  Diamond,
  Sparkles,
} from "lucide-react";

// ── Node type definitions for visual workflow ────────────────────────

type NodeType = "trigger" | "condition" | "action" | "output";

interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  icon: typeof Eye;
  description: string;
  color: string;
}

const NODE_STYLES: Record<NodeType, { bg: string; border: string; iconBg: string; label: string }> = {
  trigger: {
    bg: "bg-emerald-500/5 dark:bg-emerald-500/10",
    border: "border-emerald-500/30 hover:border-emerald-500/60",
    iconBg: "bg-emerald-500",
    label: "Trigger",
  },
  condition: {
    bg: "bg-amber-500/5 dark:bg-amber-500/10",
    border: "border-amber-500/30 hover:border-amber-500/60",
    iconBg: "bg-amber-500",
    label: "Condición",
  },
  action: {
    bg: "bg-blue-500/5 dark:bg-blue-500/10",
    border: "border-blue-500/30 hover:border-blue-500/60",
    iconBg: "bg-blue-500",
    label: "Acción",
  },
  output: {
    bg: "bg-purple-500/5 dark:bg-purple-500/10",
    border: "border-purple-500/30 hover:border-purple-500/60",
    iconBg: "bg-purple-500",
    label: "Output",
  },
};

// ── Agent metadata ─────────────────────────────────────────────────

const AGENT_META: Record<string, {
  icon: typeof TrendingUp;
  color: string;
  gradient: string;
  description: string;
  nodes: WorkflowNode[];
}> = {
  price_monitor: {
    icon: TrendingUp,
    color: "text-blue-500",
    gradient: "from-blue-500 to-cyan-500",
    description: "Detecta alzas de precios, busca alternativas más baratas y genera recomendaciones.",
    nodes: [
      { id: "trigger", type: "trigger", label: "Factura procesada", icon: FileText, description: "Se activa al procesar una nueva factura", color: "emerald" },
      { id: "observe", type: "condition", label: "Analizar precios", icon: Eye, description: "Compara precio actual vs histórico", color: "amber" },
      { id: "detect", type: "condition", label: "Detectar alza > umbral", icon: TrendingUp, description: "Identifica incrementos sobre el % configurado", color: "amber" },
      { id: "alternatives", type: "action", label: "Buscar alternativas", icon: Search, description: "Encuentra proveedores más económicos", color: "blue" },
      { id: "alert", type: "action", label: "Crear alerta", icon: Bell, description: "Genera alerta en el sistema", color: "blue" },
      { id: "notify", type: "output", label: "Enviar notificación", icon: Mail, description: "Envía email con hallazgos", color: "purple" },
    ],
  },
  supplier_eval: {
    icon: Shield,
    color: "text-purple-500",
    gradient: "from-purple-500 to-pink-500",
    description: "Califica proveedores por precio, consistencia y cumplimiento de acuerdos.",
    nodes: [
      { id: "trigger", type: "trigger", label: "Factura procesada", icon: FileText, description: "Se activa al procesar una nueva factura", color: "emerald" },
      { id: "observe", type: "condition", label: "Recopilar datos", icon: Eye, description: "Analiza historial del proveedor", color: "amber" },
      { id: "score", type: "condition", label: "Calcular score", icon: Activity, description: "Puntúa competitividad y consistencia", color: "amber" },
      { id: "compliance", type: "action", label: "Verificar acuerdos", icon: Shield, description: "Compara precios vs. negociados", color: "blue" },
      { id: "alert", type: "action", label: "Alertar críticos", icon: Bell, description: "Genera alerta si score < umbral", color: "blue" },
      { id: "report", type: "output", label: "Reporte ejecutivo", icon: FileText, description: "Resumen con recomendaciones", color: "purple" },
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
  { id: "price_increase", label: "Precio sube más de", unit: "%" },
  { id: "price_decrease", label: "Precio baja más de", unit: "%" },
  { id: "supplier_score_below", label: "Score proveedor menor a", unit: "pts" },
  { id: "new_supplier", label: "Nuevo proveedor detectado", unit: "" },
  { id: "volume_spike", label: "Volumen aumenta más de", unit: "%" },
];

const RULE_ACTIONS = [
  { id: "create_alert", label: "Crear alerta", icon: Bell, color: "amber" },
  { id: "send_email", label: "Enviar email", icon: Mail, color: "blue" },
  { id: "send_email_urgent", label: "Email urgente", icon: Zap, color: "red" },
  { id: "block_supplier", label: "Marcar proveedor", icon: Shield, color: "purple" },
];

// ── Types ──────────────────────────────────────────────────────────

interface CustomRule {
  id: string;
  condition: string;
  threshold: number;
  action: string;
}

// ── SVG Connector Line ─────────────────────────────────────────────

function ConnectorLine({ animated = false }: { animated?: boolean }) {
  return (
    <div className="flex items-center w-8 shrink-0 relative">
      <svg width="32" height="24" className="overflow-visible">
        <defs>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <line x1="0" y1="12" x2="32" y2="12" stroke="url(#lineGrad)" strokeWidth="2" strokeDasharray={animated ? "4 4" : "none"}>
          {animated && (
            <animate attributeName="stroke-dashoffset" from="8" to="0" dur="0.6s" repeatCount="indefinite" />
          )}
        </line>
        <polygon points="28,8 32,12 28,16" fill="currentColor" opacity="0.5" />
      </svg>
    </div>
  );
}

// ── Workflow Node Component ─────────────────────────────────────────

function WorkflowNodeCard({ node, isActive }: { node: WorkflowNode; isActive?: boolean }) {
  const style = NODE_STYLES[node.type];
  const NodeIcon = node.icon;

  return (
    <div className="group relative">
      <div className={`
        relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all duration-300 cursor-default w-[110px]
        ${style.bg} ${style.border}
        ${isActive ? "shadow-lg scale-105 ring-2 ring-offset-2 ring-offset-background ring-primary/30" : "shadow-sm hover:shadow-md hover:scale-[1.02]"}
      `}>
        {/* Port indicator (top) */}
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Icon */}
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${style.iconBg} shadow-md`}>
          <NodeIcon className="h-4 w-4 text-white" />
        </div>

        {/* Label */}
        <p className="text-[11px] font-semibold text-center leading-tight line-clamp-2">{node.label}</p>

        {/* Type badge */}
        <span className={`text-[9px] uppercase font-bold tracking-wider opacity-60`}>{style.label}</span>

        {/* Port indicator (bottom) */}
        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Hover tooltip */}
      <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0 bg-popover border rounded-xl px-3 py-2 text-xs shadow-xl whitespace-nowrap z-50 pointer-events-none">
        <div className="font-medium">{node.label}</div>
        <div className="text-muted-foreground">{node.description}</div>
      </div>
    </div>
  );
}

// ── Rule Builder Block (visual) ─────────────────────────────────────

function RuleBlock({ rule, onUpdate, onDelete }: {
  rule: CustomRule;
  onUpdate: (field: string, value: any) => void;
  onDelete: () => void;
}) {
  const condObj = RULE_CONDITIONS.find((c) => c.id === rule.condition);
  const actObj = RULE_ACTIONS.find((a) => a.id === rule.action);
  const ActIcon = actObj?.icon || Bell;

  return (
    <div className="group relative">
      {/* Rule card with visual blocks */}
      <div className="flex items-stretch gap-0 rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm hover:shadow-md transition-all">
        {/* Condition block */}
        <div className="flex-1 p-3 bg-amber-500/5 dark:bg-amber-500/10 border-r border-border/40">
          <div className="flex items-center gap-1.5 mb-2">
            <Diamond className="h-3 w-3 text-amber-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Si</span>
          </div>
          <select
            value={rule.condition}
            onChange={(e) => onUpdate("condition", e.target.value)}
            className="w-full rounded-lg border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 text-foreground px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-amber-500/30 mb-2"
          >
            {RULE_CONDITIONS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          {rule.condition !== "new_supplier" && (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={rule.threshold}
                onChange={(e) => onUpdate("threshold", Number(e.target.value))}
                className="w-16 rounded-lg border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 text-foreground px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-amber-500/30 text-center font-mono font-bold"
              />
              <span className="text-[10px] text-muted-foreground font-medium">{condObj?.unit}</span>
            </div>
          )}
        </div>

        {/* Arrow connector */}
        <div className="flex items-center px-2 bg-muted/30">
          <div className="flex flex-col items-center gap-0.5">
            <div className="h-px w-4 bg-border" />
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <div className="h-px w-4 bg-border" />
          </div>
        </div>

        {/* Action block */}
        <div className="flex-1 p-3 bg-blue-500/5 dark:bg-blue-500/10">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="h-3 w-3 text-blue-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Entonces</span>
          </div>
          <select
            value={rule.action}
            onChange={(e) => onUpdate("action", e.target.value)}
            className="w-full rounded-lg border border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10 text-foreground px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {RULE_ACTIONS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 mt-2">
            <div className={`h-5 w-5 rounded-md flex items-center justify-center ${
              actObj?.color === "red" ? "bg-red-500/20" :
              actObj?.color === "purple" ? "bg-purple-500/20" :
              actObj?.color === "amber" ? "bg-amber-500/20" : "bg-blue-500/20"
            }`}>
              <ActIcon className={`h-3 w-3 ${
                actObj?.color === "red" ? "text-red-500" :
                actObj?.color === "purple" ? "text-purple-500" :
                actObj?.color === "amber" ? "text-amber-500" : "text-blue-500"
              }`} />
            </div>
            <span className="text-[10px] text-muted-foreground">{actObj?.label}</span>
          </div>
        </div>

        {/* Delete button */}
        <button
          onClick={onDelete}
          className="px-3 flex items-center justify-center hover:bg-destructive/10 transition-colors border-l border-border/40"
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground group-hover:text-destructive transition-colors" />
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const [selectedRun, setSelectedRun] = useState<AgentRunDetail | null>(null);
  const [runs, setRuns] = useState<Record<string, AgentRun[]>>({});
  const [loadingRuns, setLoadingRuns] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "detail" | "run">("list");
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

  const handleTrigger = async (agentId: string) => {
    setTriggering(agentId);
    try {
      await api.post(`/agents/${agentId}/trigger`, {});
      toast("success", "Agente ejecutado exitosamente");
      await fetchAgents();
      await loadRuns_(agentId);
    } catch (err: any) {
      toast("error", err.message || "Error al ejecutar agente");
    } finally {
      setTriggering(null);
    }
  };

  const handleToggle = async (agent: AgentConfig) => {
    try {
      await api.put<AgentConfig>(`/agents/${agent.id}`, { is_enabled: !agent.is_enabled });
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, is_enabled: !a.is_enabled } : a)));
      if (selectedAgent?.id === agent.id) setSelectedAgent({ ...agent, is_enabled: !agent.is_enabled });
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
      if (selectedAgent?.id === agent.id) setSelectedAgent({ ...agent, config: newConfig });
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
      if (selectedAgent?.id === agent.id) setSelectedAgent({ ...agent, config: newConfig });
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
      if (selectedAgent?.id === agent.id) setSelectedAgent({ ...agent, config: newConfig });
    } catch {}
  };

  const handleDeleteRule = async (agent: AgentConfig, ruleId: string) => {
    const currentRules: CustomRule[] = agent.config?.rules || [];
    const newConfig = { ...agent.config, rules: currentRules.filter((r) => r.id !== ruleId) };
    try {
      await api.put(`/agents/${agent.id}`, { config: newConfig });
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, config: newConfig } : a)));
      if (selectedAgent?.id === agent.id) setSelectedAgent({ ...agent, config: newConfig });
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
      setView("run");
    } catch (err) { console.error(err); }
  };

  const openAgentDetail = (agent: AgentConfig) => {
    setSelectedAgent(agent);
    setView("detail");
    if (!runs[agent.id]) loadRuns_(agent.id);
  };

  // ── Run Detail View ──────────────────────────────────────────────

  if (view === "run" && selectedRun && selectedAgent) {
    const statusCfg = STATUS_CONFIG[selectedRun.status] || STATUS_CONFIG.completed;
    const StatusIcon = statusCfg.icon;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setView("detail")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Button>
          <div className="flex items-center gap-2">
            <StatusIcon className={`h-4 w-4 ${statusCfg.color} ${selectedRun.status === "running" ? "animate-spin" : ""}`} />
            <span className="font-medium">{statusCfg.label}</span>
          </div>
          <span className="text-sm text-muted-foreground">{formatDate(selectedRun.started_at)}</span>
        </div>

        {selectedRun.findings_summary && (
          <Card className="border-0 shadow-md bg-gradient-to-r from-primary/5 to-transparent">
            <CardContent className="py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm mb-1">Resumen del Agente</p>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{selectedRun.findings_summary}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1.5"><Activity className="h-3 w-3" />{selectedRun.findings_count} hallazgos</Badge>
          <Badge variant="outline" className="gap-1.5"><Zap className="h-3 w-3" />{selectedRun.actions_count} acciones</Badge>
          <Badge variant="outline" className="capitalize gap-1.5"><GitBranch className="h-3 w-3" />{selectedRun.trigger}</Badge>
        </div>

        {selectedRun.error_message && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
            <p className="text-sm text-red-600 dark:text-red-400">{selectedRun.error_message}</p>
          </div>
        )}

        <div className="space-y-3">
          {selectedRun.findings.map((f) => {
            const sevCfg = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.info;
            const SevIcon = sevCfg.icon;
            const alternatives = f.data?.alternatives as Array<{ name: string; avg_price: number }> | undefined;
            return (
              <div key={f.id} className={`rounded-2xl border p-4 ${
                f.severity === "critical" ? "border-red-500/30 bg-red-500/5" :
                f.severity === "warning" ? "border-amber-500/30 bg-amber-500/5" :
                "border-blue-500/30 bg-blue-500/5"
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 rounded-xl ${sevCfg.bg} p-2.5`}>
                    <SevIcon className={`h-4 w-4 ${sevCfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm">{f.title}</p>
                      <Badge variant="outline" className="text-[10px]">{sevCfg.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{f.description}</p>
                    {alternatives && alternatives.length > 0 && (
                      <div className="mt-3 rounded-xl bg-green-500/5 border border-green-500/20 p-3">
                        <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1.5">Alternativas detectadas</p>
                        {alternatives.map((alt, i) => (
                          <p key={i} className="text-sm text-muted-foreground">
                            {alt.name}: <span className="font-medium font-mono">${alt.avg_price?.toLocaleString("es-CO")}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {selectedRun.findings.length === 0 && (
            <div className="rounded-2xl border border-dashed border-green-500/30 p-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <p className="font-semibold">Sin hallazgos</p>
              <p className="text-sm text-muted-foreground mt-1">No se detectaron anomalías en esta ejecución.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Agent Detail View ────────────────────────────────────────────

  if (view === "detail" && selectedAgent) {
    const meta = AGENT_META[selectedAgent.agent_type] || AGENT_META.price_monitor;
    const Icon = meta.icon;
    const actions = PREDEFINED_ACTIONS[selectedAgent.agent_type] || [];
    const agentActions = selectedAgent.config?.actions || {};
    const agentRules: CustomRule[] = selectedAgent.config?.rules || [];
    const agentRuns = runs[selectedAgent.id] || [];

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setView("list"); setSelectedAgent(null); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Agentes
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.gradient} shadow-xl`}>
              <Icon className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold">{selectedAgent.name}</h2>
                <Badge variant={selectedAgent.is_enabled ? "default" : "secondary"}>
                  {selectedAgent.is_enabled ? "Activo" : "Inactivo"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{meta.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleToggle(selectedAgent)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shadow-inner ${
                selectedAgent.is_enabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                selectedAgent.is_enabled ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
            <Button
              onClick={() => handleTrigger(selectedAgent.id)}
              disabled={triggering === selectedAgent.id}
              className="gradient-brand border-0 text-white shadow-lg"
            >
              {triggering === selectedAgent.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Ejecutar
            </Button>
          </div>
        </div>

        {/* ── Visual Workflow Canvas ───────────────────────────── */}
        <div className="relative rounded-3xl border border-border/50 bg-muted/20 dark:bg-muted/10 overflow-hidden">
          {/* Dot grid background */}
          <div className="absolute inset-0 opacity-30 dark:opacity-20" style={{
            backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }} />

          <div className="relative p-6">
            <div className="flex items-center gap-2 mb-5">
              <Workflow className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pipeline de ejecución</h3>
            </div>

            {/* Nodes flow */}
            <div className="flex items-center gap-0 overflow-x-auto pb-4 px-2">
              {meta.nodes.map((node, i) => (
                <div key={node.id} className="flex items-center shrink-0">
                  <WorkflowNodeCard node={node} isActive={triggering === selectedAgent.id} />
                  {i < meta.nodes.length - 1 && <ConnectorLine animated={triggering === selectedAgent.id} />}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Actions & Rules Grid ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Actions Panel */}
          <div className="rounded-3xl border border-border/50 bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold">Acciones del agente</h3>
            </div>
            <div className="space-y-2">
              {actions.map((action) => {
                const ActionIcon = action.icon;
                const enabled = agentActions[action.id] !== false;
                return (
                  <div
                    key={action.id}
                    className={`flex items-center gap-3 rounded-2xl p-3 border transition-all ${
                      enabled
                        ? "border-primary/20 bg-primary/5"
                        : "border-border/40 bg-muted/20 opacity-60"
                    }`}
                  >
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                      enabled ? "bg-primary/15" : "bg-muted"
                    }`}>
                      <ActionIcon className={`h-4 w-4 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{action.label}</p>
                      <p className="text-[11px] text-muted-foreground">{action.description}</p>
                    </div>
                    <button
                      onClick={() => handleActionToggle(selectedAgent, action.id)}
                      className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors shrink-0 ${
                        enabled ? "bg-primary" : "bg-muted-foreground/20"
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform`}
                        style={{ transform: `translateX(${enabled ? "20px" : "3px"})` }}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rules Panel */}
          <div className="rounded-3xl border border-border/50 bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold">Reglas de automatización</h3>
              </div>
              <Button
                variant="outline" size="sm" className="h-7 text-xs rounded-xl"
                onClick={() => handleAddRule(selectedAgent)}
              >
                <Plus className="h-3 w-3 mr-1" /> Nueva regla
              </Button>
            </div>

            {agentRules.length === 0 ? (
              <div
                className="rounded-2xl border-2 border-dashed border-muted-foreground/15 p-8 text-center cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all group"
                onClick={() => handleAddRule(selectedAgent)}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted mx-auto mb-3 group-hover:bg-primary/10 transition-colors">
                  <GitBranch className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Sin reglas configuradas</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Crea reglas tipo "Si X entonces Y" para automatizar decisiones</p>
              </div>
            ) : (
              <div className="space-y-3">
                {agentRules.map((rule) => (
                  <RuleBlock
                    key={rule.id}
                    rule={rule}
                    onUpdate={(field, value) => handleUpdateRule(selectedAgent, rule.id, field, value)}
                    onDelete={() => handleDeleteRule(selectedAgent, rule.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Run History ─────────────────────────────────────────── */}
        <div className="rounded-3xl border border-border/50 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold">Historial de ejecuciones</h3>
            </div>
            {agentRuns.length > 0 && (
              <Badge variant="outline" className="text-[10px]">{agentRuns.length} runs</Badge>
            )}
          </div>

          {loadingRuns === selectedAgent.id ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando historial...
            </div>
          ) : agentRuns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-muted-foreground/15 p-6 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Sin ejecuciones todavía</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Ejecuta el agente para ver resultados aquí</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {agentRuns.slice(0, 8).map((run) => {
                const sCfg = STATUS_CONFIG[run.status] || STATUS_CONFIG.completed;
                const SIcon = sCfg.icon;
                return (
                  <div
                    key={run.id}
                    className="flex items-center gap-3 rounded-2xl p-3 hover:bg-muted/50 cursor-pointer transition-all group"
                    onClick={() => loadRunDetail(selectedAgent, run.id)}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                      run.status === "completed" ? "bg-green-500/10" :
                      run.status === "failed" ? "bg-red-500/10" : "bg-muted"
                    }`}>
                      <SIcon className={`h-4 w-4 ${sCfg.color} ${run.status === "running" ? "animate-spin" : ""}`} />
                    </div>
                    <span className="text-sm flex-1 truncate">
                      {run.findings_summary || sCfg.label}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {run.findings_count > 0 && (
                        <Badge variant="secondary" className="text-[10px] h-5 rounded-lg">{run.findings_count} hallazgos</Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">{formatDate(run.started_at)}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Agent List View (Main) ──────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-brand shadow-lg">
              <Bot className="h-5 w-5 text-white" />
            </div>
            Agentes
          </h1>
          <p className="text-muted-foreground mt-1.5">Agentes autónomos con IA — configura pipelines, reglas y acciones</p>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={2} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => {
            const meta = AGENT_META[agent.agent_type] || AGENT_META.price_monitor;
            const Icon = meta.icon;
            const lastStatus = STATUS_CONFIG[agent.last_run_status || ""] || null;

            return (
              <div
                key={agent.id}
                onClick={() => openAgentDetail(agent)}
                className={`group relative rounded-3xl border border-border/50 bg-card p-6 cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/20 hover:-translate-y-0.5 ${
                  !agent.is_enabled ? "opacity-60" : ""
                }`}
              >
                {/* Status indicator */}
                <div className={`absolute top-4 right-4 h-2.5 w-2.5 rounded-full ${
                  agent.is_enabled ? "bg-green-500 shadow-lg shadow-green-500/30" : "bg-muted-foreground/30"
                }`}>
                  {agent.is_enabled && (
                    <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-30" />
                  )}
                </div>

                {/* Agent icon */}
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.gradient} shadow-xl mb-4 transition-transform group-hover:scale-110`}>
                  <Icon className="h-7 w-7 text-white" />
                </div>

                {/* Info */}
                <h3 className="text-lg font-bold mb-1">{agent.name}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{meta.description}</p>

                {/* Mini workflow preview */}
                <div className="flex items-center gap-1 mb-4 opacity-60">
                  {meta.nodes.slice(0, 5).map((node, i) => {
                    const NodeIcon = node.icon;
                    const style = NODE_STYLES[node.type];
                    return (
                      <div key={node.id} className="flex items-center">
                        <div className={`flex h-6 w-6 items-center justify-center rounded-lg ${style.iconBg}`}>
                          <NodeIcon className="h-3 w-3 text-white" />
                        </div>
                        {i < 4 && i < meta.nodes.length - 1 && (
                          <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/40 mx-0.5" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Footer stats */}
                <div className="flex items-center gap-3 pt-3 border-t border-border/40">
                  {lastStatus && (
                    <div className="flex items-center gap-1.5">
                      <lastStatus.icon className={`h-3.5 w-3.5 ${lastStatus.color}`} />
                      <span className="text-xs text-muted-foreground">{lastStatus.label}</span>
                    </div>
                  )}
                  {agent.last_run_findings != null && agent.last_run_findings > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-5 rounded-lg">{agent.last_run_findings} hallazgos</Badge>
                  )}
                  <div className="ml-auto">
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5" />
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
