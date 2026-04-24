"use client";

import { useEffect, useState } from "react";
import { api, NotificationPrefs } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Mail, CheckCircle2, Send, AlertTriangle, RefreshCw } from "lucide-react";

function Toggle({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [userEmail, setUserEmail] = useState("");

  const loadPrefs = () => {
    setLoading(true);
    setError(null);
    api.get<NotificationPrefs>("/notifications/preferences")
      .then((p) => {
        setPrefs(p);
        setEmailDraft(p.notification_email || "");
      })
      .catch((err) => {
        console.error(err);
        setError("No se pudieron cargar las preferencias.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPrefs();
    try {
      const stored = localStorage.getItem("user");
      if (stored) {
        const u = JSON.parse(stored);
        setUserEmail(u.email || "");
      }
    } catch {}
  }, []);

  const save = async (update: Partial<NotificationPrefs>) => {
    try {
      const updated = await api.put<NotificationPrefs>("/notifications/preferences", update);
      setPrefs(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message || "Error al guardar");
      setTimeout(() => setError(null), 4000);
    }
  };

  const saveEmail = () => {
    const email = emailDraft.trim();
    save({ notification_email: email || null });
  };

  if (loading) {
    return <div className="animate-pulse text-muted-foreground">Cargando...</div>;
  }

  if (error || !prefs) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive/60" />
        <div>
          <p className="text-lg font-semibold">Error al cargar configuración</p>
          <p className="text-sm text-muted-foreground mt-1">{error || "Respuesta inesperada del servidor"}</p>
        </div>
        <Button variant="outline" onClick={loadPrefs} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Reintentar
        </Button>
      </div>
    );
  }

  const activeEmail = prefs.notification_email || userEmail || "no configurado";

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configuración</h1>
          <p className="text-muted-foreground">Preferencias de notificaciones</p>
        </div>
        {saved && (
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <CheckCircle2 className="h-4 w-4" />Guardado
          </div>
        )}
      </div>

      {/* Email de notificaciones */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Email de Notificaciones
          </CardTitle>
          <CardDescription>
            Las notificaciones se envían a este email. Si lo dejas vacío, se usa tu email de registro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" />
            Email activo: <span className="font-medium text-foreground">{activeEmail}</span>
          </div>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder={userEmail || "tu-email@empresa.com"}
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
            />
            <Button onClick={saveEmail} variant="outline">
              Guardar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Deja vacío para usar tu email de inicio de sesión ({userEmail || "—"})
          </p>
        </CardContent>
      </Card>

      {/* Toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Tipo de Notificaciones
          </CardTitle>
          <CardDescription>
            Elige qué notificaciones quieres recibir
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <Toggle
            checked={prefs.email_alerts}
            onChange={(v) => save({ email_alerts: v })}
            label="Alertas inmediatas"
            description="Recibir email cuando se detecte un aumento de precio, proveedor nuevo, etc."
          />
          <Toggle
            checked={prefs.email_daily_summary}
            onChange={(v) => save({ email_daily_summary: v })}
            label="Resumen diario"
            description="Recibir un resumen cada mañana con las alertas del día anterior"
          />
          <Toggle
            checked={prefs.email_weekly_summary}
            onChange={(v) => save({ email_weekly_summary: v })}
            label="Resumen semanal"
            description="Recibir un resumen semanal con métricas de margen y alertas"
          />
        </CardContent>
      </Card>
    </div>
  );
}
