"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, Supplier, NegotiatedPrice, MasterItem } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Building2,
  Mail,
  Phone,
  User,
  FileText,
  DollarSign,
  Clock,
  Edit,
} from "lucide-react";

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [prices, setPrices] = useState<NegotiatedPrice[]>([]);
  const [masterItems, setMasterItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPrice, setShowAddPrice] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [priceForm, setPriceForm] = useState({
    master_item_id: "",
    price: "",
    effective_from: "",
    effective_until: "",
  });
  const [editForm, setEditForm] = useState({
    name: "",
    tax_id: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    payment_terms_days: 30,
    notes: "",
  });

  const fetchData = async () => {
    try {
      const [s, p, items] = await Promise.all([
        api.get<Supplier>(`/suppliers/${id}`),
        api.get<NegotiatedPrice[]>(`/suppliers/${id}/prices`),
        api.get<MasterItem[]>("/master-items"),
      ]);
      setSupplier(s);
      setPrices(p);
      setMasterItems(items);
      setEditForm({
        name: s.name,
        tax_id: s.tax_id || "",
        contact_name: s.contact_name || "",
        contact_email: s.contact_email || "",
        contact_phone: s.contact_phone || "",
        payment_terms_days: s.payment_terms_days,
        notes: s.notes || "",
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleAddPrice = async () => {
    if (!priceForm.master_item_id || !priceForm.price) return;
    try {
      await api.post(`/suppliers/${id}/prices`, {
        master_item_id: priceForm.master_item_id,
        price: parseFloat(priceForm.price),
        effective_from: priceForm.effective_from || null,
        effective_until: priceForm.effective_until || null,
      });
      setShowAddPrice(false);
      setPriceForm({ master_item_id: "", price: "", effective_from: "", effective_until: "" });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeletePrice = async (priceId: string) => {
    if (!confirm("¿Eliminar este precio pactado?")) return;
    try {
      await api.del(`/suppliers/${id}/prices/${priceId}`);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdate = async () => {
    try {
      await api.put(`/suppliers/${id}`, {
        ...editForm,
        payment_terms_days: Number(editForm.payment_terms_days),
      });
      setShowEdit(false);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return <div className="animate-pulse text-muted-foreground">Cargando...</div>;
  }

  if (!supplier) {
    return <div className="text-muted-foreground">Proveedor no encontrado</div>;
  }

  const usedItemIds = new Set(prices.map((p) => p.master_item_id));
  const availableItems = masterItems.filter((mi) => !usedItemIds.has(mi.id));

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push("/suppliers")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Volver a Proveedores
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{supplier.name}</h1>
            <Badge variant={supplier.is_active ? "default" : "secondary"}>
              {supplier.is_active ? "Activo" : "Inactivo"}
            </Badge>
          </div>
          {supplier.tax_id && (
            <p className="text-muted-foreground mt-1">RUT: {supplier.tax_id}</p>
          )}
        </div>
        <Dialog open={showEdit} onOpenChange={setShowEdit}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Proveedor</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Nombre *" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              <Input placeholder="RUT / ID Fiscal" value={editForm.tax_id} onChange={(e) => setEditForm({ ...editForm, tax_id: e.target.value })} />
              <Input placeholder="Contacto" value={editForm.contact_name} onChange={(e) => setEditForm({ ...editForm, contact_name: e.target.value })} />
              <Input placeholder="Email" value={editForm.contact_email} onChange={(e) => setEditForm({ ...editForm, contact_email: e.target.value })} />
              <Input placeholder="Teléfono" value={editForm.contact_phone} onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })} />
              <Input type="number" placeholder="Plazo de pago" value={editForm.payment_terms_days} onChange={(e) => setEditForm({ ...editForm, payment_terms_days: parseInt(e.target.value) || 30 })} />
              <textarea className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Notas" rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              <Button className="w-full" onClick={handleUpdate}>Guardar Cambios</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{supplier.invoice_count}</p>
                <p className="text-xs text-muted-foreground">Facturas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-green-500/10 p-2">
                <DollarSign className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(supplier.total_spend)}</p>
                <p className="text-xs text-muted-foreground">Total Comprado</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-blue-500/10 p-2">
                <Clock className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{supplier.payment_terms_days}d</p>
                <p className="text-xs text-muted-foreground">Plazo de Pago</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-1">
            {supplier.contact_name && (
              <div className="flex items-center gap-2 text-sm"><User className="h-3 w-3 text-muted-foreground" /> {supplier.contact_name}</div>
            )}
            {supplier.contact_phone && (
              <div className="flex items-center gap-2 text-sm"><Phone className="h-3 w-3 text-muted-foreground" /> {supplier.contact_phone}</div>
            )}
            {supplier.contact_email && (
              <div className="flex items-center gap-2 text-sm"><Mail className="h-3 w-3 text-muted-foreground" /> {supplier.contact_email}</div>
            )}
            {!supplier.contact_name && !supplier.contact_phone && !supplier.contact_email && (
              <p className="text-sm text-muted-foreground">Sin datos de contacto</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Negotiated Prices */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Precios Pactados</CardTitle>
          <Dialog open={showAddPrice} onOpenChange={setShowAddPrice}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Agregar Precio
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo Precio Pactado</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-muted-foreground">Producto</label>
                  <select
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={priceForm.master_item_id}
                    onChange={(e) => setPriceForm({ ...priceForm, master_item_id: e.target.value })}
                  >
                    <option value="">Seleccionar producto...</option>
                    {availableItems.map((mi) => (
                      <option key={mi.id} value={mi.id}>
                        {mi.name} ({mi.category})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Precio Unitario Pactado</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={priceForm.price}
                    onChange={(e) => setPriceForm({ ...priceForm, price: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-muted-foreground">Vigente desde</label>
                    <Input
                      type="date"
                      value={priceForm.effective_from}
                      onChange={(e) => setPriceForm({ ...priceForm, effective_from: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Vigente hasta</label>
                    <Input
                      type="date"
                      value={priceForm.effective_until}
                      onChange={(e) => setPriceForm({ ...priceForm, effective_until: e.target.value })}
                    />
                  </div>
                </div>
                <Button className="w-full" onClick={handleAddPrice} disabled={!priceForm.master_item_id || !priceForm.price}>
                  Guardar Precio Pactado
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {prices.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No hay precios pactados. Agrega uno para recibir alertas cuando un proveedor cobre de más.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Producto</th>
                    <th className="pb-2 font-medium">Precio Pactado</th>
                    <th className="pb-2 font-medium">Desde</th>
                    <th className="pb-2 font-medium">Hasta</th>
                    <th className="pb-2 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-3 font-medium">{p.master_item_name}</td>
                      <td className="py-3">{formatCurrency(p.price)}</td>
                      <td className="py-3 text-muted-foreground">
                        {p.effective_from ? formatDate(p.effective_from) : "—"}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {p.effective_until ? formatDate(p.effective_until) : "Indefinido"}
                      </td>
                      <td className="py-3">
                        <Button variant="ghost" size="sm" onClick={() => handleDeletePrice(p.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {supplier.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{supplier.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
