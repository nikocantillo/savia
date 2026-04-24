"use client";

import { useEffect, useState, useMemo } from "react";
import { api, MasterItem, PriceHistory } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp, Search, Loader2, X, Plus } from "lucide-react";

const LINE_COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(142, 71%, 45%)",
  "hsl(340, 82%, 52%)",
  "hsl(262, 83%, 58%)",
  "hsl(24, 95%, 53%)",
  "hsl(199, 89%, 48%)",
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md min-w-[180px]">
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="truncate max-w-[140px]">{entry.name}</span>
          </div>
          <span className="font-semibold tabular-nums">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function PricesPage() {
  const [masterItems, setMasterItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState<MasterItem[]>([]);
  const [priceData, setPriceData] = useState<Record<string, PriceHistory>>({});
  const [loadingPrices, setLoadingPrices] = useState<Set<string>>(new Set());

  useEffect(() => {
    api
      .get<MasterItem[]>("/master-items")
      .then(setMasterItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return masterItems;
    const q = search.toLowerCase();
    return masterItems.filter(
      (mi) =>
        mi.name.toLowerCase().includes(q) ||
        (mi.category && mi.category.toLowerCase().includes(q))
    );
  }, [masterItems, search]);

  const addItem = async (item: MasterItem) => {
    if (selectedItems.find((s) => s.id === item.id)) return;
    if (selectedItems.length >= 6) return;

    setSelectedItems((prev) => [...prev, item]);
    setSearch("");

    if (priceData[item.id]) return;

    setLoadingPrices((prev) => new Set(prev).add(item.id));
    try {
      const history = await api.get<PriceHistory>(
        `/items/${item.id}/price-history`
      );
      setPriceData((prev) => ({ ...prev, [item.id]: history }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPrices((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const removeItem = (id: string) => {
    setSelectedItems((prev) => prev.filter((s) => s.id !== id));
  };

  const chartData = useMemo(() => {
    const dateMap: Record<string, Record<string, number>> = {};

    selectedItems.forEach((item) => {
      const history = priceData[item.id];
      if (!history) return;
      history.prices.forEach((p) => {
        const dateLabel = new Date(p.date).toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "short",
          year: "2-digit",
        });
        if (!dateMap[dateLabel]) dateMap[dateLabel] = {};
        dateMap[dateLabel][item.name] = parseFloat(p.unit_price);
      });
    });

    return Object.entries(dateMap)
      .sort(
        ([a], [b]) =>
          new Date(a).getTime() - new Date(b).getTime()
      )
      .map(([date, values]) => ({ date, ...values }));
  }, [selectedItems, priceData]);

  const isLoadingAny = loadingPrices.size > 0;

  const categoryGroups = useMemo(() => {
    const groups: Record<string, MasterItem[]> = {};
    masterItems.forEach((mi) => {
      const cat = mi.category || "Sin categoría";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(mi);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [masterItems]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Historial de Precios</h1>
        <p className="text-muted-foreground text-sm">
          Compara la evolución de precios de tus productos en el tiempo
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Left panel - item selector */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Seleccionar productos</CardTitle>
              <CardDescription className="text-xs">
                Máximo 6 productos para comparar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>

              {/* Selected chips */}
              {selectedItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedItems.map((item, i) => (
                    <Badge
                      key={item.id}
                      variant="outline"
                      className="gap-1 pr-1 text-xs"
                      style={{
                        borderColor: LINE_COLORS[i % LINE_COLORS.length],
                        color: LINE_COLORS[i % LINE_COLORS.length],
                      }}
                    >
                      {item.name.length > 20
                        ? item.name.slice(0, 18) + "..."
                        : item.name}
                      <button
                        onClick={() => removeItem(item.id)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Item list */}
              <div className="max-h-[400px] overflow-y-auto space-y-0.5 -mx-2 px-2">
                {loading ? (
                  <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando...
                  </div>
                ) : search.trim() ? (
                  filteredItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No se encontraron productos
                    </p>
                  ) : (
                    filteredItems.slice(0, 20).map((item) => {
                      const isSelected = selectedItems.some(
                        (s) => s.id === item.id
                      );
                      return (
                        <button
                          key={item.id}
                          onClick={() => addItem(item)}
                          disabled={isSelected || selectedItems.length >= 6}
                          className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                            isSelected
                              ? "bg-primary/5 text-primary"
                              : "hover:bg-muted"
                          } disabled:opacity-50`}
                        >
                          <p className="font-medium truncate">{item.name}</p>
                          {item.category && (
                            <p className="text-xs text-muted-foreground">
                              {item.category}
                            </p>
                          )}
                        </button>
                      );
                    })
                  )
                ) : (
                  categoryGroups.map(([cat, items]) => (
                    <div key={cat} className="mb-3">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider px-3 py-1">
                        {cat}
                      </p>
                      {items.map((item) => {
                        const isSelected = selectedItems.some(
                          (s) => s.id === item.id
                        );
                        return (
                          <button
                            key={item.id}
                            onClick={() => addItem(item)}
                            disabled={isSelected || selectedItems.length >= 6}
                            className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                              isSelected
                                ? "bg-primary/5 text-primary"
                                : "hover:bg-muted"
                            } disabled:opacity-50`}
                          >
                            <span className="truncate block">{item.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right panel - chart */}
        <div className="space-y-4">
          <Card className="min-h-[500px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Evolución de precios</CardTitle>
              <CardDescription className="text-xs">
                Precio unitario por fecha de factura
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mb-3 opacity-30" />
                  <p className="font-medium">Selecciona un producto</p>
                  <p className="text-xs mt-1">
                    Busca y selecciona productos del panel izquierdo para ver su
                    historial de precios
                  </p>
                </div>
              ) : isLoadingAny ? (
                <div className="flex items-center gap-2 py-20 justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Cargando precios...
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <p>No hay datos de precios para los productos seleccionados</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={420}>
                  <LineChart
                    data={chartData}
                    margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="date"
                      fontSize={11}
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                    />
                    <YAxis
                      fontSize={11}
                      tickFormatter={(v) => `$${v}`}
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
                    />
                    {selectedItems.map((item, i) => (
                      <Line
                        key={item.id}
                        type="monotone"
                        dataKey={item.name}
                        stroke={LINE_COLORS[i % LINE_COLORS.length]}
                        strokeWidth={2.5}
                        dot={{
                          r: 4,
                          fill: LINE_COLORS[i % LINE_COLORS.length],
                          strokeWidth: 2,
                          stroke: "#fff",
                        }}
                        activeDot={{ r: 6, strokeWidth: 2 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Price details table */}
          {selectedItems.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Detalle de precios</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                          Producto
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                          Categoría
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                          Registros
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                          Mín
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                          Máx
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                          Último
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                          Variación
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedItems.map((item, i) => {
                        const history = priceData[item.id];
                        const prices = history?.prices || [];
                        const vals = prices.map((p) =>
                          parseFloat(p.unit_price)
                        );
                        const min = vals.length ? Math.min(...vals) : 0;
                        const max = vals.length ? Math.max(...vals) : 0;
                        const last = vals.length ? vals[vals.length - 1] : 0;
                        const first = vals.length ? vals[0] : 0;
                        const change =
                          first > 0
                            ? ((last - first) / first) * 100
                            : 0;

                        return (
                          <tr
                            key={item.id}
                            className="border-b last:border-0 hover:bg-muted/30"
                          >
                            <td className="px-4 py-2.5 font-medium flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor:
                                    LINE_COLORS[i % LINE_COLORS.length],
                                }}
                              />
                              <span className="truncate max-w-[200px]">
                                {item.name}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {item.category || "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {prices.length}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {formatCurrency(min)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {formatCurrency(max)}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                              {formatCurrency(last)}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {vals.length >= 2 ? (
                                <Badge
                                  variant={
                                    change > 0 ? "destructive" : "default"
                                  }
                                  className="text-xs"
                                >
                                  {change >= 0 ? "+" : ""}
                                  {change.toFixed(1)}%
                                </Badge>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
