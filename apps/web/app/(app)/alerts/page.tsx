"use client";

import { useEffect, useState } from "react";
import { api, Alert } from "@/lib/api";
import { formatCurrency, formatDate, formatPct } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Bell,
  BellOff,
  Check,
  TrendingUp,
  ShieldAlert,
  UserPlus,
  BarChart3,
  TrendingDown,
} from "lucide-react";

const ALERT_TYPE_CONFIG: Record<
  string,
  {
    label: string;
    icon: typeof TrendingUp;
    color: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  price_increase: {
    label: "Aumento de Precio",
    icon: TrendingUp,
    color: "text-red-600",
    bgColor: "bg-red-500/10",
    borderColor: "border-l-red-500",
  },
  negotiated_price_exceeded: {
    label: "Precio Pactado Excedido",
    icon: ShieldAlert,
    color: "text-orange-600",
    bgColor: "bg-orange-500/10",
    borderColor: "border-l-orange-500",
  },
  new_supplier: {
    label: "Nuevo Proveedor",
    icon: UserPlus,
    color: "text-blue-600",
    bgColor: "bg-blue-500/10",
    borderColor: "border-l-blue-500",
  },
  unusual_volume: {
    label: "Volumen Inusual",
    icon: BarChart3,
    color: "text-purple-600",
    bgColor: "bg-purple-500/10",
    borderColor: "border-l-purple-500",
  },
  low_margin: {
    label: "Margen Bajo",
    icon: TrendingDown,
    color: "text-rose-600",
    bgColor: "bg-rose-500/10",
    borderColor: "border-l-rose-500",
  },
};

const DEFAULT_CONFIG = {
  label: "Alerta",
  icon: Bell,
  color: "text-gray-600",
  bgColor: "bg-gray-500/10",
  borderColor: "border-l-gray-500",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    api
      .get<Alert[]>("/alerts")
      .then(setAlerts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const markAsRead = async (alertId: string) => {
    try {
      const updated = await api.put<Alert>(`/alerts/${alertId}/read`);
      setAlerts((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a))
      );
    } catch (err: any) {
      console.error(err);
    }
  };

  const unreadCount = alerts.filter((a) => !a.is_read).length;
  const filteredAlerts =
    filter === "all" ? alerts : alerts.filter((a) => a.alert_type === filter);

  const typeCounts = alerts.reduce<Record<string, number>>((acc, a) => {
    acc[a.alert_type] = (acc[a.alert_type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Alertas</h1>
          <p className="text-muted-foreground">
            Alertas inteligentes de precios, proveedores y volumen
          </p>
        </div>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="text-sm">
            {unreadCount} sin leer
          </Badge>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          Todas ({alerts.length})
        </Button>
        {Object.entries(ALERT_TYPE_CONFIG).map(([type, config]) => {
          const count = typeCounts[type] || 0;
          if (count === 0) return null;
          const Icon = config.icon;
          return (
            <Button
              key={type}
              variant={filter === type ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(type)}
            >
              <Icon className="mr-1 h-3 w-3" />
              {config.label} ({count})
            </Button>
          );
        })}
      </div>

      {loading ? (
        <div className="animate-pulse text-muted-foreground">
          Cargando alertas...
        </div>
      ) : filteredAlerts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BellOff className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium">Sin alertas</p>
            <p className="text-muted-foreground">
              Las alertas se generan automáticamente al detectar anomalías en
              precios, proveedores o volumen
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => {
            const config =
              ALERT_TYPE_CONFIG[alert.alert_type] || DEFAULT_CONFIG;
            const Icon = config.icon;

            return (
              <Card
                key={alert.id}
                className={
                  alert.is_read
                    ? "opacity-60"
                    : `border-l-4 ${config.borderColor}`
                }
              >
                <CardContent className="flex items-start gap-4 py-4">
                  <div className={`mt-1 rounded-full ${config.bgColor} p-2`}>
                    <Icon className={`h-4 w-4 ${config.color}`} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">
                        {alert.master_item_name || config.label}
                      </p>
                      <Badge variant="outline" className="text-xs">
                        {config.label}
                      </Badge>
                      {!alert.is_read && (
                        <Badge variant="destructive" className="text-xs">
                          Nueva
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {alert.message}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{formatDate(alert.created_at)}</span>
                      {alert.pct_change != null && (
                        <Badge variant="outline" className="text-xs">
                          {formatPct(alert.pct_change)}
                        </Badge>
                      )}
                      {alert.old_avg_price && alert.new_price && (
                        <span>
                          {formatCurrency(alert.old_avg_price)} →{" "}
                          {formatCurrency(alert.new_price)}
                        </span>
                      )}
                    </div>
                  </div>
                  {!alert.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markAsRead(alert.id)}
                    >
                      <Check className="mr-1 h-3 w-3" />
                      Leída
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
