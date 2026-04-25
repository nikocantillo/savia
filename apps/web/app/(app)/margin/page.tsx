"use client";

import { useEffect, useState } from "react";
import { api, MarginSummary, Branch } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Target,
  BarChart3,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from "recharts";

export default function MarginPage() {
  const [data, setData] = useState<MarginSummary | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [branchId, setBranchId] = useState("all");

  const loadData = () => {
    setLoading(true);
    setError(null);
    const params = `?days=${days}${branchId !== "all" ? `&branch_id=${branchId}` : ""}`;
    Promise.all([
      api.get<MarginSummary>(`/margin/summary${params}`),
      api.get<Branch[]>("/branches"),
    ])
      .then(([m, b]) => {
        setData(m);
        setBranches(b);
      })
      .catch((err) => {
        console.error(err);
        setError("No se pudo cargar la información de margen.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [days, branchId]);

  if (loading) {
    return <div className="animate-pulse text-muted-foreground">Cargando...</div>;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive/60" />
        <div>
          <p className="text-lg font-semibold">Error al cargar margen</p>
          <p className="text-sm text-muted-foreground mt-1">{error || "Respuesta inesperada del servidor"}</p>
        </div>
        <Button variant="outline" onClick={loadData} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Reintentar
        </Button>
      </div>
    );
  }

  const isHealthy = data.period_margin_pct >= (100 - data.food_cost_target_pct);
  const foodCostPct = 100 - data.period_margin_pct;

  const chartData = data.daily.map((d) => ({
    date: new Date(d.date).toLocaleDateString("es-CL", { month: "short", day: "numeric" }),
    Ingresos: parseFloat(d.revenue),
    Costos: parseFloat(d.cost),
    Margen: parseFloat(d.margin),
    "Margen %": d.margin_pct,
  }));

  const branchData = data.by_branch.map((b) => ({
    name: b.branch_name,
    Ingresos: parseFloat(b.revenue),
    Costos: parseFloat(b.cost),
    "Margen %": b.margin_pct,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Control de Margen</h1>
          <p className="text-muted-foreground">
            Costo de alimentos vs ingresos · Objetivo: {data.food_cost_target_pct}%
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            className="w-full sm:w-auto rounded-md border px-3 py-2 text-sm"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="all">Todas las sucursales</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select
            className="w-full sm:w-auto rounded-md border px-3 py-2 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>7 días</option>
            <option value={14}>14 días</option>
            <option value={30}>30 días</option>
            <option value={90}>90 días</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-green-500/10 p-2">
                <DollarSign className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(data.period_revenue)}</p>
                <p className="text-xs text-muted-foreground">Ingresos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-500/10 p-2">
                <ShoppingCart className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(data.period_cost)}</p>
                <p className="text-xs text-muted-foreground">Costo de Compras</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-2 ${isHealthy ? "bg-green-500/10" : "bg-red-500/10"}`}>
                {isHealthy ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(data.period_margin)}</p>
                <p className="text-xs text-muted-foreground">Margen Bruto</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={isHealthy ? "border-green-200" : "border-red-200"}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-2 ${isHealthy ? "bg-green-500/10" : "bg-red-500/10"}`}>
                <Target className={`h-4 w-4 ${isHealthy ? "text-green-600" : "text-red-600"}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${isHealthy ? "text-green-600" : "text-red-600"}`}>
                  {foodCostPct.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  Costo de Alimentos (objetivo: {data.food_cost_target_pct}%)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Margin Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ingresos vs Costos</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Area type="monotone" dataKey="Ingresos" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} />
                <Area type="monotone" dataKey="Costos" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Branch Comparison */}
      {branchData.length > 0 && branchId === "all" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Comparativa por Sucursal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={branchData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="Ingresos" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Costos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {data.by_branch.map((b) => {
                const healthy = b.margin_pct >= (100 - data.food_cost_target_pct);
                return (
                  <div key={b.branch_id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-3">
                    <span className="font-medium">{b.branch_name}</span>
                    <Badge variant={healthy ? "default" : "destructive"}>
                      Margen: {b.margin_pct}%
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {chartData.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium">Sin datos de margen</p>
            <p className="text-muted-foreground text-center max-w-md">
              Registra tus ventas diarias y sube facturas de compra para ver el análisis de margen
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
