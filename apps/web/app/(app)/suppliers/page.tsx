"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Supplier } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
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
  Plus,
  Search,
  Building2,
  Phone,
  Mail,
  User,
  Trash2,
} from "lucide-react";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    tax_id: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    payment_terms_days: 30,
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchSuppliers = () => {
    const q = search ? `?q=${encodeURIComponent(search)}` : "";
    api
      .get<Supplier[]>(`/suppliers${q}`)
      .then(setSuppliers)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSuppliers();
  }, [search]);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post("/suppliers", {
        ...form,
        payment_terms_days: Number(form.payment_terms_days),
      });
      setShowCreate(false);
      setForm({
        name: "",
        tax_id: "",
        contact_name: "",
        contact_email: "",
        contact_phone: "",
        payment_terms_days: 30,
        notes: "",
      });
      fetchSuppliers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar proveedor "${name}"?`)) return;
    try {
      await api.del(`/suppliers/${id}`);
      fetchSuppliers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Proveedores</h1>
          <p className="text-muted-foreground">
            Directorio de proveedores y precios pactados
          </p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Proveedor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Agregar Proveedor</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Nombre del proveedor *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Input
                placeholder="RUT / ID Fiscal"
                value={form.tax_id}
                onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
              />
              <Input
                placeholder="Nombre de contacto"
                value={form.contact_name}
                onChange={(e) =>
                  setForm({ ...form, contact_name: e.target.value })
                }
              />
              <Input
                placeholder="Email de contacto"
                type="email"
                value={form.contact_email}
                onChange={(e) =>
                  setForm({ ...form, contact_email: e.target.value })
                }
              />
              <Input
                placeholder="Teléfono"
                value={form.contact_phone}
                onChange={(e) =>
                  setForm({ ...form, contact_phone: e.target.value })
                }
              />
              <div>
                <label className="text-sm text-muted-foreground">
                  Plazo de pago (días)
                </label>
                <Input
                  type="number"
                  value={form.payment_terms_days}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      payment_terms_days: parseInt(e.target.value) || 30,
                    })
                  }
                />
              </div>
              <textarea
                className="w-full rounded-lg border border-border bg-card text-foreground px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Notas"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={saving || !form.name.trim()}
              >
                {saving ? "Guardando..." : "Crear Proveedor"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar proveedor..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      ) : suppliers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium">Sin proveedores</p>
            <p className="text-muted-foreground">
              Agrega tu primer proveedor para gestionar precios pactados y
              alertas
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((s) => (
            <Link key={s.id} href={`/suppliers/${s.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{s.name}</CardTitle>
                      {s.contact_name && (
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <User className="h-3 w-3" />
                          {s.contact_name}
                        </CardDescription>
                      )}
                    </div>
                    <Badge variant={s.is_active ? "default" : "secondary"}>
                      {s.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {s.contact_phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {s.contact_phone}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div>
                      <span className="text-muted-foreground">Facturas: </span>
                      <span className="font-medium">{s.invoice_count}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total: </span>
                      <span className="font-medium">
                        {formatCurrency(s.total_spend)}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Plazo de pago: {s.payment_terms_days} días
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
