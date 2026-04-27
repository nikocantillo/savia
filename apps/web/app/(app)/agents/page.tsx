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
  ArrowRight,
  GitBranch,
  Workflow,
  Diamond,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  PauseCircle,
  Settings,
} from "lucide-react";

// ── Pipeline node definition ────────────────────────────────────────

type NodeType = "trigger" | "condition" | "action" | "output";

interface PipelineNodeDef {
  id: string;
  type: NodeType;
  label: string;
  icon: typeof Eye;
  description: string;
  configurable: boolean;
  params?: { key: string; label: string; type: "number" | "boolean" | "select"; unit?: string; default: any; options?: { value: string; label: string }[] }[];
}

const NODE_COLORS: Record<NodeType, {
  bg: string; bgActive: string; border: string; borderActive: string;
  iconBg: string; iconBgDim: string; text: string; ring: string;
}> = {
  trigger: {
    bg: "bg-emerald-500/5", bgActive: "bg-emerald-500/10",
    border: "border-emerald-500/20", borderActive: "border-emerald-500/50",
    iconBg: "bg-emerald-500", iconBgDim: "bg-emerald-500/30",
    text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/30",
  },
  condition: {
    bg: "bg-amber-500/5", bgActive: "bg-amber-500/10",
    border: "border-amber-500/20", borderActive: "border-amber-500/50",
    iconBg: "bg-amber-500", iconBgDim: "bg-amber-500/30",
    text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/30",
  },
  action: {
    bg: "bg-blue-500/5", bgActive: "bg-blue-500/10",
    border: "border-blue-500/20", borderActive: "border-blue-500/50",
    iconBg: "bg-blue-500", iconBgDim: "bg-blue-500/30",
    text: "text-blue-600 dark:text-blue-400", ring: "ring-blue-500/30",
  },
  output: {
    bg: "bg-purple-500/5", bgActive: "bg-purple-500/10",
    border: "border-purple-500/20", borderActive: "border-purple-500/50",
    iconBg: "bg-purple-500", iconBgDim: "bg-purple-500/30",
    text: "text-purple-600 dark:text-purple-400", ring: "ring-purple-500/30",
  },
};

const TYPE_LABELS: Record<NodeType, string> = {
  trigger: "Trigger",
  condition: "Condición",
  action: "Acción",
  output: "Salida",
};

// ── Agent pipelines ────────────────────────────────────────────────

const AGENT_PIPELINES: Record<string, PipelineNodeDef[]> = {
  price_monitor: [
    {
      id: "trigger", type: "trigger", label: "Nueva factura", icon: FileText,
      description: "El pipeline se activa cada vez que una factura es procesada exitosamente.",
      configurable: false,
    },
    {
      id: "observe", type: "condition", label: "Cargar historial", icon: Eye,
      description: "Recopila el historial de precios de todos los productos de la organización para el periodo configurado.",
      configurable: true,
      params: [
        { key: "lookback_days", label: "Días de historial", type: "number", unit: "días", default: 30 },
      ],
    },
    {
      id: "detect", type: "condition", label: "Detectar alzas", icon: TrendingUp,
      description: "Compara el precio más reciente de cada producto contra su promedio histórico. Si la diferencia supera el umbral, se marca como alza.",
      configurable: true,
      params: [
        { key: "threshold_pct", label: "Umbral de alza", type: "number", unit: "%", default: 5 },
      ],
    },
    {
      id: "alternatives", type: "action", label: "Buscar alternativas", icon: Search,
      description: "Para cada producto con alza detectada, busca el mismo producto en otros proveedores y compara precios.",
      configurable: true,
      params: [
        { key: "find_alternatives", label: "Buscar alternativas", type: "boolean", default: true },
      ],
    },
    {
      id: "alert", type: "action", label: "Crear alertas", icon: Bell,
      description: "Genera alertas en el sistema para hallazgos de severidad 'warning' y 'critical'. Las alertas aparecen en la sección de Alertas.",
      configurable: true,
      params: [
        { key: "create_alert", label: "Crear alertas", type: "boolean", default: true },
      ],
    },
    {
      id: "notify", type: "output", label: "Email", icon: Mail,
      description: "Envía un correo electrónico con un resumen de hallazgos críticos al administrador de la organización.",
      configurable: true,
      params: [
        { key: "auto_email", label: "Enviar email automático", type: "boolean", default: true },
      ],
    },
  ],
  supplier_eval: [
    {
      id: "trigger", type: "trigger", label: "Nueva factura", icon: FileText,
      description: "El pipeline se activa cada vez que una factura es procesada exitosamente.",
      configurable: false,
    },
    {
      id: "observe", type: "condition", label: "Recopilar datos", icon: Eye,
      description: "Analiza todas las facturas del proveedor en el periodo para calcular métricas de rendimiento.",
      configurable: true,
      params: [
        { key: "lookback_days", label: "Días de historial", type: "number", unit: "días", default: 60 },
        { key: "min_invoices", label: "Mín. facturas para evaluar", type: "number", unit: "facturas", default: 2 },
      ],
    },
    {
      id: "score", type: "condition", label: "Calcular score", icon: Activity,
      description: "Calcula un puntaje (0-100) por proveedor basado en competitividad de precios, consistencia y cumplimiento de acuerdos negociados.",
      configurable: true,
      params: [
        { key: "score_threshold", label: "Umbral mínimo de score", type: "number", unit: "pts", default: 50 },
      ],
    },
    {
      id: "compliance", type: "action", label: "Verificar acuerdos", icon: Shield,
      description: "Compara los precios reales cobrados contra los precios negociados registrados. Identifica incumplimientos.",
      configurable: true,
      params: [
        { key: "check_compliance", label: "Verificar cumplimiento", type: "boolean", default: true },
      ],
    },
    {
      id: "alert", type: "action", label: "Alertar críticos", icon: Bell,
      description: "Genera alertas para proveedores con score bajo o violaciones de precios negociados.",
      configurable: true,
      params: [
        { key: "create_alert", label: "Crear alertas", type: "boolean", default: true },
      ],
    },
    {
      id: "report", type: "output", label: "Reporte", icon: FileText,
      description: "Genera un resumen ejecutivo con rankings de proveedores, identificando los mejores y peores evaluados.",
      configurable: true,
      params: [
        { key: "generate_report", label: "Generar reporte", type: "boolean", default: true },
      ],
    },
  ],
};

const AGENT_META: Record<string, { icon: typeof TrendingUp; gradient: string; description: string }> = {
  price_monitor: {
    icon: TrendingUp,
    gradient: "from-blue-500 to-cyan-500",
    description: "Detecta alzas de precios, busca alternativas más baratas y genera recomendaciones.",
  },
  supplier_eval: {
    icon: Shield,
    gradient: "from-purple-500 to-pink-500",
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

const RULE_CONDITIONS = [
  { id: "price_increase", label: "Precio sube más de", unit: "%" },
  { id: "price_decrease", label: "Precio baja más de", unit: "%" },
  { id: "supplier_score_below", label: "Score proveedor menor a", unit: "pts" },
  { id: "new_supplier", label: "Nuevo proveedor detectado", unit: "" },
  { id: "volume_spike", label: "Volumen aumenta más de", unit: "%" },
];

const RULE_ACTIONS_LIST = [
  { id: "create_alert", label: "Crear alerta", icon: Bell, color: "amber" },
  { id: "send_email", label: "Enviar email", icon: Mail, color: "blue" },
  { id: "send_email_urgent", label: "Email urgente", icon: Zap, color: "red" },
];

interface CustomRule {
  id: string;
  condition: string;
  threshold: number;
  action: string;
}

// ── Interactive Pipeline Node ────────────────────────────────────────

function PipelineNode({
  node, isSelected, isEnabled, isExecuting, stepIndex, totalSteps,
  nodeConfig, onClick, onToggle, onParamChange,
}: {
  node: PipelineNodeDef;
  isSelected: boolean;
  isEnabled: boolean;
  isExecuting: boolean;
  stepIndex: number;
  totalSteps: number;
  nodeConfig: Record<string, any>;
  onClick: () => void;
  onToggle: () => void;
  onParamChange: (key: string, value: any) => void;
}) {
  const c = NODE_COLORS[node.type];
  const NodeIcon = node.icon;

  return (
    <div className="flex flex-col items-center shrink-0">
      {/* The node */}
      <div
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={`
          relative flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all duration-300 w-[120px] cursor-pointer select-none
          ${isEnabled ? c.bgActive : "bg-muted/30"}
          ${isSelected ? `${c.borderActive} shadow-lg ring-2 ring-offset-2 ring-offset-background ${c.ring}` : `${c.border} hover:shadow-md`}
          ${!isEnabled && "opacity-50"}
          ${isExecuting ? "animate-pulse" : ""}
        `}
      >
        {/* Step number */}
        <div className={`absolute -top-2.5 -left-2.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shadow-sm ${
          isEnabled ? `${c.iconBg} text-white` : "bg-muted text-muted-foreground"
        }`}>
          {stepIndex + 1}
        </div>

        {/* Enable/disable indicator */}
        {node.configurable && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="absolute -top-2 -right-2 z-10"
            title={isEnabled ? "Desactivar paso" : "Activar paso"}
          >
            {isEnabled ? (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 shadow-md">
                <CheckCircle2 className="h-3 w-3 text-white" />
              </div>
            ) : (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted-foreground/40 shadow-md">
                <PauseCircle className="h-3 w-3 text-white" />
              </div>
            )}
          </button>
        )}

        {/* Icon */}
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-md transition-all ${
          isEnabled ? c.iconBg : c.iconBgDim
        }`}>
          <NodeIcon className="h-5 w-5 text-white" />
        </div>

        {/* Label */}
        <p className="text-[11px] font-semibold text-center leading-tight mt-0.5">{node.label}</p>

        {/* Type tag */}
        <span className={`text-[9px] font-bold uppercase tracking-wider ${c.text} opacity-70`}>{TYPE_LABELS[node.type]}</span>

        {/* Config indicator */}
        {node.configurable && isSelected && (
          <div className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45 border-b-2 border-r-2 bg-card ${c.borderActive}`} />
        )}
      </div>

      {/* Inline config panel (expands below the node) */}
      {isSelected && node.configurable && (
        <div className={`mt-3 w-72 rounded-2xl border-2 ${c.borderActive} bg-card shadow-xl p-4 animate-in fade-in slide-in-from-top-2 duration-200 z-10`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Settings className={`h-3.5 w-3.5 ${c.text}`} />
              <span className="text-xs font-bold">Configuración</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-all ${
                isEnabled ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"
              }`}
            >
              {isEnabled ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}
              {isEnabled ? "Activo" : "Inactivo"}
            </button>
          </div>

          {/* Description */}
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-3 border-b border-border/40 pb-3">
            {node.description}
          </p>

          {/* Parameters */}
          {node.params && node.params.length > 0 && (
            <div className="space-y-3">
              {node.params.map((param) => {
                const value = nodeConfig[param.key] ?? param.default;

                if (param.type === "boolean") {
                  return (
                    <div key={param.key} className="flex items-center justify-between">
                      <span className="text-xs font-medium">{param.label}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onParamChange(param.key, !value); }}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          value ? "bg-primary" : "bg-muted-foreground/20"
                        }`}
                      >
                        <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                          style={{ transform: `translateX(${value ? "16px" : "3px"})` }}
                        />
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={param.key}>
                    <label className="text-xs font-medium block mb-1">{param.label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={value}
                        onChange={(e) => onParamChange(param.key, Number(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                        className={`flex-1 rounded-xl border ${c.border} bg-transparent px-3 py-1.5 text-sm font-mono font-bold outline-none focus:ring-2 ${c.ring} text-center`}
                      />
                      {param.unit && (
                        <span className="text-[11px] text-muted-foreground font-medium shrink-0">{param.unit}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Connector ────────────────────────────────────────────────────────

function Connector({ active, disabled }: { active: boolean; disabled: boolean }) {
  return (
    <div className={`flex items-center w-10 shrink-0 self-start mt-[38px] ${disabled ? "opacity-30" : ""}`}>
      <svg width="40" height="16" className="overflow-visible">
        <line x1="0" y1="8" x2="36" y2="8" stroke="currentColor" strokeWidth="2"
          strokeDasharray={active ? "4 3" : disabled ? "2 4" : "none"}
          className={disabled ? "text-muted-foreground/30" : "text-muted-foreground/50"}
        >
          {active && <animate attributeName="stroke-dashoffset" from="7" to="0" dur="0.5s" repeatCount="indefinite" />}
        </line>
        <polygon points="34,4 40,8 34,12" fill="currentColor" className={disabled ? "text-muted-foreground/20" : "text-muted-foreground/40"} />
      </svg>
    </div>
  );
}

// ── Rule block ──────────────────────────────────────────────────────

function RuleBlock({ rule, onUpdate, onDelete }: {
  rule: CustomRule;
  onUpdate: (field: string, value: any) => void;
  onDelete: () => void;
}) {
  const condObj = RULE_CONDITIONS.find((c) => c.id === rule.condition);
  const actObj = RULE_ACTIONS_LIST.find((a) => a.id === rule.action);
  const ActIcon = actObj?.icon || Bell;

  return (
    <div className="group flex items-stretch rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm hover:shadow-md transition-all">
      <div className="flex-1 p-3 bg-amber-500/5 dark:bg-amber-500/10 border-r border-border/40">
        <div className="flex items-center gap-1.5 mb-2">
          <Diamond className="h-3 w-3 text-amber-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Si</span>
        </div>
        <select value={rule.condition} onChange={(e) => onUpdate("condition", e.target.value)}
          className="w-full rounded-lg border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 text-foreground px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-amber-500/30 mb-2"
        >
          {RULE_CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        {rule.condition !== "new_supplier" && (
          <div className="flex items-center gap-1.5">
            <input type="number" value={rule.threshold} onChange={(e) => onUpdate("threshold", Number(e.target.value))}
              className="w-16 rounded-lg border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 text-foreground px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-amber-500/30 text-center font-mono font-bold"
            />
            <span className="text-[10px] text-muted-foreground font-medium">{condObj?.unit}</span>
          </div>
        )}
      </div>
      <div className="flex items-center px-2 bg-muted/30">
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className="flex-1 p-3 bg-blue-500/5 dark:bg-blue-500/10">
        <div className="flex items-center gap-1.5 mb-2">
          <Zap className="h-3 w-3 text-blue-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Entonces</span>
        </div>
        <select value={rule.action} onChange={(e) => onUpdate("action", e.target.value)}
          className="w-full rounded-lg border border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10 text-foreground px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          {RULE_ACTIONS_LIST.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <div className="flex items-center gap-1.5 mt-2 opacity-70">
          <ActIcon className="h-3 w-3" />
          <span className="text-[10px]">{actObj?.label}</span>
        </div>
      </div>
      <button onClick={onDelete} className="px-3 flex items-center hover:bg-destructive/10 transition-colors border-l border-border/40">
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground group-hover:text-destructive transition-colors" />
      </button>
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
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [executingStep, setExecutingStep] = useState(-1);
  const { toast } = useToast();

  const fetchAgents = useCallback(async () => {
    try {
      await api.post("/agents/setup", {});
      const data = await api.get<AgentConfig[]>("/agents");
      setAgents(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const updateAgentConfig = async (agent: AgentConfig, newConfig: any) => {
    try {
      await api.put(`/agents/${agent.id}`, { config: newConfig });
      const updated = { ...agent, config: newConfig };
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? updated : a)));
      if (selectedAgent?.id === agent.id) setSelectedAgent(updated);
    } catch (err: any) {
      toast("error", "Error al guardar configuración");
    }
  };

  const handleTrigger = async (agentId: string) => {
    setTriggering(agentId);
    setExecutingStep(0);

    const pipeline = AGENT_PIPELINES[selectedAgent?.agent_type || ""] || [];
    const interval = setInterval(() => {
      setExecutingStep((prev) => {
        if (prev >= pipeline.length - 1) { clearInterval(interval); return prev; }
        return prev + 1;
      });
    }, 800);

    try {
      await api.post(`/agents/${agentId}/trigger`, {});
      clearInterval(interval);
      setExecutingStep(pipeline.length);
      toast("success", "Pipeline ejecutado exitosamente");
      await fetchAgents();
      await loadRuns_(agentId);
      setTimeout(() => setExecutingStep(-1), 2000);
    } catch (err: any) {
      clearInterval(interval);
      setExecutingStep(-1);
      toast("error", err.message || "Error al ejecutar agente");
    } finally {
      setTriggering(null);
    }
  };

  const handleToggle = async (agent: AgentConfig) => {
    try {
      await api.put<AgentConfig>(`/agents/${agent.id}`, { is_enabled: !agent.is_enabled });
      const updated = { ...agent, is_enabled: !agent.is_enabled };
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? updated : a)));
      if (selectedAgent?.id === agent.id) setSelectedAgent(updated);
      toast("success", agent.is_enabled ? "Agente desactivado" : "Agente activado");
    } catch (err: any) {
      toast("error", err.message || "Error al actualizar");
    }
  };

  const handleNodeToggle = (agent: AgentConfig, nodeId: string) => {
    const pipeline = agent.config?.pipeline || {};
    const current = pipeline[nodeId] || {};
    const newPipeline = { ...pipeline, [nodeId]: { ...current, enabled: !(current.enabled ?? true) } };
    updateAgentConfig(agent, { ...agent.config, pipeline: newPipeline });
  };

  const handleNodeParam = (agent: AgentConfig, nodeId: string, key: string, value: any) => {
    const pipeline = agent.config?.pipeline || {};
    const current = pipeline[nodeId] || {};
    const params = current.params || {};
    const newPipeline = { ...pipeline, [nodeId]: { ...current, params: { ...params, [key]: value } } };
    updateAgentConfig(agent, { ...agent.config, pipeline: newPipeline });
  };

  const handleAddRule = (agent: AgentConfig) => {
    const currentRules: CustomRule[] = agent.config?.rules || [];
    const newRule: CustomRule = { id: `rule_${Date.now()}`, condition: "price_increase", threshold: 10, action: "create_alert" };
    updateAgentConfig(agent, { ...agent.config, rules: [...currentRules, newRule] });
  };

  const handleUpdateRule = (agent: AgentConfig, ruleId: string, field: string, value: any) => {
    const rules: CustomRule[] = agent.config?.rules || [];
    const updated = rules.map((r) => (r.id === ruleId ? { ...r, [field]: value } : r));
    updateAgentConfig(agent, { ...agent.config, rules: updated });
  };

  const handleDeleteRule = (agent: AgentConfig, ruleId: string) => {
    const rules: CustomRule[] = agent.config?.rules || [];
    updateAgentConfig(agent, { ...agent.config, rules: rules.filter((r) => r.id !== ruleId) });
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

  const openDetail = (agent: AgentConfig) => {
    setSelectedAgent(agent);
    setView("detail");
    setActiveNode(null);
    setExecutingStep(-1);
    if (!runs[agent.id]) loadRuns_(agent.id);
  };

  // ── Run Detail View ──────────────────────────────────────────────

  if (view === "run" && selectedRun && selectedAgent) {
    const sc = STATUS_CONFIG[selectedRun.status] || STATUS_CONFIG.completed;
    const SIcon = sc.icon;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setView("detail")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Button>
          <div className="flex items-center gap-2">
            <SIcon className={`h-4 w-4 ${sc.color} ${selectedRun.status === "running" ? "animate-spin" : ""}`} />
            <span className="font-medium">{sc.label}</span>
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
            const sv = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.info;
            const SI = sv.icon;
            const alts = f.data?.alternatives as Array<{ name: string; avg_price: number }> | undefined;
            return (
              <div key={f.id} className={`rounded-2xl border p-4 ${
                f.severity === "critical" ? "border-red-500/30 bg-red-500/5" :
                f.severity === "warning" ? "border-amber-500/30 bg-amber-500/5" : "border-blue-500/30 bg-blue-500/5"
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 rounded-xl ${sv.bg} p-2.5`}><SI className={`h-4 w-4 ${sv.color}`} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm">{f.title}</p>
                      <Badge variant="outline" className="text-[10px]">{sv.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{f.description}</p>
                    {alts && alts.length > 0 && (
                      <div className="mt-3 rounded-xl bg-green-500/5 border border-green-500/20 p-3">
                        <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1.5">Alternativas</p>
                        {alts.map((a, i) => (
                          <p key={i} className="text-sm text-muted-foreground">{a.name}: <span className="font-medium font-mono">${a.avg_price?.toLocaleString("es-CO")}</span></p>
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
              <p className="text-sm text-muted-foreground mt-1">No se detectaron anomalías.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Agent Detail + Interactive Pipeline ──────────────────────────

  if (view === "detail" && selectedAgent) {
    const meta = AGENT_META[selectedAgent.agent_type] || AGENT_META.price_monitor;
    const Icon = meta.icon;
    const pipeline = AGENT_PIPELINES[selectedAgent.agent_type] || [];
    const pipelineConfig = selectedAgent.config?.pipeline || {};
    const agentRules: CustomRule[] = selectedAgent.config?.rules || [];
    const agentRuns = runs[selectedAgent.id] || [];

    const enabledCount = pipeline.filter((n) => {
      if (!n.configurable) return true;
      return (pipelineConfig[n.id]?.enabled ?? true);
    }).length;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setView("list"); setSelectedAgent(null); setActiveNode(null); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Agentes
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={() => handleToggle(selectedAgent)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shadow-inner ${
                selectedAgent.is_enabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                selectedAgent.is_enabled ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
            <Button onClick={() => handleTrigger(selectedAgent.id)} disabled={triggering === selectedAgent.id}
              className="gradient-brand border-0 text-white shadow-lg"
            >
              {triggering === selectedAgent.id
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Play className="h-4 w-4 mr-2" />
              }
              Ejecutar pipeline
            </Button>
          </div>
        </div>

        {/* ── Interactive Pipeline Canvas ──────────────────────── */}
        <div className="relative rounded-3xl border border-border/50 overflow-hidden">
          {/* Dot grid */}
          <div className="absolute inset-0 opacity-[0.08]" style={{
            backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }} />

          <div className="relative p-5 sm:p-6">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pipeline interactivo</h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground">
                  <span className="font-bold text-foreground">{enabledCount}</span>/{pipeline.length} pasos activos
                </span>
                {/* Node type legend */}
                <div className="hidden sm:flex items-center gap-2">
                  {(["trigger", "condition", "action", "output"] as NodeType[]).map((t) => (
                    <div key={t} className="flex items-center gap-1">
                      <div className={`h-2 w-2 rounded-full ${NODE_COLORS[t].iconBg}`} />
                      <span className="text-[10px] text-muted-foreground">{TYPE_LABELS[t]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Execution progress bar */}
            {executingStep >= 0 && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-primary flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {executingStep >= pipeline.length ? "Pipeline completado" : `Ejecutando paso ${executingStep + 1} de ${pipeline.length}...`}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {Math.round((Math.min(executingStep + 1, pipeline.length) / pipeline.length) * 100)}%
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${(Math.min(executingStep + 1, pipeline.length) / pipeline.length) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Pipeline nodes */}
            <div className="flex items-start gap-0 overflow-x-auto pb-6" onClick={() => setActiveNode(null)}>
              {pipeline.map((node, i) => {
                const nodeConf = pipelineConfig[node.id] || {};
                const isEnabled = !node.configurable || (nodeConf.enabled ?? true);
                const nodeParams = nodeConf.params || {};

                const isCurrentStep = executingStep === i;
                const isCompletedStep = executingStep > i;
                const nextNode = pipeline[i + 1];
                const nextEnabled = nextNode ? (!nextNode.configurable || (pipelineConfig[nextNode.id]?.enabled ?? true)) : true;

                return (
                  <div key={node.id} className="flex items-start shrink-0">
                    <div className="relative">
                      <PipelineNode
                        node={node}
                        isSelected={activeNode === node.id}
                        isEnabled={isEnabled}
                        isExecuting={isCurrentStep}
                        stepIndex={i}
                        totalSteps={pipeline.length}
                        nodeConfig={nodeParams}
                        onClick={() => setActiveNode(activeNode === node.id ? null : node.id)}
                        onToggle={() => handleNodeToggle(selectedAgent, node.id)}
                        onParamChange={(key, val) => handleNodeParam(selectedAgent, node.id, key, val)}
                      />
                      {/* Completion checkmark */}
                      {isCompletedStep && executingStep < pipeline.length && (
                        <div className="absolute -top-2.5 -left-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white shadow-md z-20 animate-in zoom-in duration-200">
                          <CheckCircle2 className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    {i < pipeline.length - 1 && (
                      <Connector active={isCurrentStep} disabled={!isEnabled || !nextEnabled} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Click hint */}
            {!activeNode && executingStep < 0 && (
              <p className="text-[11px] text-muted-foreground/60 text-center mt-1">
                Haz clic en cualquier nodo para configurar sus parámetros
              </p>
            )}
          </div>
        </div>

        {/* ── Rules ───────────────────────────────────────────────── */}
        <div className="rounded-3xl border border-border/50 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold">Reglas de automatización</h3>
              <Badge variant="outline" className="text-[10px]">{agentRules.length} reglas</Badge>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs rounded-xl" onClick={() => handleAddRule(selectedAgent)}>
              <Plus className="h-3 w-3 mr-1" /> Nueva regla
            </Button>
          </div>

          {agentRules.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-muted-foreground/15 p-8 text-center cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all group"
              onClick={() => handleAddRule(selectedAgent)}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted mx-auto mb-3 group-hover:bg-primary/10 transition-colors">
                <GitBranch className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Sin reglas configuradas</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Crea condiciones "Si X entonces Y" para automatizar decisiones</p>
            </div>
          ) : (
            <div className="space-y-3">
              {agentRules.map((rule) => (
                <RuleBlock key={rule.id} rule={rule}
                  onUpdate={(f, v) => handleUpdateRule(selectedAgent, rule.id, f, v)}
                  onDelete={() => handleDeleteRule(selectedAgent, rule.id)}
                />
              ))}
            </div>
          )}
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
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
            </div>
          ) : agentRuns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-muted-foreground/15 p-6 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Sin ejecuciones todavía</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {agentRuns.slice(0, 8).map((run) => {
                const rs = STATUS_CONFIG[run.status] || STATUS_CONFIG.completed;
                const RI = rs.icon;
                return (
                  <div key={run.id} onClick={() => loadRunDetail(selectedAgent, run.id)}
                    className="flex items-center gap-3 rounded-2xl p-3 hover:bg-muted/50 cursor-pointer transition-all group"
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                      run.status === "completed" ? "bg-green-500/10" : run.status === "failed" ? "bg-red-500/10" : "bg-muted"
                    }`}>
                      <RI className={`h-4 w-4 ${rs.color} ${run.status === "running" ? "animate-spin" : ""}`} />
                    </div>
                    <span className="text-sm flex-1 truncate">{run.findings_summary || rs.label}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {run.findings_count > 0 && <Badge variant="secondary" className="text-[10px] h-5">{run.findings_count}</Badge>}
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

  // ── List View ────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-brand shadow-lg">
            <Bot className="h-5 w-5 text-white" />
          </div>
          Agentes
        </h1>
        <p className="text-muted-foreground mt-1.5">Configura pipelines de IA, define reglas y automatiza decisiones</p>
      </div>

      {loading ? <TableSkeleton rows={2} /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => {
            const meta = AGENT_META[agent.agent_type] || AGENT_META.price_monitor;
            const Icon = meta.icon;
            const pipeline = AGENT_PIPELINES[agent.agent_type] || [];
            const lastStatus = STATUS_CONFIG[agent.last_run_status || ""] || null;

            return (
              <div key={agent.id} onClick={() => openDetail(agent)}
                className={`group relative rounded-3xl border border-border/50 bg-card p-6 cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/20 hover:-translate-y-0.5 ${
                  !agent.is_enabled ? "opacity-60" : ""
                }`}
              >
                <div className={`absolute top-4 right-4 h-2.5 w-2.5 rounded-full ${
                  agent.is_enabled ? "bg-green-500 shadow-lg shadow-green-500/30" : "bg-muted-foreground/30"
                }`}>
                  {agent.is_enabled && <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-30" />}
                </div>

                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.gradient} shadow-xl mb-4 transition-transform group-hover:scale-110`}>
                  <Icon className="h-7 w-7 text-white" />
                </div>

                <h3 className="text-lg font-bold mb-1">{agent.name}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{meta.description}</p>

                {/* Mini pipeline */}
                <div className="flex items-center gap-1 mb-4 opacity-60">
                  {pipeline.slice(0, 6).map((node, i) => {
                    const NI = node.icon;
                    const nc = NODE_COLORS[node.type];
                    return (
                      <div key={node.id} className="flex items-center">
                        <div className={`flex h-6 w-6 items-center justify-center rounded-lg ${nc.iconBg}`}>
                          <NI className="h-3 w-3 text-white" />
                        </div>
                        {i < pipeline.length - 1 && i < 5 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/40 mx-0.5" />}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3 pt-3 border-t border-border/40">
                  <span className="text-[11px] text-muted-foreground">{pipeline.length} pasos</span>
                  {lastStatus && (
                    <div className="flex items-center gap-1.5">
                      <lastStatus.icon className={`h-3.5 w-3.5 ${lastStatus.color}`} />
                      <span className="text-xs text-muted-foreground">{lastStatus.label}</span>
                    </div>
                  )}
                  {agent.last_run_findings != null && agent.last_run_findings > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-5">{agent.last_run_findings} hallazgos</Badge>
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
