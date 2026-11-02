import { useState } from "react";
import { PhoneCall, Loader2, Lock, Mail, User, ShieldAlert, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/stores/auth";

interface RegisterPageProps {
  onSuccess?: () => void;
}

export const RegisterPage = ({ onSuccess }: RegisterPageProps) => {
  const register = useAuth((s) => s.register);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (password.length < 6) {
      setErrorMsg("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      await register(name, email, password);
      toast.success("Conta criada com sucesso! Bem-vindo ao AtendiCalls.");
      if (onSuccess) {
        onSuccess();
      } else {
        window.history.pushState({}, "", "/");
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao realizar cadastro.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoToLogin = () => {
    window.history.pushState({}, "", "/login");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted/40 p-4 select-none">
      <div className="w-full max-w-md space-y-6 rounded-3xl border bg-background p-8 shadow-2xl">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm">
            <PhoneCall className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Criar Nova Conta</h1>
          <p className="text-xs text-muted-foreground">Sistema de Telefonia VoIP & Softphone WhatsApp</p>
        </div>

        {/* Free Plan Callout */}
        <div className="flex items-center gap-2.5 rounded-2xl bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 font-medium">
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>Cadastre-se e ganhe acesso imediato com <strong>1 linha WhatsApp gratuita</strong> para testar.</span>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-xs font-medium text-destructive border border-destructive/20">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Nome Completo / Empresa
            </label>
            <Input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: João Silva ou Minha Empresa"
              required
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> E-mail
            </label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu.email@empresa.com"
              required
              className="rounded-xl"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> Senha
              </label>
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> Confirmar Senha
              </label>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita sua senha"
                required
                className="rounded-xl"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-5 gap-2 shadow-md cursor-pointer transition-all"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Minha Conta Gratuita"}
          </Button>
        </form>

        {/* Footer Link to Login */}
        <div className="border-t border-muted/50 pt-4 text-center text-xs text-muted-foreground">
          <span>Já possui uma conta? </span>
          <button
            type="button"
            onClick={handleGoToLogin}
            className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer inline-flex items-center gap-1"
          >
            Fazer login <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
