"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, InvoiceDetail, LineItem, MasterItem } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { ArrowLeft, Link2, Plus, Loader2, CheckCircle2, XCircle, Trash2, CreditCard, Clock } from "lucide-react";

const statusVariant: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  pending: "secondary",
  processing: "warning",
  completed: "success",
  failed: "destructive",
};

const statusLabel: Record<string, string> = {
  pending: "Pendiente", processing: "Procesando", completed: "Completada", failed: "Con error",
};

const POLL_INTERVAL = 3000;

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [masterItems, setMasterItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mapping dialog state
  const [mappingLineItem, setMappingLineItem] = useState<LineItem | null>(null);
  const [selectedMasterItemId, setSelectedMasterItemId] = useState<string>("");
  const [newMasterItemName, setNewMasterItemName] = useState("");
  const [mappingLoading, setMappingLoading] = useState(false);

  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Payment state
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [payForm, setPayForm] = useState({ payment_method: "", payment_reference: "" });
  const [payLoading, setPayLoading] = useState(false);

  const isProcessing = (status?: string) =>
    status === "pending" || status === "processing";

  const fetchInvoice = useCallback(async () => {
    try {
      const [inv, items] = await Promise.all([
        api.get<InvoiceDetail>(`/invoices/${invoiceId}`),
        api.get<MasterItem[]>("/master-items"),
      ]);
      setInvoice(inv);
      setMasterItems(items);
      return inv;
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  // Start/stop polling based on invoice status
  const managePoll = useCallback(
    (inv: InvoiceDetail | null) => {
      if (inv && isProcessing(inv.status)) {
        if (!pollRef.current) {
          pollRef.current = setInterval(async () => {
            const fresh = await fetchInvoice();
            if (fresh && !isProcessing(fresh.status)) {
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
            }
          }, POLL_INTERVAL);
        }
      } else {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    },
    [fetchInvoice]
  );

  // Initial fetch
  useEffect(() => {
    fetchInvoice().then(managePoll);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchInvoice, managePoll]);

  // React to invoice changes
  useEffect(() => {
    managePoll(invoice);
  }, [invoice, managePoll]);

  const handleMapItem = async () => {
    if (!mappingLineItem) return;
    setMappingLoading(true);
    try {
      const body: any = {};
      if (selectedMasterItemId && selectedMasterItemId !== "__new__") {
        body.master_item_id = selectedMasterItemId;
      } else if (newMasterItemName) {
        body.new_master_item_name = newMasterItemName;
      } else {
        return;
      }

      const updated = await api.post<LineItem>(
        `/line-items/${mappingLineItem.id}/map-master-item`,
        body
      );

      // Update local state
      if (invoice) {
        const updatedItems = invoice.line_items.map((li) =>
          li.id === updated.id ? updated : li
        );
        setInvoice({ ...invoice, line_items: updatedItems });
      }

      // Refresh master items
      const items = await api.get<MasterItem[]>("/master-items");
      setMasterItems(items);

      setMappingLineItem(null);
      setSelectedMasterItemId("");
      setNewMasterItemName("");
    } catch (err: any) {
      alert(err.message || "No se pudo vincular el producto");
    } finally {
      setMappingLoading(false);
    }
  };

  const handleMarkPaid = async () => {
    setPayLoading(true);
    try {
      await api.put(`/payments/${invoiceId}`, {
        payment_status: "paid",
        payment_method: payForm.payment_method || null,
        payment_reference: payForm.payment_reference || null,
      });
      setShowPayDialog(false);
      setPayForm({ payment_method: "", payment_reference: "" });
      fetchInvoice();
    } catch (err: any) {
      alert(err.message || "Error al registrar pago");
    } finally {
      setPayLoading(false);
    }
  };

  const handleMarkUnpaid = async () => {
    try {
      await api.put(`/payments/${invoiceId}`, { payment_status: "unpaid" });
      fetchInvoice();
    } catch (err: any) {
      alert(err.message || "Error al actualizar estado");
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.del(`/invoices/${invoiceId}`);
      router.push("/invoices");
    } catch (err: any) {
      alert(err.message || "No se pudo eliminar la factura");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
        Cargando factura...
      </div>
    );
  }

  if (!invoice) {
    return <div className="text-destructive">Factura no encontrada</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <Button variant="ghost" size="icon" className="shrink-0 self-start" onClick={() => router.push("/invoices")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold break-words">
            {isProcessing(invoice.status) ? (
              <span className="flex items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-yellow-500" />
                Procesando factura...
              </span>
            ) : (
              invoice.supplier_name || "Factura"
            )}
          </h1>
          <p className="text-muted-foreground">
            {invoice.invoice_number && `#${invoice.invoice_number} · `}
            {formatDate(invoice.invoice_date)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Badge variant={statusVariant[invoice.status]} className="text-sm">
            {isProcessing(invoice.status) && (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            )}
            {invoice.status === "completed" && (
              <CheckCircle2 className="mr-1 h-3 w-3" />
            )}
            {invoice.status === "failed" && (
              <XCircle className="mr-1 h-3 w-3" />
            )}
            {statusLabel[invoice.status] || invoice.status}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Eliminar
          </Button>
        </div>
      </div>

      {/* Processing banner */}
      {isProcessing(invoice.status) && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950 px-4 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-yellow-600 dark:text-yellow-400" />
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Extrayendo datos de la factura...
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              OCR e IA están analizando el documento. Esta página se actualizará automáticamente.
            </p>
          </div>
        </div>
      )}

      {/* Invoice summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {isProcessing(invoice.status) ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                formatCurrency(invoice.total, invoice.currency)
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Moneda</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{invoice.currency}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Líneas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {isProcessing(invoice.status) ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                invoice.line_items.length
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pago</CardTitle>
          </CardHeader>
          <CardContent>
            {invoice.payment_status === "paid" ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-lg font-bold text-green-600">Pagada</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                <span className="text-lg font-bold text-yellow-600">Pendiente</span>
              </div>
            )}
            {invoice.payment_due_date && invoice.payment_status !== "paid" && (
              <p className="text-xs text-muted-foreground mt-1">
                Vence: {formatDate(invoice.payment_due_date)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment action bar */}
      {invoice.status === "completed" && (
        <Card className={invoice.payment_status === "paid" ? "border-green-200 bg-green-50 dark:bg-green-950/20" : "border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20"}>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between py-4">
            {invoice.payment_status === "paid" ? (
              <>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">
                      Factura pagada
                      {invoice.payment_method && ` · ${invoice.payment_method}`}
                      {invoice.payment_reference && ` · Ref: ${invoice.payment_reference}`}
                    </p>
                    {invoice.paid_at && (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Pagada el {formatDate(invoice.paid_at)}
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={handleMarkUnpaid}>
                  Revertir a pendiente
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-yellow-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      Pago pendiente
                      {invoice.payment_due_date && ` · Vence: ${formatDate(invoice.payment_due_date)}`}
                    </p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      Marca como pagada cuando realices el pago al proveedor
                    </p>
                  </div>
                </div>
                <Button size="sm" className="w-full sm:w-auto" onClick={() => setShowPayDialog(true)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Marcar como Pagada
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error message */}
      {invoice.error_message && (
        <Card className="border-destructive">
          <CardContent className="py-4 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            <p className="text-sm text-destructive">{invoice.error_message}</p>
          </CardContent>
        </Card>
      )}

      {/* Line items table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Líneas Extraídas</CardTitle>
          <CardDescription>Haz clic en &quot;Vincular&quot; para asignar una línea a un producto maestro</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Descripción</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Producto Maestro</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Cant.</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Unidad</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Precio Unit.</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">Acción</th>
                </tr>
              </thead>
              <tbody>
                {invoice.line_items.map((li) => (
                  <tr key={li.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium">{li.raw_description}</div>
                      {li.normalized_description && li.normalized_description !== li.raw_description && (
                        <div className="text-xs text-muted-foreground">{li.normalized_description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {li.master_item_name ? (
                        <Badge variant="outline">{li.master_item_name}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Sin vincular</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">{li.quantity || "—"}</td>
                    <td className="px-4 py-3 text-sm">{li.unit || "—"}</td>
                    <td className="px-4 py-3 text-right text-sm">{formatCurrency(li.unit_price)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium">{formatCurrency(li.total_price)}</td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setMappingLineItem(li);
                          setSelectedMasterItemId(li.master_item_id || "");
                          setNewMasterItemName("");
                        }}
                      >
                        <Link2 className="mr-1 h-3 w-3" />
                        Vincular
                      </Button>
                    </td>
                  </tr>
                ))}
                {invoice.line_items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      {isProcessing(invoice.status) ? (
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
                          <div>
                            <p className="font-medium">Extrayendo líneas...</p>
                            <p className="text-xs">La IA está analizando la factura. Los resultados aparecerán aquí automáticamente.</p>
                          </div>
                        </div>
                      ) : (
                        "No se extrajeron líneas de detalle."
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Mapping dialog */}
      <Dialog open={!!mappingLineItem} onOpenChange={(open) => !open && setMappingLineItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular Línea</DialogTitle>
            <DialogDescription>
              Asignar &quot;{mappingLineItem?.raw_description}&quot; a un producto maestro
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Seleccionar producto maestro existente</label>
              <Select value={selectedMasterItemId} onValueChange={setSelectedMasterItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Elige un producto maestro..." />
                </SelectTrigger>
                <SelectContent>
                  {masterItems.map((mi) => (
                    <SelectItem key={mi.id} value={mi.id}>{mi.name}</SelectItem>
                  ))}
                  <SelectItem value="__new__">
                    <span className="flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Crear producto nuevo
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedMasterItemId === "__new__" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Nombre del nuevo producto</label>
                <Input
                  value={newMasterItemName}
                  onChange={(e) => setNewMasterItemName(e.target.value)}
                  placeholder="Ej.: Pechuga de pollo 5kg"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMappingLineItem(null)}>
                Cancelar
              </Button>
              <Button
                onClick={handleMapItem}
                disabled={
                  mappingLoading ||
                  (!selectedMasterItemId && !newMasterItemName) ||
                  (selectedMasterItemId === "__new__" && !newMasterItemName)
                }
              >
                {mappingLoading ? "Guardando..." : "Guardar Vinculación"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
            <DialogDescription>
              {invoice.supplier_name && `Pago a ${invoice.supplier_name} · `}
              {formatCurrency(invoice.total, invoice.currency)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Método de pago</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={payForm.payment_method}
                onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })}
              >
                <option value="">Seleccionar...</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Cheque">Cheque</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Tarjeta">Tarjeta de Crédito</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Referencia / N° Operación</label>
              <Input
                placeholder="Ej: TRF-123456"
                value={payForm.payment_reference}
                onChange={(e) => setPayForm({ ...payForm, payment_reference: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPayDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleMarkPaid} disabled={payLoading}>
                {payLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</>
                ) : (
                  <><CheckCircle2 className="mr-2 h-4 w-4" /> Confirmar Pago</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Factura</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar esta factura? También se eliminarán todas las líneas extraídas. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border p-3 bg-muted/50 text-sm space-y-1">
            <p><span className="font-medium">Proveedor:</span> {invoice.supplier_name || "Desconocido"}</p>
            {invoice.invoice_number && (
              <p><span className="font-medium">N° Factura:</span> {invoice.invoice_number}</p>
            )}
            {invoice.total && (
              <p><span className="font-medium">Total:</span> {formatCurrency(invoice.total, invoice.currency)}</p>
            )}
            <p><span className="font-medium">Líneas:</span> {invoice.line_items.length}</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar Factura
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
