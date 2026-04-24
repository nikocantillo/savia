"use client";

import { useEffect, useState } from "react";
import { api, InvoiceListItem, AgingReport } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  TrendingDown,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  unpaid: { label: "Pendiente", variant: "secondary" },
  partial: { label: "Parcial", variant: "outline" },
  paid: { label: "Pagada", variant: "default" },
  overdue: { label: "Vencida", variant: "destructive" },
};

const BUCKET_LABELS: Record<string, string> = {
  current: "Al día",
  "1-30": "1-30 días",
  "31-60": "31-60 días",
  "61-90": "61-90 días",
  "90+": "90+ días",
};

export default function PaymentsPage() {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [aging, setAging] = useState<AgingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [payDialog, setPayDialog] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ payment_method: "", payment_reference: "" });

  const fetchData = async () => {
    try {
      const [inv, ag] = await Promise.all([
        api.get<InvoiceListItem[]>("/payments/pending"),
        api.get<AgingReport>("/payments/aging"),
      ]);
      setInvoices(inv);
      setAging(ag);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const markPaid = async (invoiceId: string) => {
    try {
      await api.put(`/payments/${invoiceId}`, {
        payment_status: "paid",
        payment_method: payForm.payment_method || null,
        payment_reference: payForm.payment_reference || null,
      });
      setPayDialog(null);
      setPayForm({ payment_method: "", payment_reference: "" });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const daysUntilDue = (dueDate: string | null): number | null => {
    if (!dueDate) return null;
    const diff = new Date(dueDate).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return <div className="animate-pulse text-muted-foreground">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cuentas por Pagar</h1>
        <p className="text-muted-foreground">
          Gestiona los pagos a proveedores y controla tu antigüedad de saldos
        </p>
      </div>

      {/* KPI Cards */}
      {aging && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-yellow-500/10 p-2">
                  <Clock className="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {formatCurrency(aging.total_unpaid)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Pendiente</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-500/10 p-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {formatCurrency(aging.total_overdue)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Vencido</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-500/10 p-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {formatCurrency(aging.total_paid_last_30d)}
                  </p>
                  <p className="text-xs text-muted-foreground">Pagado (30 días)</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-500/10 p-2">
                  <CreditCard className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{invoices.length}</p>
                  <p className="text-xs text-muted-foreground">
                    Facturas Pendientes
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Aging Report */}
      {aging && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5" />
              Antigüedad de Saldos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-3">
              {aging.buckets.map((b) => {
                const isOverdue = b.bucket !== "current" && parseFloat(b.total) > 0;
                return (
                  <div
                    key={b.bucket}
                    className={`rounded-lg border p-4 text-center ${
                      isOverdue ? "border-red-200 bg-red-50 dark:bg-red-950/20" : ""
                    }`}
                  >
                    <p className="text-xs text-muted-foreground font-medium">
                      {BUCKET_LABELS[b.bucket] || b.bucket}
                    </p>
                    <p className="text-lg font-bold mt-1">
                      {formatCurrency(b.total)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {b.count} factura{b.count !== 1 ? "s" : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoice List */}
      <Card>
        <CardHeader>
          <CardTitle>Facturas Pendientes de Pago</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500/50 mx-auto mb-4" />
              <p className="text-lg font-medium">Todo al día</p>
              <p className="text-muted-foreground">
                No tienes facturas pendientes de pago
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Proveedor</th>
                    <th className="pb-2 font-medium">N° Factura</th>
                    <th className="pb-2 font-medium">Fecha</th>
                    <th className="pb-2 font-medium">Monto</th>
                    <th className="pb-2 font-medium">Vencimiento</th>
                    <th className="pb-2 font-medium">Estado</th>
                    <th className="pb-2 font-medium w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const days = daysUntilDue(inv.payment_due_date);
                    const isOverdue = days !== null && days < 0;
                    const config = STATUS_CONFIG[inv.payment_status] || STATUS_CONFIG.unpaid;

                    return (
                      <tr key={inv.id} className="border-b last:border-0">
                        <td className="py-3 font-medium">
                          {inv.supplier_name || "—"}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {inv.invoice_number || "—"}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {formatDate(inv.invoice_date)}
                        </td>
                        <td className="py-3 font-medium">
                          {formatCurrency(inv.total)}
                        </td>
                        <td className="py-3">
                          {inv.payment_due_date ? (
                            <span
                              className={
                                isOverdue
                                  ? "text-red-600 font-medium"
                                  : days !== null && days <= 7
                                  ? "text-yellow-600"
                                  : "text-muted-foreground"
                              }
                            >
                              {formatDate(inv.payment_due_date)}
                              {days !== null && (
                                <span className="text-xs ml-1">
                                  ({isOverdue ? `${Math.abs(days)}d vencida` : `${days}d`})
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3">
                          <Badge variant={isOverdue ? "destructive" : config.variant}>
                            {isOverdue ? "Vencida" : config.label}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPayDialog(inv.id)}
                          >
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Pagar
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pay Dialog */}
      <Dialog open={!!payDialog} onOpenChange={() => setPayDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">
                Método de pago
              </label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={payForm.payment_method}
                onChange={(e) =>
                  setPayForm({ ...payForm, payment_method: e.target.value })
                }
              >
                <option value="">Seleccionar...</option>
                <option value="transfer">Transferencia</option>
                <option value="check">Cheque</option>
                <option value="cash">Efectivo</option>
                <option value="credit_card">Tarjeta de Crédito</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">
                Referencia / N° Operación
              </label>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Ej: TRF-123456"
                value={payForm.payment_reference}
                onChange={(e) =>
                  setPayForm({ ...payForm, payment_reference: e.target.value })
                }
              />
            </div>
            <Button
              className="w-full"
              onClick={() => payDialog && markPaid(payDialog)}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Confirmar Pago
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
