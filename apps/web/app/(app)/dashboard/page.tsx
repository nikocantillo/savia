"use client";

import { useEffect, useState } from "react";
import { api, DashboardSummary, PriceHistory, MasterItem } from "@/lib/api";
import { formatCurrency, formatCompact, formatPct } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, PieChart, Pie,
} from "recharts";
import { DollarSign, FileText, Users, TrendingUp, ArrowUpRight, Loader2, AlertTriangle, RefreshCw } from "lucide-react";

// Color palette for charts
const COLORS = [
  "hsl(221, 83%, 53%)",  // blue
  "hsl(142, 71%, 45%)",  // green
  "hsl(262, 83%, 58%)",  // purple
  "hsl(24, 95%, 53%)",   // orange
  "hsl(340, 82%, 52%)",  // pink
  "hsl(199, 89%, 48%)",  // sky
  "hsl(47, 96%, 53%)",   // amber
  "hsl(173, 80%, 40%)",  // teal
  "hsl(0, 84%, 60%)",    // red
  "hsl(280, 65%, 60%)",  // violet
];

// Custom tooltip for bar chart
function SpendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-semibold mb-1">{payload[0]?.payload?.fullName || label}</p>
      <p className="text-sm text-primary">
        Spend: <span className="font-bold">{formatCurrency(payload[0]?.value)}</span>
      </p>
      {payload[0]?.payload?.invoices != null && (
        <p className="text-xs text-muted-foreground">
          {payload[0].payload.invoices} invoice{payload[0].payload.invoices !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

// Custom tooltip for price increase chart
function IncreaseTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-semibold mb-1">{data?.fullName || label}</p>
      <p className="text-sm">
        Avg price: <span className="font-bold">{formatCurrency(data?.oldPrice)}</span>
      </p>
      <p className="text-sm">
        Latest: <span className="font-bold">{formatCurrency(data?.newPrice)}</span>
      </p>
      <p className="text-sm text-destructive font-semibold">
        +{data?.pct?.toFixed(1)}% increase
      </p>
    </div>
  );
}

// Custom tooltip for price history
function HistoryTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-semibold mb-1">{label}</p>
      <p className="text-sm text-primary">
        Price: <span className="font-bold">{formatCurrency(payload[0]?.value)}</span>
      </p>
      {payload[0]?.payload?.supplier && (
        <p className="text-xs text-muted-foreground">
          Supplier: {payload[0].payload.supplier}
        </p>
      )}
    </div>
  );
}

// Custom tooltip for pie chart
function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-semibold mb-1">{data?.fullName}</p>
      <p className="text-sm text-primary">
        <span className="font-bold">{formatCurrency(data?.spend)}</span>
      </p>
      <p className="text-xs text-muted-foreground">{data?.pct?.toFixed(1)}% of total</p>
    </div>
  );
}

// Custom label for pie chart
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) {
  if (percent < 0.05) return null; // Skip labels for tiny slices
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 25;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="hsl(var(--foreground))"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={11}
    >
      {name} ({(percent * 100).toFixed(0)}%)
    </text>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [days, setDays] = useState("30");
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [masterItems, setMasterItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<DashboardSummary>(`/dashboard/summary?days=${days}`),
      api.get<MasterItem[]>("/master-items"),
    ])
      .then(([s, items]) => {
        setSummary(s);
        setMasterItems(items);
      })
      .catch((err) => {
        console.error(err);
        setError("No se pudo cargar el dashboard. Verifica tu conexión e intenta de nuevo.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [days]);

  useEffect(() => {
    if (!selectedItem) {
      setPriceHistory(null);
      return;
    }
    setHistoryLoading(true);
    api.get<PriceHistory>(`/items/${selectedItem}/price-history`)
      .then(setPriceHistory)
      .catch(console.error)
      .finally(() => setHistoryLoading(false));
  }, [selectedItem]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
        Cargando dashboard...
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive/60" />
        <div>
          <p className="text-lg font-semibold">Error al cargar el dashboard</p>
          <p className="text-sm text-muted-foreground mt-1">{error || "Respuesta inesperada del servidor"}</p>
        </div>
        <Button variant="outline" onClick={loadData} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Reintentar
        </Button>
      </div>
    );
  }

  // ── Spend chart data (sorted desc) ──────────────────────────────
  const totalSpend = summary.spend_by_supplier.reduce(
    (s, r) => s + parseFloat(r.total_spend), 0
  );

  const spendChartData = summary.spend_by_supplier
    .map((s) => {
      const spend = parseFloat(s.total_spend);
      return {
        name: s.supplier_name.length > 25
          ? s.supplier_name.slice(0, 22) + "..."
          : s.supplier_name,
        fullName: s.supplier_name,
        spend,
        invoices: s.invoice_count,
        pct: totalSpend > 0 ? (spend / totalSpend) * 100 : 0,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  // Max spend value for the inline bar visualization
  const maxSpend = spendChartData.length > 0 ? spendChartData[0].spend : 0;

  // ── Price increases chart data ──────────────────────────────────
  const increaseChartData = summary.top_price_increases.map((item) => ({
    name: item.item_name.length > 20
      ? item.item_name.slice(0, 17) + "..."
      : item.item_name,
    fullName: item.item_name,
    pct: item.pct_change,
    oldPrice: parseFloat(item.old_avg_price),
    newPrice: parseFloat(item.new_price),
    id: item.master_item_id,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your procurement data</p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.total_spend)}</div>
            <p className="text-xs text-muted-foreground">Last {days} days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total_invoices}</div>
            <p className="text-xs text-muted-foreground">Processed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Suppliers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.active_suppliers}</div>
            <p className="text-xs text-muted-foreground">Last {days} days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Price Alerts</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.top_price_increases.length}</div>
            <p className="text-xs text-muted-foreground">Items with increases</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="spend" className="space-y-4">
        <TabsList>
          <TabsTrigger value="spend">Spend by Supplier</TabsTrigger>
          <TabsTrigger value="increases">Price Increases</TabsTrigger>
          <TabsTrigger value="history">Price History</TabsTrigger>
        </TabsList>

        {/* ── Spend by supplier ──────────────────────────────────── */}
        <TabsContent value="spend">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Spend by Supplier</CardTitle>
              <CardDescription>Top suppliers by total spend in the last {days} days</CardDescription>
            </CardHeader>
            <CardContent>
              {spendChartData.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No data yet</p>
              ) : (
                <div className="space-y-6">
                  {/* Two-column layout: Pie chart + table */}
                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Pie chart — percentage distribution */}
                    <div>
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          <Pie
                            data={spendChartData}
                            dataKey="spend"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={110}
                            innerRadius={55}
                            paddingAngle={2}
                            label={PieLabel}
                            labelLine={true}
                          >
                            {spendChartData.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<PieTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Inline bar table — shows relative scale clearly */}
                    <div className="space-y-3 flex flex-col justify-center">
                      {spendChartData.map((row, i) => {
                        const barWidth = maxSpend > 0 ? (row.spend / maxSpend) * 100 : 0;
                        return (
                          <div key={i} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div
                                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                                />
                                <span className="truncate font-medium">{row.fullName}</span>
                              </div>
                              <span className="ml-3 flex-shrink-0 font-semibold tabular-nums">
                                {formatCompact(row.spend)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-muted rounded-full h-2.5 overflow-hidden">
                                <div
                                  className="h-2.5 rounded-full transition-all duration-500"
                                  style={{
                                    width: `${Math.max(barWidth, 1)}%`,
                                    backgroundColor: COLORS[i % COLORS.length],
                                  }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground w-12 text-right tabular-nums">
                                {row.pct.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Summary table */}
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Supplier</th>
                          <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Total Spend</th>
                          <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Invoices</th>
                          <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">% of Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {spendChartData.map((row, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-4 py-2.5 flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-sm flex-shrink-0"
                                style={{ backgroundColor: COLORS[i % COLORS.length] }}
                              />
                              {row.fullName}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                              {formatCurrency(row.spend)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{row.invoices}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{row.pct.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Price increases ────────────────────────────────────── */}
        <TabsContent value="increases">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top Price Increases</CardTitle>
              <CardDescription>Items with the largest unit price increases (click to see history)</CardDescription>
            </CardHeader>
            <CardContent>
              {increaseChartData.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No significant price increases detected</p>
              ) : (
                <div className="space-y-6">
                  {/* Horizontal bar chart of % increases */}
                  <ResponsiveContainer width="100%" height={Math.max(200, increaseChartData.length * 55)}>
                    <BarChart
                      data={increaseChartData}
                      layout="vertical"
                      margin={{ left: 20, right: 30, top: 5, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        tickFormatter={(v) => `+${v.toFixed(0)}%`}
                        fontSize={12}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={160}
                        fontSize={12}
                        tick={{ fill: "hsl(var(--foreground))" }}
                      />
                      <Tooltip content={<IncreaseTooltip />} />
                      <Bar dataKey="pct" radius={[0, 4, 4, 0]} maxBarSize={32}>
                        {increaseChartData.map((_, i) => (
                          <Cell
                            key={i}
                            fill={i === 0 ? "hsl(0, 84%, 60%)" : `hsl(0, ${70 - i * 8}%, ${55 + i * 5}%)`}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Detail cards */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {summary.top_price_increases.map((item) => (
                      <div
                        key={item.master_item_id}
                        className="flex items-center justify-between rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors hover:shadow-sm"
                        onClick={() => {
                          setSelectedItem(item.master_item_id);
                          // Auto-switch to history tab
                          const historyTab = document.querySelector('[data-value="history"]') as HTMLElement;
                          historyTab?.click();
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{item.item_name}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{formatCurrency(item.old_avg_price)}</span>
                            <ArrowUpRight className="h-3 w-3 text-destructive" />
                            <span className="font-medium text-foreground">{formatCurrency(item.new_price)}</span>
                          </div>
                        </div>
                        <Badge variant="destructive" className="ml-3 flex-shrink-0">
                          {formatPct(item.pct_change)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Price history chart ────────────────────────────────── */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="text-lg">
                    {priceHistory ? `Price History: ${priceHistory.item_name}` : "Price History"}
                  </CardTitle>
                  <CardDescription>
                    Select a master item to see how its unit price changed over time
                  </CardDescription>
                </div>
                <Select
                  value={selectedItem || ""}
                  onValueChange={(val) => setSelectedItem(val || null)}
                >
                  <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder="Select an item..." />
                  </SelectTrigger>
                  <SelectContent>
                    {masterItems.map((mi) => (
                      <SelectItem key={mi.id} value={mi.id}>{mi.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {!selectedItem && (
                <div className="text-center py-12 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Select an item above to see its price trend</p>
                  <p className="text-xs mt-1">Or click on an item in the &quot;Price Increases&quot; tab</p>
                </div>
              )}

              {selectedItem && historyLoading && (
                <div className="flex items-center gap-2 justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading price history...
                </div>
              )}

              {priceHistory && !historyLoading && priceHistory.prices.length > 0 && (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart
                    data={priceHistory.prices.map((p) => ({
                      date: new Date(p.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      }),
                      price: parseFloat(p.unit_price),
                      supplier: p.supplier_name,
                    }))}
                    margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis
                      tickFormatter={(v) => formatCompact(v)}
                      fontSize={12}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip content={<HistoryTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="hsl(221, 83%, 53%)"
                      strokeWidth={2.5}
                      dot={{ r: 5, fill: "hsl(221, 83%, 53%)", strokeWidth: 2, stroke: "#fff" }}
                      activeDot={{ r: 7, strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}

              {priceHistory && !historyLoading && priceHistory.prices.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No price history data available for this item</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
