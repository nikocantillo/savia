"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { api, InvoiceListItem } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Upload, FileText, ExternalLink, Loader2, Trash2 } from "lucide-react";

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

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchInvoices = useCallback(async () => {
    try {
      const data = await api.get<InvoiceListItem[]>("/invoices");
      setInvoices(data);
      return data;
    } catch (err) {
      console.error(err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Check if any invoices are still being processed
  const hasPendingInvoices = (list: InvoiceListItem[]) =>
    list.some((inv) => inv.status === "pending" || inv.status === "processing");

  // Start/stop polling based on whether there are pending invoices
  const managePoll = useCallback(
    (list: InvoiceListItem[]) => {
      if (hasPendingInvoices(list)) {
        if (!pollRef.current) {
          pollRef.current = setInterval(async () => {
            const fresh = await fetchInvoices();
            if (!hasPendingInvoices(fresh)) {
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
    [fetchInvoices]
  );

  // Initial fetch
  useEffect(() => {
    fetchInvoices().then(managePoll);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchInvoices, managePoll]);

  // React to invoice list changes to manage polling
  useEffect(() => {
    managePoll(invoices);
  }, [invoices, managePoll]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await api.post("/invoices/upload", formData);
      const fresh = await fetchInvoices();
      managePoll(fresh);
    } catch (err: any) {
      alert(err.message || "Error al subir la factura");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.del(`/invoices/${deleteTarget.id}`);
      setDeleteTarget(null);
      await fetchInvoices();
    } catch (err: any) {
      alert(err.message || "No se pudo eliminar la factura");
    } finally {
      setDeleting(false);
    }
  };

  const pendingCount = invoices.filter(
    (inv) => inv.status === "pending" || inv.status === "processing"
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Facturas</h1>
          <p className="text-muted-foreground">Carga y gestiona facturas de proveedores</p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp,.webp"
            className="hidden"
            onChange={handleUpload}
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "Subiendo..." : "Subir Factura"}
          </Button>
        </div>
      </div>

      {/* Processing banner */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950 px-4 py-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-yellow-600 dark:text-yellow-400" />
          <span className="text-yellow-800 dark:text-yellow-200">
            {pendingCount === 1
              ? "1 factura se está procesando..."
              : `Se están procesando ${pendingCount} facturas...`}
            <span className="ml-1 text-yellow-600 dark:text-yellow-400">Actualización automática</span>
          </span>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse text-muted-foreground">Cargando facturas...</div>
      ) : invoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium">Aún no hay facturas</p>
            <p className="text-muted-foreground">Sube tu primera factura para comenzar</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Proveedor</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">N° Factura</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Fecha</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Total</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">Estado</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${
                        inv.status === "processing" ? "bg-yellow-50/50 dark:bg-yellow-950/20" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-sm font-medium">
                        {inv.status === "pending" || inv.status === "processing" ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            {inv.supplier_name || "Extrayendo..."}
                          </span>
                        ) : (
                          inv.supplier_name || "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{inv.invoice_number || "—"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(inv.invoice_date)}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium">{formatCurrency(inv.total, inv.currency)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={statusVariant[inv.status] || "secondary"}>
                          {inv.status === "processing" && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          )}
                          {statusLabel[inv.status] || inv.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/invoices/${inv.id}`}>
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(inv)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Factura</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar esta factura? También se eliminarán todas las líneas extraídas. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-lg border p-3 bg-muted/50 text-sm space-y-1">
              <p><span className="font-medium">Proveedor:</span> {deleteTarget.supplier_name || "Desconocido"}</p>
              {deleteTarget.invoice_number && (
                <p><span className="font-medium">N° Factura:</span> {deleteTarget.invoice_number}</p>
              )}
              {deleteTarget.total && (
                <p><span className="font-medium">Total:</span> {formatCurrency(deleteTarget.total, deleteTarget.currency)}</p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
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
