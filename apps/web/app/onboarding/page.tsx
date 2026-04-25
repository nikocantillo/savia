"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Package, ArrowRight, ArrowLeft, Building2, Target, CheckCircle2 } from "lucide-react";

const STEPS = ["Organización", "Sucursales", "Objetivos", "Listo"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    organization_name: "",
    branches: [""],
    food_cost_target_pct: 30,
    alert_threshold_pct: 10,
  });

  const addBranch = () => setForm({ ...form, branches: [...form.branches, ""] });
  const updateBranch = (i: number, v: string) => {
    const b = [...form.branches];
    b[i] = v;
    setForm({ ...form, branches: b });
  };
  const removeBranch = (i: number) => {
    if (form.branches.length <= 1) return;
    setForm({ ...form, branches: form.branches.filter((_, idx) => idx !== i) });
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      await api.post("/onboarding/complete", {
        organization_name: form.organization_name || undefined,
        food_cost_target_pct: form.food_cost_target_pct,
        alert_threshold_pct: form.alert_threshold_pct,
        branches: form.branches.filter((b) => b.trim()),
        onboarding_completed: true,
      });
      router.push("/dashboard");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2">
          <Package className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold">Savia</span>
        </div>

        {/* Progress */}
        <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 sm:gap-2">
              <div className={`h-2 w-8 sm:w-12 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Paso {step + 1} de {STEPS.length}: {STEPS[step]}
        </p>

        {/* Step 0: Organization */}
        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Tu Organización</CardTitle>
              <CardDescription>Cuéntanos sobre tu empresa</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nombre de la empresa</label>
                <Input
                  placeholder="Ej: Restaurante El Buen Sabor"
                  value={form.organization_name}
                  onChange={(e) => setForm({ ...form, organization_name: e.target.value })}
                />
              </div>
              <Button className="w-full" onClick={() => setStep(1)}>
                Siguiente <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 1: Branches */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Sucursales
              </CardTitle>
              <CardDescription>
                Agrega las ubicaciones de tu negocio (puedes agregar más después)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {form.branches.map((b, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder={`Sucursal ${i + 1}`}
                    value={b}
                    onChange={(e) => updateBranch(i, e.target.value)}
                  />
                  {form.branches.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeBranch(i)}>
                      ×
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addBranch} className="w-full">
                + Agregar otra sucursal
              </Button>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(0)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />Atrás
                </Button>
                <Button className="flex-1" onClick={() => setStep(2)}>
                  Siguiente <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Targets */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Objetivos
              </CardTitle>
              <CardDescription>Define tus metas de control de costos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Objetivo de Costo de Alimentos (%)</label>
                <Input
                  type="number"
                  min="1" max="99"
                  value={form.food_cost_target_pct}
                  onChange={(e) => setForm({ ...form, food_cost_target_pct: parseInt(e.target.value) || 30 })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Industria típica: 25-35%. Te alertaremos cuando supere este umbral.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Umbral de alerta de precio (%)</label>
                <Input
                  type="number"
                  min="1" max="100"
                  value={form.alert_threshold_pct}
                  onChange={(e) => setForm({ ...form, alert_threshold_pct: parseInt(e.target.value) || 10 })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Recibirás alertas cuando un insumo suba más de este % sobre su promedio.
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />Atrás
                </Button>
                <Button className="flex-1" onClick={() => setStep(3)}>
                  Siguiente <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                ¡Todo listo!
              </CardTitle>
              <CardDescription>Tu configuración inicial está completa</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2 text-sm">
                {form.organization_name && <p><strong>Empresa:</strong> {form.organization_name}</p>}
                <p><strong>Sucursales:</strong> {form.branches.filter(b => b.trim()).length || "Ninguna aún"}</p>
                <p><strong>Costo de Alimentos objetivo:</strong> {form.food_cost_target_pct}%</p>
                <p><strong>Umbral de alertas:</strong> {form.alert_threshold_pct}%</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Puedes cambiar todo esto después en Configuración. Ahora puedes empezar a subir facturas y registrar ventas.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />Atrás
                </Button>
                <Button className="flex-1" onClick={handleComplete} disabled={saving}>
                  {saving ? "Guardando..." : "Comenzar a usar Savia"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
