"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, TokenResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Package, Eye, EyeOff } from "lucide-react";

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
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Savia</CardTitle>
          <CardDescription>Inicia sesión para gestionar tus facturas</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
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
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Iniciando sesión..." : "Iniciar sesión"}
            </Button>
          </form>

          {isDev && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">O</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleMockLogin}
                disabled={loading}
              >
                Demo rápido (solo desarrollo)
              </Button>
            </>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Regístrate
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
