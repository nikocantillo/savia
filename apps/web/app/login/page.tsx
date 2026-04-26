"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, TokenResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Brain, ArrowRight, Sparkles } from "lucide-react";

const isDev = process.env.NEXT_PUBLIC_API_URL?.includes("localhost") ||
  process.env.NEXT_PUBLIC_API_URL?.includes("127.0.0.1") ||
  !process.env.NEXT_PUBLIC_API_URL;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api.post<TokenResponse>("/auth/login", { email, password });
      localStorage.setItem("token", data.access_token);
      localStorage.setItem(
        "user",
        JSON.stringify({
          user_id: data.user_id,
          organization_id: data.organization_id,
          email: data.email,
          full_name: data.full_name,
        })
      );
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const handleMockLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.post<TokenResponse>("/auth/mock-login");
      localStorage.setItem("token", data.access_token);
      localStorage.setItem(
        "user",
        JSON.stringify({
          user_id: data.user_id,
          organization_id: data.organization_id,
          email: data.email,
          full_name: data.full_name,
        })
      );
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Error en demo login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-brand relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-white/15 blur-2xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20 text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <Brain className="h-7 w-7" />
            </div>
            <span className="text-3xl font-bold tracking-tight">Sabia AI</span>
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight mb-6">
            Inteligencia para tus compras y proveedores
          </h1>
          <p className="text-lg text-white/80 leading-relaxed max-w-lg">
            Sube facturas en PDF, imagen o XML y deja que la IA extraiga, categorice y analice toda tu información de compras automáticamente.
          </p>
          <div className="mt-10 space-y-4">
            {[
              "Extracción automática con IA",
              "Control de costos y márgenes",
              "Alertas inteligentes de precios",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3 text-white/90">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <span className="text-sm font-medium">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-[420px] animate-fade-in">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-brand">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <span className="text-2xl font-bold gradient-text">Sabia AI</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Iniciar sesión</h2>
            <p className="mt-2 text-muted-foreground">
              Ingresa a tu cuenta para gestionar tus facturas
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">
                Correo electrónico
              </label>
              <Input
                id="email"
                type="email"
                placeholder="tu@restaurante.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="password">
                Contraseña
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full h-11 gradient-brand border-0 text-white font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-200" disabled={loading}>
              {loading ? (
                "Iniciando sesión..."
              ) : (
                <span className="flex items-center gap-2">
                  Iniciar sesión
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>

          {isDev && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-3 text-muted-foreground">O</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full h-11"
                onClick={handleMockLogin}
                disabled={loading}
              >
                Demo rápido (solo desarrollo)
              </Button>
            </>
          )}

          <p className="mt-8 text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline">
              Regístrate gratis
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
