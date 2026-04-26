"use client";

import { useEffect, useState } from "react";
import { api, Branch, DailySalesEntry } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, MapPin, Phone, Store, DollarSign, Trash2 } from "lucide-react";

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [sales, setSales] = useState<DailySalesEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBranch, setShowBranch] = useState(false);
  const [showSale, setShowSale] = useState(false);
  const [branchForm, setBranchForm] = useState({ name: "", address: "", phone: "" });
  const [saleForm, setSaleForm] = useState({
    branch_id: "",
    date: new Date().toISOString().slice(0, 10),
    total_revenue: "",
    transaction_count: "",
    notes: "",
  });

  const fetchData = async () => {
    try {
      const [b, s] = await Promise.all([
        api.get<Branch[]>("/branches"),
        api.get<DailySalesEntry[]>("/sales"),
      ]);
      setBranches(b);
      setSales(s);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreateBranch = async () => {
    if (!branchForm.name.trim()) return;
    try {
      await api.post("/branches", branchForm);
      setShowBranch(false);
      setBranchForm({ name: "", address: "", phone: "" });
      fetchData();
    } catch (err: any) { alert(err.message); }
  };

  const handleDeleteBranch = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar sucursal "${name}"?`)) return;
    try {
      await api.del(`/branches/${id}`);
      fetchData();
    } catch (err: any) { alert(err.message); }
  };

  const handleCreateSale = async () => {
    if (!saleForm.total_revenue) return;
    try {
      await api.post("/sales", {
        branch_id: saleForm.branch_id || null,
        date: saleForm.date,
        total_revenue: parseFloat(saleForm.total_revenue),
        transaction_count: saleForm.transaction_count ? parseInt(saleForm.transaction_count) : null,
        notes: saleForm.notes || null,
      });
      setShowSale(false);
      setSaleForm({ branch_id: "", date: new Date().toISOString().slice(0, 10), total_revenue: "", transaction_count: "", notes: "" });
      fetchData();
    } catch (err: any) { alert(err.message); }
  };

  const handleDeleteSale = async (id: string) => {
    if (!confirm("¿Eliminar este registro de venta?")) return;
    try {
      await api.del(`/sales/${id}`);
      fetchData();
    } catch (err: any) { alert(err.message); }
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Cargando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Sucursales y Ventas</h1>
        <p className="text-muted-foreground">
          Administra tus ubicaciones y registra las ventas diarias
        </p>
      </div>

      <Tabs defaultValue="branches">
        <TabsList>
          <TabsTrigger value="branches">Sucursales ({branches.length})</TabsTrigger>
          <TabsTrigger value="sales">Ventas Diarias ({sales.length})</TabsTrigger>
        </TabsList>

        {/* ── Branches Tab ────────────────────────────────────────── */}
        <TabsContent value="branches" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={showBranch} onOpenChange={setShowBranch}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Nueva Sucursal</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Agregar Sucursal</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="Nombre *" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} />
                  <Input placeholder="Dirección" value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} />
                  <Input placeholder="Teléfono" value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} />
                  <Button className="w-full" onClick={handleCreateBranch} disabled={!branchForm.name.trim()}>Crear Sucursal</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {branches.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Store className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium">Sin sucursales</p>
                <p className="text-muted-foreground">Agrega tu primera sucursal para gestionar multi-local</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {branches.map((b) => (
                <Card key={b.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{b.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant={b.is_active ? "default" : "secondary"}>
                          {b.is_active ? "Activa" : "Inactiva"}
                        </Badge>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteBranch(b.id, b.name)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {b.address && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-3 w-3" />{b.address}
                      </div>
                    )}
                    {b.phone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3 w-3" />{b.phone}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Sales Tab ───────────────────────────────────────────── */}
        <TabsContent value="sales" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={showSale} onOpenChange={setShowSale}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Registrar Venta</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Registrar Venta Diaria</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-muted-foreground">Sucursal</label>
                    <select className="w-full rounded-lg border border-border bg-card text-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" value={saleForm.branch_id} onChange={(e) => setSaleForm({ ...saleForm, branch_id: e.target.value })}>
                      <option value="">General (sin sucursal)</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Fecha</label>
                    <Input type="date" value={saleForm.date} onChange={(e) => setSaleForm({ ...saleForm, date: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Ingreso Total *</label>
                    <Input type="number" step="0.01" placeholder="0.00" value={saleForm.total_revenue} onChange={(e) => setSaleForm({ ...saleForm, total_revenue: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">N° Transacciones</label>
                    <Input type="number" placeholder="Opcional" value={saleForm.transaction_count} onChange={(e) => setSaleForm({ ...saleForm, transaction_count: e.target.value })} />
                  </div>
                  <Input placeholder="Notas (opcional)" value={saleForm.notes} onChange={(e) => setSaleForm({ ...saleForm, notes: e.target.value })} />
                  <Button className="w-full" onClick={handleCreateSale} disabled={!saleForm.total_revenue}>Guardar</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {sales.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <DollarSign className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium">Sin registros de venta</p>
                <p className="text-muted-foreground">Registra tus ventas diarias para calcular el margen</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fecha</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Sucursal</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ingresos</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">Transacciones</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Notas</th>
                        <th className="px-4 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map((s) => (
                        <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{formatDate(s.date)}</td>
                          <td className="px-4 py-3">
                            {s.branch_name ? <Badge variant="outline">{s.branch_name}</Badge> : <span className="text-muted-foreground">General</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">{formatCurrency(s.total_revenue)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{s.transaction_count || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate">{s.notes || "—"}</td>
                          <td className="px-4 py-3">
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteSale(s.id)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
