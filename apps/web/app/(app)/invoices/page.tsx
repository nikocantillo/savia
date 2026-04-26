"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { api, InvoiceListItem } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Upload, FileText, ExternalLink, Loader2, Trash2, CloudUpload } from "lucide-react";
import { TableSkeleton } from "@/components/skeleton-loader";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

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
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragCounterRef = useRef(0);
  const { toast } = useToast();

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

  const hasPendingInvoices = (list: InvoiceListItem[]) =>
    list.some((inv) => inv.status === "pending" || inv.status === "processing");

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

  useEffect(() => {
    fetchInvoices().then(managePoll);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchInvoices, managePoll]);

  useEffect(() => {
    managePoll(invoices);
  }, [invoices, managePoll]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      await api.post("/invoices/upload", formData);
      toast("success", `"${file.name}" subida correctamente`);
      const fresh = await fetchInvoices();
      managePoll(fresh);
    } catch (err: any) {
      toast("error", err.message || "Error al subir la factura");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.del(`/invoices/${deleteTarget.id}`);
      toast("success", "Factura eliminada");
      setDeleteTarget(null);
      await fetchInvoices();
    } catch (err: any) {
      toast("error", err.message || "No se pudo eliminar la factura");
    } finally {
      setDeleting(false);
    }
  };

  const pendingCount = invoices.filter(
    (inv) => inv.status === "pending" || inv.status === "processing"
  ).length;

  return (
    <div
      className="space-y-6"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 p-12 rounded-2xl border-2 border-dashed border-primary bg-primary/5 animate-pulse">
            <CloudUpload className="h-16 w-16 text-primary" />
            <p className="text-lg font-semibold text-primary">Suelta el archivo aquí</p>
            <p className="text-sm text-muted-foreground">PDF, imagen o XML</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Facturas</h1>
          <p className="text-muted-foreground">Carga y gestiona facturas de proveedores</p>
        </div>
        <div className="w-full sm:w-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp,.webp,.xml"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            className="w-full sm:w-auto gradient-brand border-0 text-white shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {uploading ? "Subiendo..." : "Subir Factura"}
          </Button>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-500/10">
            <Loader2 className="h-4 w-4 animate-spin text-yellow-600 dark:text-yellow-400" />
          </div>
          <span className="text-yellow-800 dark:text-yellow-200">
            {pendingCount === 1
              ? "1 factura se está procesando..."
              : `Se están procesando ${pendingCount} facturas...`}
            <span className="ml-1 text-yellow-600/70 dark:text-yellow-400/70">Actualización automática</span>
          </span>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : invoices.length === 0 ? (
        <div
          className={cn(
            "rounded-2xl border-2 border-dashed p-12 transition-all duration-200 cursor-pointer",
            "border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5"
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl gradient-brand shadow-lg shadow-primary/20 mb-6">
              <CloudUpload className="h-10 w-10 text-white" />
            </div>
            <p className="text-xl font-semibold mb-2">Sube tu primera factura</p>
            <p className="text-muted-foreground max-w-sm mb-6">
              Arrastra y suelta un archivo aquí, o haz clic para seleccionar. La IA extraerá toda la información automáticamente.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {["PDF", "PNG", "JPG", "XML"].map((fmt) => (
                <span key={fmt} className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                  {fmt}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <Card className="border-0 shadow-md overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Proveedor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">N° Factura</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fecha</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className={cn(
                        "border-b last:border-0 transition-colors group",
                        inv.status === "processing"
                          ? "bg-yellow-500/5"
                          : "hover:bg-muted/40"
                      )}
                    >
                      <td className="px-4 py-3.5 text-sm font-medium">
                        {inv.status === "pending" || inv.status === "processing" ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            <span className="text-muted-foreground">{inv.supplier_name || "Extrayendo..."}</span>
                          </span>
                        ) : (
                          inv.supplier_name || "—"
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-muted-foreground">{inv.invoice_number || "—"}</td>
                      <td className="px-4 py-3.5 text-sm text-muted-foreground">{formatDate(inv.invoice_date)}</td>
                      <td className="px-4 py-3.5 text-right text-sm font-semibold">{formatCurrency(inv.total, inv.currency)}</td>
                      <td className="px-4 py-3.5 text-center">
                        <Badge variant={statusVariant[inv.status] || "secondary"} className="text-xs">
                          {inv.status === "processing" && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          )}
                          {statusLabel[inv.status] || inv.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/invoices/${inv.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
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

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Factura</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar esta factura? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-xl border p-4 bg-muted/30 text-sm space-y-1.5">
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
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Eliminando...</>
              ) : (
                <><Trash2 className="mr-2 h-4 w-4" />Eliminar</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
