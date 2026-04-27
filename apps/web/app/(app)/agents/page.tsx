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
  Sparkles,
  Power,
} from "lucide-react";

// ── Step Definitions ──────────────────────────────────────────────

interface StepParam {
  key: string;
  label: string;
  type: "number" | "boolean";
  unit?: string;
  default: any;
}

interface StepDef {
  id: string;
  type: "trigger" | "process" | "action";
  label: string;
  description: string;
  icon: typeof Eye;
  color: string;
  params?: StepParam[];
}

const STEP_COLORS: Record<string, { icon: string; bg: string; border: string; text: string; dot: string }> = {
  emerald: { icon: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/30", text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  amber: { icon: "bg-amber-500", bg: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/30", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  blue: { icon: "bg-blue-500", bg: "bg-blue-50 dark:bg-blue-500/10", border: "border-blue-200 dark:border-blue-500/30", text: "text-blue-700 dark:text-blue-400", dot: "bg-blue-500" },
  purple: { icon: "bg-purple-500", bg: "bg-purple-50 dark:bg-purple-500/10", border: "border-purple-200 dark:border-purple-500/30", text: "text-purple-700 dark:text-purple-400", dot: "bg-purple-500" },
  rose: { icon: "bg-rose-500", bg: "bg-rose-50 dark:bg-rose-500/10", border: "border-rose-200 dark:border-rose-500/30", text: "text-rose-700 dark:text-rose-400", dot: "bg-rose-500" },
};

const PIPELINES: Record<string, StepDef[]> = {
  price_monitor: [
    {
      id: "trigger", type: "trigger", label: "Cuando se procesa una factura", icon: FileText, color: "emerald",
      description: "Este pipeline se ejecuta automáticamente cada vez que se sube y procesa una factura nueva.",
    },
    {
      id: "analyze", type: "process", label: "Analizar cambios de precio", icon: TrendingUp, color: "amber",
      description: "Compara el precio de cada producto con su promedio histórico para detectar alzas significativas.",
      params: [
        { key: "lookback_days", label: "Periodo de comparación", type: "number", unit: "días", default: 30 },
        { key: "threshold_pct", label: "Alza mínima para alertar", type: "number", unit: "%", default: 5 },
      ],
    },
    {
      id: "alternatives", type: "process", label: "Buscar proveedores más baratos", icon: Search, color: "blue",
      description: "Para cada producto con alza, busca si otro proveedor lo vende más barato.",
      params: [
        { key: "find_alternatives", label: "Buscar alternativas activamente", type: "boolean", default: true },
      ],
    },
    {
      id: "alert", type: "action", label: "Crear alerta en el sistema", icon: Bell, color: "purple",
      description: "Crea una alerta visible en la sección de Alertas para que tú o tu equipo tomen acción.",
      params: [
        { key: "create_alert", label: "Crear alertas automáticamente", type: "boolean", default: true },
      ],
    },
    {
      id: "email", type: "action", label: "Enviar email de notificación", icon: Mail, color: "rose",
      description: "Envía un correo con el resumen de hallazgos críticos al email configurado.",
      params: [
        { key: "auto_email", label: "Enviar email automáticamente", type: "boolean", default: true },
      ],
    },
  ],
  supplier_eval: [
    {
      id: "trigger", type: "trigger", label: "Cuando se procesa una factura", icon: FileText, color: "emerald",
      description: "Este pipeline se ejecuta automáticamente cada vez que se sube una factura nueva.",
    },
    {
      id: "collect", type: "process", label: "Recopilar historial del proveedor", icon: Eye, color: "amber",
      description: "Analiza todas las facturas del proveedor en el periodo para calcular métricas de rendimiento.",
      params: [
        { key: "lookback_days", label: "Periodo de evaluación", type: "number", unit: "días", default: 60 },
        { key: "min_invoices", label: "Mínimo de facturas requeridas", type: "number", unit: "facturas", default: 2 },
      ],
    },
    {
      id: "score", type: "process", label: "Calcular puntaje del proveedor", icon: Activity, color: "blue",
      description: "Genera un score (0-100) basado en competitividad de precios, consistencia y cumplimiento de acuerdos.",
      params: [
        { key: "score_threshold", label: "Score mínimo aceptable", type: "number", unit: "puntos", default: 50 },
      ],
    },
    {
      id: "compliance", type: "process", label: "Verificar precios negociados", icon: Shield, color: "purple",
      description: "Compara los precios reales cobrados contra los precios negociados previamente. Detecta incumplimientos.",
      params: [
        { key: "check_compliance", label: "Verificar cumplimiento", type: "boolean", default: true },
      ],
    },
    {
      id: "alert", type: "action", label: "Alertar proveedores problemáticos", icon: Bell, color: "rose",
      description: "Genera alertas para proveedores con puntaje bajo o que no cumplen los precios negociados.",
      params: [
        { key: "create_alert", label: "Crear alertas automáticamente", type: "boolean", default: true },
      ],
    },
  ],
};

const AGENT_META: Record<string, { icon: typeof TrendingUp; gradient: string; description: string }> = {
  price_monitor: { icon: TrendingUp, gradient: "from-blue-500 to-cyan-500", description: "Detecta alzas de precios y busca alternativas más baratas automáticamente." },
  supplier_eval: { icon: Shield, gradient: "from-purple-500 to-pink-500", description: "Califica proveedores por precio, consistencia y cumplimiento." },
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
];

const RULE_ACTIONS_LIST = [
  { id: "create_alert", label: "Crear alerta" },
  { id: "send_email", label: "Enviar email" },
  { id: "send_email_urgent", label: "Email urgente" },
];

interface CustomRule { id: string; condition: string; threshold: number; action: string; }

// ── Step Card ───────────────────────────────────────────────────────

function StepCard({
  step, stepNum, isEnabled, isExpanded, isRunning, isCompleted,
  params, onToggle, onExpand, onParamChange,
}: {
  step: StepDef; stepNum: number; isEnabled: boolean; isExpanded: boolean;
  isRunning: boolean; isCompleted: boolean;
  params: Record<string, any>;
  onToggle: () => void; onExpand: () => void; onParamChange: (key: string, value: any) => void;
}) {
  const c = STEP_COLORS[step.color];
  const StepIcon = step.icon;
  const typeLabel = step.type === "trigger" ? "Disparador" : step.type === "process" ? "Proceso" : "Acción";

  return (
    <div className={`relative rounded-2xl border-2 transition-all duration-300 ${
      isExpanded ? `${c.border} shadow-lg` : "border-border/50 hover:border-border"
    } ${!isEnabled && step.type !== "trigger" ? "opacity-40" : ""} ${isRunning ? "ring-2 ring-primary/30 ring-offset-2 ring-offset-background" : ""}`}>

      {/* Main row */}
      <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={onExpand}>
        {/* Step number + icon */}
        <div className="relative shrink-0">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${c.icon} shadow-lg transition-transform ${isRunning ? "animate-pulse scale-110" : ""} ${isCompleted ? "ring-2 ring-green-500 ring-offset-2 ring-offset-background" : ""}`}>
            {isCompleted ? <CheckCircle2 className="h-5 w-5 text-white" /> : isRunning ? <Loader2 className="h-5 w-5 text-white animate-spin" /> : <StepIcon className="h-5 w-5 text-white" />}
          </div>
          <div className={`absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold bg-background border-2 ${c.border} ${c.text}`}>
            {stepNum}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h4 className="font-semibold text-sm">{step.label}</h4>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${c.text} ${c.bg} px-1.5 py-0.5 rounded-md`}>{typeLabel}</span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">{step.description}</p>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-3 shrink-0">
          {step.type !== "trigger" && (
            <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isEnabled ? "bg-green-500" : "bg-muted-foreground/20"}`}
            >
              <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                style={{ transform: `translateX(${isEnabled ? "24px" : "3px"})` }}
              />
            </button>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      {/* Expanded configuration */}
      {isExpanded && (
        <div className={`border-t ${c.border} ${c.bg} rounded-b-2xl p-4 animate-in slide-in-from-top-1 duration-200`}>
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">{step.description}</p>

          {step.params && step.params.length > 0 ? (
            <div className="space-y-4">
              {step.params.map((param) => {
                const value = params[param.key] ?? param.default;

                if (param.type === "boolean") {
                  return (
                    <div key={param.key} className="flex items-center justify-between bg-background/60 rounded-xl p-3">
                      <div>
                        <p className="text-sm font-medium">{param.label}</p>
                      </div>
                      <button onClick={() => onParamChange(param.key, !value)}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shadow-inner ${value ? "bg-primary" : "bg-muted-foreground/20"}`}
                      >
                        <span className="inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform"
                          style={{ transform: `translateX(${value ? "22px" : "3px"})` }}
                        />
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={param.key} className="bg-background/60 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{param.label}</p>
                      <div className="flex items-center gap-2">
                        <button onClick={() => onParamChange(param.key, Math.max(0, value - 1))}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm font-bold"
                        >−</button>
                        <input type="number" value={value} onChange={(e) => onParamChange(param.key, Number(e.target.value))}
                          className="w-16 text-center text-sm font-bold font-mono bg-background border border-border rounded-lg py-1 outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <button onClick={() => onParamChange(param.key, value + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm font-bold"
                        >+</button>
                        {param.unit && <span className="text-xs text-muted-foreground ml-1">{param.unit}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background/60 rounded-xl p-3">
              <Power className="h-3.5 w-3.5" />
              Este paso se ejecuta automáticamente y no requiere configuración.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Vertical Connector ──────────────────────────────────────────────

function VerticalConnector({ active }: { active?: boolean }) {
  return (
    <div className="flex justify-center py-1">
      <div className="relative flex flex-col items-center">
        <div className={`w-0.5 h-6 rounded-full ${active ? "bg-primary" : "bg-border"} transition-colors`} />
        <div className={`h-2 w-2 rounded-full ${active ? "bg-primary animate-bounce" : "bg-border"}`} />
        <div className={`w-0.5 h-6 rounded-full ${active ? "bg-primary" : "bg-border"} transition-colors`} />
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const [selectedRun, setSelectedRun] = useState<AgentRunDetail | null>(null);
  const [runs, setRuns] = useState<Record<string, AgentRun[]>>({});
  const [loadingRuns, setLoadingRuns] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "detail" | "run">("list");
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
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

  const saveConfig = async (agent: AgentConfig, newConfig: any) => {
    try {
      await api.put(`/agents/${agent.id}`, { config: newConfig });
      const updated = { ...agent, config: newConfig };
      setAgents((p) => p.map((a) => (a.id === agent.id ? updated : a)));
      if (selectedAgent?.id === agent.id) setSelectedAgent(updated);
    } catch { toast("error", "Error al guardar"); }
  };

  const handleTrigger = async (agent: AgentConfig) => {
    setTriggering(agent.id);
    setExecutingStep(0);
    const steps = PIPELINES[agent.agent_type] || [];
    const interval = setInterval(() => {
      setExecutingStep((p) => { if (p >= steps.length - 1) { clearInterval(interval); return p; } return p + 1; });
    }, 700);
    try {
      await api.post(`/agents/${agent.id}/trigger`, {});
      clearInterval(interval);
      setExecutingStep(steps.length);
      toast("success", "Pipeline ejecutado — revisa los resultados abajo");
      await fetchAgents();
      await loadRuns(agent.id);
      setTimeout(() => setExecutingStep(-1), 2500);
    } catch (err: any) {
      clearInterval(interval); setExecutingStep(-1);
      toast("error", err.message || "Error al ejecutar");
    } finally { setTriggering(null); }
  };

  const handleToggle = async (agent: AgentConfig) => {
    try {
      await api.put<AgentConfig>(`/agents/${agent.id}`, { is_enabled: !agent.is_enabled });
      const updated = { ...agent, is_enabled: !agent.is_enabled };
      setAgents((p) => p.map((a) => (a.id === agent.id ? updated : a)));
      if (selectedAgent?.id === agent.id) setSelectedAgent(updated);
      toast("success", agent.is_enabled ? "Agente pausado" : "Agente activado");
    } catch { toast("error", "Error al actualizar"); }
  };

  const handleStepToggle = (agent: AgentConfig, stepId: string) => {
    const pipeline = agent.config?.pipeline || {};
    const cur = pipeline[stepId] || {};
    saveConfig(agent, { ...agent.config, pipeline: { ...pipeline, [stepId]: { ...cur, enabled: !(cur.enabled ?? true) } } });
  };

  const handleStepParam = (agent: AgentConfig, stepId: string, key: string, value: any) => {
    const pipeline = agent.config?.pipeline || {};
    const cur = pipeline[stepId] || {};
    const params = cur.params || {};
    saveConfig(agent, { ...agent.config, pipeline: { ...pipeline, [stepId]: { ...cur, params: { ...params, [key]: value } } } });
  };

  const handleAddRule = (agent: AgentConfig) => {
    const rules: CustomRule[] = agent.config?.rules || [];
    saveConfig(agent, { ...agent.config, rules: [...rules, { id: `r_${Date.now()}`, condition: "price_increase", threshold: 10, action: "create_alert" }] });
  };

  const handleUpdateRule = (agent: AgentConfig, ruleId: string, field: string, value: any) => {
    const rules: CustomRule[] = agent.config?.rules || [];
    saveConfig(agent, { ...agent.config, rules: rules.map((r) => (r.id === ruleId ? { ...r, [field]: value } : r)) });
  };

  const handleDeleteRule = (agent: AgentConfig, ruleId: string) => {
    const rules: CustomRule[] = agent.config?.rules || [];
    saveConfig(agent, { ...agent.config, rules: rules.filter((r) => r.id !== ruleId) });
  };

  const loadRuns = async (agentId: string) => {
    setLoadingRuns(agentId);
    try { const d = await api.get<AgentRun[]>(`/agents/${agentId}/runs`); setRuns((p) => ({ ...p, [agentId]: d })); } catch {}
    setLoadingRuns(null);
  };

  const loadRunDetail = async (agent: AgentConfig, runId: string) => {
    try { const d = await api.get<AgentRunDetail>(`/agents/${agent.id}/runs/${runId}`); setSelectedRun(d); setView("run"); } catch {}
  };

  const openDetail = (agent: AgentConfig) => {
    setSelectedAgent(agent); setView("detail"); setExpandedStep(null); setExecutingStep(-1);
    if (!runs[agent.id]) loadRuns(agent.id);
  };

  // ── Run Detail ───────────────────────────────────────────────────

  if (view === "run" && selectedRun && selectedAgent) {
    const sc = STATUS_CONFIG[selectedRun.status] || STATUS_CONFIG.completed;
    const SI = sc.icon;
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => setView("detail")}><ArrowLeft className="h-4 w-4 mr-1" /> Volver</Button>
        <div className="flex items-center gap-3">
          <SI className={`h-5 w-5 ${sc.color} ${selectedRun.status === "running" ? "animate-spin" : ""}`} />
          <h2 className="text-lg font-bold">{sc.label}</h2>
          <span className="text-sm text-muted-foreground">{formatDate(selectedRun.started_at)}</span>
        </div>
        {selectedRun.findings_summary && (
          <div className="rounded-2xl bg-primary/5 border border-primary/20 p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-sm mb-1">Resumen IA</p>
                <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{selectedRun.findings_summary}</p>
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-3 flex-wrap">
          <Badge variant="outline"><Activity className="h-3 w-3 mr-1" />{selectedRun.findings_count} hallazgos</Badge>
          <Badge variant="outline"><Zap className="h-3 w-3 mr-1" />{selectedRun.actions_count} acciones</Badge>
        </div>
        {selectedRun.findings.map((f) => {
          const sv = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.info;
          const FI = sv.icon;
          const alts = f.data?.alternatives as Array<{ name: string; avg_price: number }> | undefined;
          return (
            <div key={f.id} className={`rounded-2xl border p-4 ${f.severity === "critical" ? "border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/5" : f.severity === "warning" ? "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5" : "border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/5"}`}>
              <div className="flex items-start gap-3">
                <div className={`rounded-xl ${sv.bg} p-2`}><FI className={`h-4 w-4 ${sv.color}`} /></div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{f.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">{f.description}</p>
                  {alts && alts.length > 0 && (
                    <div className="mt-2 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl p-2.5">
                      <p className="text-[11px] font-bold text-green-700 dark:text-green-400 mb-1">Alternativas más baratas:</p>
                      {alts.map((a, i) => <p key={i} className="text-xs text-muted-foreground">{a.name} — ${a.avg_price?.toLocaleString("es-CO")}</p>)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {selectedRun.findings.length === 0 && (
          <div className="text-center py-8"><CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" /><p className="font-medium">Todo en orden</p><p className="text-sm text-muted-foreground">No se detectaron problemas.</p></div>
        )}
      </div>
    );
  }

  // ── Agent Detail (Pipeline Editor) ──────────────────────────────

  if (view === "detail" && selectedAgent) {
    const meta = AGENT_META[selectedAgent.agent_type] || AGENT_META.price_monitor;
    const Icon = meta.icon;
    const steps = PIPELINES[selectedAgent.agent_type] || [];
    const pipeConf = selectedAgent.config?.pipeline || {};
    const rules: CustomRule[] = selectedAgent.config?.rules || [];
    const agentRuns = runs[selectedAgent.id] || [];

    return (
      <div className="space-y-8 max-w-3xl mx-auto">
        {/* Back */}
        <Button variant="ghost" size="sm" onClick={() => { setView("list"); setSelectedAgent(null); }}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Todos los agentes
        </Button>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.gradient} shadow-xl`}>
              <Icon className="h-7 w-7 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{selectedAgent.name}</h2>
              <p className="text-sm text-muted-foreground">{meta.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => handleToggle(selectedAgent)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${selectedAgent.is_enabled ? "bg-green-500" : "bg-muted"}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${selectedAgent.is_enabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <Button onClick={() => handleTrigger(selectedAgent)} disabled={triggering === selectedAgent.id} className="gradient-brand border-0 text-white shadow-lg">
              {triggering === selectedAgent.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Ejecutar ahora
            </Button>
          </div>
        </div>

        {/* Execution progress */}
        {executingStep >= 0 && (
          <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                {executingStep >= steps.length ? "¡Pipeline completado!" : `Ejecutando paso ${executingStep + 1}/${steps.length}...`}
              </span>
              <span className="text-xs font-bold text-primary">{Math.round((Math.min(executingStep + 1, steps.length) / steps.length) * 100)}%</span>
            </div>
            <div className="h-2 bg-primary/10 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${(Math.min(executingStep + 1, steps.length) / steps.length) * 100}%` }} />
            </div>
          </div>
        )}

        {/* ── Pipeline Steps (vertical) ────────────────────────── */}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <GitBranch className="h-4 w-4" /> Pipeline — {steps.length} pasos
          </h3>

          <div className="space-y-0">
            {steps.map((step, i) => {
              const conf = pipeConf[step.id] || {};
              const isEnabled = step.type === "trigger" || (conf.enabled ?? true);
              const params = conf.params || {};
              const isRunning = executingStep === i;
              const isCompleted = executingStep > i && executingStep <= steps.length;

              return (
                <div key={step.id}>
                  <StepCard
                    step={step} stepNum={i + 1}
                    isEnabled={isEnabled} isExpanded={expandedStep === step.id}
                    isRunning={isRunning} isCompleted={isCompleted}
                    params={params}
                    onToggle={() => handleStepToggle(selectedAgent, step.id)}
                    onExpand={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                    onParamChange={(k, v) => handleStepParam(selectedAgent, step.id, k, v)}
                  />
                  {i < steps.length - 1 && <VerticalConnector active={isRunning} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Custom Rules ─────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" /> Reglas personalizadas
            </h3>
            <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => handleAddRule(selectedAgent)}>
              <Plus className="h-3 w-3 mr-1" /> Agregar
            </Button>
          </div>

          {rules.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleAddRule(selectedAgent)}>
              <Zap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-medium text-muted-foreground">Agrega reglas adicionales</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Ejemplo: "Si precio sube más de 15% → Enviar email urgente"</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => {
                const condObj = RULE_CONDITIONS.find((c) => c.id === rule.condition);
                return (
                  <div key={rule.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                    <div className="flex-1 flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline" className="bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 font-bold">SI</Badge>
                      <select value={rule.condition} onChange={(e) => handleUpdateRule(selectedAgent, rule.id, "condition", e.target.value)}
                        className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        {RULE_CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                      {rule.condition !== "new_supplier" && (
                        <div className="flex items-center gap-1">
                          <input type="number" value={rule.threshold} onChange={(e) => handleUpdateRule(selectedAgent, rule.id, "threshold", Number(e.target.value))}
                            className="w-14 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-center font-mono font-bold outline-none focus:ring-2 focus:ring-primary/30"
                          />
                          <span className="text-[11px] text-muted-foreground">{condObj?.unit}</span>
                        </div>
                      )}
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <Badge variant="outline" className="bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400 font-bold">ENTONCES</Badge>
                      <select value={rule.action} onChange={(e) => handleUpdateRule(selectedAgent, rule.id, "action", e.target.value)}
                        className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        {RULE_ACTIONS_LIST.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                      </select>
                    </div>
                    <button onClick={() => handleDeleteRule(selectedAgent, rule.id)} className="p-2 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Run History ──────────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4" /> Últimas ejecuciones
          </h3>
          {loadingRuns === selectedAgent.id ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando...</div>
          ) : agentRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Ejecuta el pipeline para ver resultados aquí.</p>
          ) : (
            <div className="space-y-2">
              {agentRuns.slice(0, 6).map((run) => {
                const rs = STATUS_CONFIG[run.status] || STATUS_CONFIG.completed;
                const RI = rs.icon;
                return (
                  <div key={run.id} onClick={() => loadRunDetail(selectedAgent, run.id)}
                    className="flex items-center gap-3 rounded-2xl border border-border p-3 hover:bg-muted/50 cursor-pointer transition-colors group"
                  >
                    <RI className={`h-4 w-4 ${rs.color} shrink-0 ${run.status === "running" ? "animate-spin" : ""}`} />
                    <span className="text-sm flex-1 truncate">{run.findings_summary || rs.label}</span>
                    {run.findings_count > 0 && <Badge variant="secondary" className="text-[10px]">{run.findings_count}</Badge>}
                    <span className="text-[11px] text-muted-foreground shrink-0">{formatDate(run.started_at)}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
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
          Agentes IA
        </h1>
        <p className="text-muted-foreground mt-1">Automatiza decisiones con pipelines inteligentes que se ejecutan con cada factura.</p>
      </div>

      {loading ? <TableSkeleton rows={2} /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {agents.map((agent) => {
            const meta = AGENT_META[agent.agent_type] || AGENT_META.price_monitor;
            const Icon = meta.icon;
            const steps = PIPELINES[agent.agent_type] || [];
            const lastSt = STATUS_CONFIG[agent.last_run_status || ""] || null;

            return (
              <div key={agent.id} onClick={() => openDetail(agent)}
                className={`group relative rounded-3xl border border-border bg-card p-6 cursor-pointer transition-all duration-300 hover:shadow-xl hover:border-primary/20 hover:-translate-y-0.5 ${!agent.is_enabled ? "opacity-50" : ""}`}
              >
                {/* Status dot */}
                <div className={`absolute top-5 right-5 h-3 w-3 rounded-full ${agent.is_enabled ? "bg-green-500" : "bg-muted-foreground/30"}`}>
                  {agent.is_enabled && <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-25" />}
                </div>

                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.gradient} shadow-xl mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className="h-7 w-7 text-white" />
                </div>

                <h3 className="text-lg font-bold mb-1">{agent.name}</h3>
                <p className="text-sm text-muted-foreground mb-5">{meta.description}</p>

                {/* Steps preview */}
                <div className="flex items-center gap-2 mb-4">
                  {steps.slice(0, 5).map((s, i) => {
                    const sc = STEP_COLORS[s.color];
                    const NI = s.icon;
                    return (
                      <div key={s.id} className="flex items-center gap-1.5">
                        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${sc.icon}`}>
                          <NI className="h-3.5 w-3.5 text-white" />
                        </div>
                        {i < steps.length - 1 && i < 4 && <ArrowRight className="h-3 w-3 text-muted-foreground/30" />}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                  <span>{steps.length} pasos</span>
                  {lastSt && (
                    <span className="flex items-center gap-1"><lastSt.icon className={`h-3 w-3 ${lastSt.color}`} />{lastSt.label}</span>
                  )}
                  {agent.last_run_findings != null && agent.last_run_findings > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-5">{agent.last_run_findings} hallazgos</Badge>
                  )}
                  <ChevronRight className="h-4 w-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
