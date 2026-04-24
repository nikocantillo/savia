"use client";

import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, FileSpreadsheet, Loader2, TrendingUp, TrendingDown } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────

interface MonthlyCell {
  month: number;
  month_name: string;
  total: string;
  invoice_count: number;
}

interface SupplierRow {
  supplier_name: string;
  months: MonthlyCell[];
  year_total: string;
  year_invoice_count: number;
}

interface SupplierMonthlyReport {
  year: number;
  suppliers: SupplierRow[];
  monthly_totals: MonthlyCell[];
  grand_total: string;
}

// ── Colors for supplier rows ──────────────────────────────────────

const ROW_COLORS = [
  "bg-blue-50 dark:bg-blue-950/20",
  "bg-emerald-50 dark:bg-emerald-950/20",
  "bg-amber-50 dark:bg-amber-950/20",
  "bg-purple-50 dark:bg-purple-950/20",
  "bg-rose-50 dark:bg-rose-950/20",
  "bg-cyan-50 dark:bg-cyan-950/20",
  "bg-orange-50 dark:bg-orange-950/20",
  "bg-indigo-50 dark:bg-indigo-950/20",
];

// ── Main component ────────────────────────────────────────────────

export default function ReportsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [report, setReport] = useState<SupplierMonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);

  const years = useMemo(() => {
    const yrs = [];
    for (let y = currentYear; y >= currentYear - 5; y--) {
      yrs.push(y);
    }
    return yrs;
  }, [currentYear]);

  useEffect(() => {
    setLoading(true);
    api
      .get<SupplierMonthlyReport>(`/reports/supplier-monthly?year=${year}`)
      .then(setReport)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [year]);

  // ── CSV Export ──────────────────────────────────────────────────

  const exportCSV = () => {
    if (!report) return;

    const months = [
      "Ene", "Feb", "Mar", "Abr", "May", "Jun",
      "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
    ];

    let csv = `Proveedor,${months.join(",")},Total Año,# Facturas\n`;

    for (const supplier of report.suppliers) {
      const row = [
        `"${supplier.supplier_name}"`,
        ...supplier.months.map((m) => parseFloat(m.total).toFixed(2)),
        parseFloat(supplier.year_total).toFixed(2),
        supplier.year_invoice_count.toString(),
      ];
      csv += row.join(",") + "\n";
    }

    // Totals row
    csv += `"TOTAL",${report.monthly_totals
      .map((m) => parseFloat(m.total).toFixed(2))
      .join(",")},${parseFloat(report.grand_total).toFixed(2)},${report.monthly_totals.reduce(
      (s, m) => s + m.invoice_count,
      0
    )}\n`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte-proveedores-${year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ── Helpers ─────────────────────────────────────────────────────

  const cellValue = (val: string) => {
    const num = parseFloat(val);
    if (num === 0) return "—";
    return formatCurrency(num);
  };

  const grandTotal = report ? parseFloat(report.grand_total) : 0;

  const getPercentOfTotal = (val: string) => {
    const num = parseFloat(val);
    if (grandTotal === 0 || num === 0) return null;
    return ((num / grandTotal) * 100).toFixed(1);
  };

  // Find the month with highest spend for a supplier (for mini sparkline effect)
  const getMaxMonth = (months: MonthlyCell[]) => {
    let max = 0;
    for (const m of months) {
      const v = parseFloat(m.total);
      if (v > max) max = v;
    }
    return max;
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Reportes</h1>
          <p className="text-muted-foreground">
            Compras netas por proveedor, desglose mensual
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCSV} disabled={!report || report.suppliers.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !report || report.suppliers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium">Sin datos para {year}</p>
            <p className="text-muted-foreground">
              No hay facturas completadas en este año
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total {year}</p>
                <p className="text-2xl font-bold">{formatCurrency(report.grand_total)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Proveedores activos</p>
                <p className="text-2xl font-bold">{report.suppliers.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total facturas</p>
                <p className="text-2xl font-bold">
                  {report.suppliers.reduce((s, r) => s + r.year_invoice_count, 0)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Compras por Proveedor — {year}
              </CardTitle>
              <CardDescription>
                Montos netos mensuales. Haz clic en &quot;Exportar CSV&quot; para descargar.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-3 font-semibold sticky left-0 bg-muted/50 min-w-[180px]">
                        Proveedor
                      </th>
                      {report.monthly_totals.map((m) => (
                        <th
                          key={m.month}
                          className="text-right px-3 py-3 font-semibold min-w-[90px]"
                        >
                          {m.month_name}
                        </th>
                      ))}
                      <th className="text-right px-4 py-3 font-bold min-w-[110px] bg-muted/70">
                        Total
                      </th>
                      <th className="text-right px-4 py-3 font-semibold min-w-[50px]">
                        %
                      </th>
                      <th className="text-right px-4 py-3 font-semibold min-w-[50px]">
                        #
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.suppliers.map((supplier, idx) => {
                      const maxMonth = getMaxMonth(supplier.months);
                      const pct = getPercentOfTotal(supplier.year_total);
                      return (
                        <tr
                          key={supplier.supplier_name}
                          className={`border-b hover:bg-accent/50 transition-colors ${
                            ROW_COLORS[idx % ROW_COLORS.length]
                          }`}
                        >
                          <td className="px-4 py-3 font-medium sticky left-0" style={{backgroundColor: 'inherit'}}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor: `hsl(${(idx * 47) % 360}, 65%, 55%)`,
                                }}
                              />
                              <span className="truncate max-w-[160px]" title={supplier.supplier_name}>
                                {supplier.supplier_name}
                              </span>
                            </div>
                          </td>
                          {supplier.months.map((m) => {
                            const val = parseFloat(m.total);
                            const intensity =
                              maxMonth > 0 ? Math.round((val / maxMonth) * 100) : 0;
                            return (
                              <td
                                key={m.month}
                                className="text-right px-3 py-3 tabular-nums"
                                title={
                                  m.invoice_count > 0
                                    ? `${m.invoice_count} factura(s)`
                                    : ""
                                }
                              >
                                {val === 0 ? (
                                  <span className="text-muted-foreground/40">—</span>
                                ) : (
                                  <span
                                    style={{
                                      opacity: 0.5 + intensity / 200,
                                    }}
                                  >
                                    {formatCurrency(val)}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="text-right px-4 py-3 font-bold tabular-nums bg-muted/30">
                            {formatCurrency(supplier.year_total)}
                          </td>
                          <td className="text-right px-4 py-3 tabular-nums text-muted-foreground">
                            {pct ? `${pct}%` : "—"}
                          </td>
                          <td className="text-right px-4 py-3 tabular-nums text-muted-foreground">
                            {supplier.year_invoice_count}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Totals row */}
                    <tr className="border-t-2 bg-muted/70 font-bold">
                      <td className="px-4 py-3 sticky left-0 bg-muted/70">
                        TOTAL
                      </td>
                      {report.monthly_totals.map((m) => (
                        <td key={m.month} className="text-right px-3 py-3 tabular-nums">
                          {parseFloat(m.total) === 0 ? (
                            <span className="text-muted-foreground/40">—</span>
                          ) : (
                            formatCurrency(m.total)
                          )}
                        </td>
                      ))}
                      <td className="text-right px-4 py-3 tabular-nums text-lg bg-muted/50">
                        {formatCurrency(report.grand_total)}
                      </td>
                      <td className="text-right px-4 py-3 tabular-nums">
                        100%
                      </td>
                      <td className="text-right px-4 py-3 tabular-nums">
                        {report.suppliers.reduce((s, r) => s + r.year_invoice_count, 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Per-supplier detail cards (top 5) */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Top proveedores — distribución mensual</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {report.suppliers.slice(0, 6).map((supplier, idx) => {
                const maxMonth = getMaxMonth(supplier.months);
                const pct = getPercentOfTotal(supplier.year_total);
                return (
                  <Card key={supplier.supplier_name}>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-semibold text-sm truncate max-w-[200px]" title={supplier.supplier_name}>
                          {supplier.supplier_name}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {pct}% del total
                        </span>
                      </div>
                      <p className="text-xl font-bold mb-3">
                        {formatCurrency(supplier.year_total)}
                      </p>
                      {/* Mini bar chart */}
                      <div className="flex items-end gap-[3px] h-12">
                        {supplier.months.map((m) => {
                          const val = parseFloat(m.total);
                          const height =
                            maxMonth > 0
                              ? Math.max(2, (val / maxMonth) * 100)
                              : 0;
                          return (
                            <div
                              key={m.month}
                              className="flex-1 rounded-t"
                              style={{
                                height: `${height}%`,
                                backgroundColor:
                                  val > 0
                                    ? `hsl(${(idx * 47) % 360}, 65%, 55%)`
                                    : "transparent",
                                minHeight: val > 0 ? "2px" : "0",
                              }}
                              title={`${m.month_name}: ${formatCurrency(val)}`}
                            />
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                        <span>Ene</span>
                        <span>Jun</span>
                        <span>Dic</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
