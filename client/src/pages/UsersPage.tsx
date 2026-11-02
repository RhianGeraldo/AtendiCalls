import { useState, useEffect } from "react";
import {
  Users, UserPlus, Shield, User as UserIcon, Loader2, Trash2, Key,
  Sparkles, Check, Ban, CheckCircle2, Sliders, Smartphone,
  PhoneCall, Bot
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { listUsersApi, createUserApi, updateUserApi, updateUserPlanApi, updateUserStatusApi, deleteUserApi } from "@/services/users";
import { listPlansApi, createPlanApi, updatePlanApi, deletePlanApi } from "@/services/plans";
import { useAuth } from "@/stores/auth";
import type { User, UserRole, Plan } from "@/types/user";

export const UsersPage = () => {
  const currentUser = useAuth((s) => s.user);

  const [activeTab, setActiveTab] = useState<"users" | "plans">("users");

  // Users State
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  // Create User Modal State
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [userPlanId, setUserPlanId] = useState("");
  const [submittingUser, setSubmittingUser] = useState(false);

  // Edit User Password / Role Modal State
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("user");

  // Manage Plan / Quota Modal State
  const [planUser, setPlanUser] = useState<User | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [customInstances, setCustomInstances] = useState(0);
  const [savingPlanUser, setSavingPlanUser] = useState(false);

  // Delete User State
  const [toDeleteUser, setToDeleteUser] = useState<User | null>(null);

  // Plan Modal State
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planName, setPlanName] = useState("");
  const [planDesc, setPlanDesc] = useState("");
  const [planPrice, setPlanPrice] = useState("0");
  const [planMaxInstances, setPlanMaxInstances] = useState(1);
  const [planMaxCalls, setPlanMaxCalls] = useState(2);
  const [planTrialDays, setPlanTrialDays] = useState(0);
  const [planIsDefault, setPlanIsDefault] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [toDeletePlan, setToDeletePlan] = useState<Plan | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersData, plansData] = await Promise.all([
        listUsersApi(),
        listPlansApi(),
      ]);
      setUsers(usersData);
      setPlans(plansData);
      if (plansData.length > 0 && !userPlanId) {
        const def = plansData.find((p) => p.isDefault) || plansData[0];
        setUserPlanId(def.id);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // User Actions
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingUser(true);
    try {
      await createUserApi({ name, email, password, role, planId: userPlanId });
      toast.success("Usuário criado com sucesso!");
      setIsCreateUserOpen(false);
      setName("");
      setEmail("");
      setPassword("");
      setRole("user");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar usuário.");
    } finally {
      setSubmittingUser(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    try {
      await updateUserApi(editUser.id, {
        password: editPassword || undefined,
        role: editRole,
      });
      toast.success("Usuário atualizado com sucesso!");
      setEditUser(null);
      setEditPassword("");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar usuário.");
    }
  };

  const handleSaveUserPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planUser) return;
    setSavingPlanUser(true);
    try {
      await updateUserPlanApi(planUser.id, selectedPlanId, customInstances);
      toast.success("Plano e cota do cliente atualizados!");
      setPlanUser(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar plano.");
    } finally {
      setSavingPlanUser(false);
    }
  };

  const handleToggleUserStatus = async (targetUser: User) => {
    const newStatus = targetUser.status === "suspended" ? "active" : "suspended";
    try {
      await updateUserStatusApi(targetUser.id, newStatus);
      toast.success(newStatus === "active" ? "Conta reativada com sucesso!" : "Conta suspensa com sucesso!");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar status.");
    }
  };

  const handleDeleteUser = async () => {
    if (!toDeleteUser) return;
    try {
      await deleteUserApi(toDeleteUser.id);
      toast.success("Usuário removido com sucesso!");
      setToDeleteUser(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir usuário.");
    }
  };

  // Plan Actions
  const handleOpenPlanModal = (p?: Plan) => {
    if (p) {
      setEditingPlan(p);
      setPlanName(p.name);
      setPlanDesc(p.description || "");
      setPlanPrice((p.priceCents / 100).toFixed(2));
      setPlanMaxInstances(p.maxInstances);
      setPlanMaxCalls(p.maxConcurrentCalls);
      setPlanTrialDays(p.trialDays);
      setPlanIsDefault(p.isDefault);
    } else {
      setEditingPlan(null);
      setPlanName("");
      setPlanDesc("");
      setPlanPrice("0.00");
      setPlanMaxInstances(1);
      setPlanMaxCalls(2);
      setPlanTrialDays(0);
      setPlanIsDefault(false);
    }
    setIsPlanModalOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPlan(true);
    try {
      const priceCents = Math.round(parseFloat(planPrice || "0") * 100);
      const payload: Partial<Plan> = {
        name: planName,
        description: planDesc,
        priceCents,
        maxInstances: Number(planMaxInstances),
        maxConcurrentCalls: Number(planMaxCalls),
        trialDays: Number(planTrialDays),
        isDefault: planIsDefault,
        hasVoiceAi: true,
        hasApiAccess: true,
        hasCampaigns: true,
        isActive: true,
      };

      if (editingPlan) {
        await updatePlanApi(editingPlan.id, payload);
        toast.success("Plano atualizado com sucesso!");
      } else {
        await createPlanApi(payload);
        toast.success("Novo plano criado com sucesso!");
      }
      setIsPlanModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar plano.");
    } finally {
      setSavingPlan(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!toDeletePlan) return;
    try {
      await deletePlanApi(toDeletePlan.id);
      toast.success("Plano desativado!");
      setToDeletePlan(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir plano.");
    }
  };

  const formatBRL = (cents: number) => {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  return (
    <div className="space-y-6">
      {/* Navigation Tabs & Actions Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
        {/* Tabs switch */}
        <div className="flex items-center rounded-xl bg-muted p-1 border">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "users"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="h-3.5 w-3.5" /> Clientes ({users.length})
          </button>
          <button
            onClick={() => setActiveTab("plans")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "plans"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> Planos ({plans.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "users" ? (
            <Button
              onClick={() => setIsCreateUserOpen(true)}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs shadow-xs"
            >
              <UserPlus className="h-4 w-4" /> Novo Cliente
            </Button>
          ) : (
            <Button
              onClick={() => handleOpenPlanModal()}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs shadow-xs"
            >
              <Sparkles className="h-4 w-4" /> Novo Plano
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : activeTab === "users" ? (
        /* USERS & CLIENTS TABLE */
        <div className="rounded-2xl border bg-card shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">Cliente / Usuário</th>
                  <th className="py-3.5 px-4 font-semibold">Tipo</th>
                  <th className="py-3.5 px-4 font-semibold">Plano Atribuído</th>
                  <th className="py-3.5 px-4 font-semibold text-center">Instâncias WhatsApp</th>
                  <th className="py-3.5 px-4 font-semibold">Status</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-foreground">
                {users.map((u) => {
                  const isCurrent = currentUser?.id === u.id;
                  const isSuspended = u.status === "suspended";
                  const maxInst = u.maxInstances || 1;
                  const curInst = u.currentInstances || 0;
                  const isAtLimit = curInst >= maxInst;

                  return (
                    <tr key={u.id} className={`hover:bg-muted/30 transition-colors ${isSuspended ? "opacity-60 bg-muted/20" : ""}`}>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${
                            u.role === "admin" ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                          }`}>
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold flex items-center gap-1.5">
                              {u.name}
                              {isCurrent && <Badge variant="outline" className="text-[10px] px-1 py-0 border-emerald-500 text-emerald-600">Você</Badge>}
                            </div>
                            <div className="text-[11px] text-muted-foreground">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {u.role === "admin" ? (
                          <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-[10px] gap-1">
                            <Shield className="h-3 w-3" /> Admin
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                            <UserIcon className="h-3 w-3" /> Cliente
                          </Badge>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{u.planName || "Gratuito / Teste"}</span>
                          {u.customMaxInstances ? (
                            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                              Cota customizada: {u.customMaxInstances} instâncias
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Plano Padrão</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-muted/30 text-[11px] font-mono">
                          <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className={isAtLimit ? "text-amber-600 font-bold" : "text-foreground font-semibold"}>
                            {curInst} / {maxInst}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {isSuspended ? (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <Ban className="h-3 w-3" /> Suspenso
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30 bg-emerald-500/10 gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Ativo
                          </Badge>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Manage Plan & Quotas */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-emerald-600"
                            title="Alterar Plano & Cotas"
                            onClick={() => {
                              setPlanUser(u);
                              setSelectedPlanId(u.planId || "plan_free");
                              setCustomInstances(u.customMaxInstances || 0);
                            }}
                          >
                            <Sliders className="h-3.5 w-3.5" />
                          </Button>

                          {/* Toggle Active / Suspended */}
                          {!isCurrent && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-7 w-7 ${isSuspended ? "text-emerald-600 hover:text-emerald-700" : "text-muted-foreground hover:text-amber-600"}`}
                              title={isSuspended ? "Reativar Conta" : "Suspender Conta"}
                              onClick={() => handleToggleUserStatus(u)}
                            >
                              {isSuspended ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                            </Button>
                          )}

                          {/* Reset Password */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Redefinir Senha"
                            onClick={() => {
                              setEditUser(u);
                              setEditRole(u.role);
                              setEditPassword("");
                            }}
                          >
                            <Key className="h-3.5 w-3.5" />
                          </Button>

                          {/* Delete User */}
                          {!isCurrent && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              title="Excluir Usuário"
                              onClick={() => setToDeleteUser(u)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* PLANS & QUOTAS CARDS */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`rounded-2xl border p-5 flex flex-col justify-between transition-all bg-card ${
                p.isDefault ? "border-emerald-500/40 shadow-sm ring-1 ring-emerald-500/20" : ""
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-base text-foreground flex items-center gap-1.5">
                      {p.name}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {p.description || "Sem descrição."}
                    </p>
                  </div>
                  {p.isDefault && (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] shrink-0">
                      Padrão
                    </Badge>
                  )}
                </div>

                <div className="text-2xl font-extrabold text-foreground tracking-tight pt-1">
                  {p.priceCents === 0 ? "Gratuito" : formatBRL(p.priceCents)}
                  {p.priceCents > 0 && <span className="text-xs font-normal text-muted-foreground"> /mês</span>}
                </div>

                <div className="space-y-2 pt-2 border-t border-border/40 text-xs">
                  <div className="flex items-center gap-2 text-foreground font-medium">
                    <Smartphone className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span><strong>{p.maxInstances}</strong> {p.maxInstances === 1 ? "Linha WhatsApp" : "Linhas WhatsApp"}</span>
                  </div>

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <PhoneCall className="h-4 w-4 text-blue-500 shrink-0" />
                    <span><strong>{p.maxConcurrentCalls}</strong> chamadas simultâneas</span>
                  </div>

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Bot className="h-4 w-4 text-purple-500 shrink-0" />
                    <span>Agente de Voz com IA incluso</span>
                  </div>

                  {p.trialDays > 0 ? (
                    <div className="flex items-center gap-2 text-amber-600 font-medium">
                      <Sparkles className="h-4 w-4 shrink-0" />
                      <span>{p.trialDays} dias de teste grátis</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-emerald-600">
                      <Check className="h-4 w-4 shrink-0" />
                      <span>Sem expiração de tempo</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-5 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenPlanModal(p)}
                  className="flex-1 rounded-xl text-xs"
                >
                  Editar Plano
                </Button>
                {!p.isDefault && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-xl"
                    onClick={() => setToDeletePlan(p)}
                    title="Excluir Plano"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: CREATE USER */}
      <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-emerald-600" /> Criar Novo Usuário
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Nome Completo</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Carlos Oliveira"
                required
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">E-mail</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="carlos@empresa.com"
                required
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Senha Inicial</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                className="rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Tipo de Conta</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full h-10 px-3 rounded-xl border bg-background text-xs"
                >
                  <option value="user">Cliente / Usuário</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Plano</label>
                <select
                  value={userPlanId}
                  onChange={(e) => setUserPlanId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border bg-background text-xs"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.maxInstances} linhas)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setIsCreateUserOpen(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button type="submit" disabled={submittingUser} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">
                {submittingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Usuário"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: MANAGE PLAN & QUOTA FOR CLIENT */}
      <Dialog open={!!planUser} onOpenChange={(open) => !open && setPlanUser(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Sliders className="h-5 w-5 text-emerald-600" /> Alterar Plano & Cotas do Cliente
            </DialogTitle>
          </DialogHeader>
          {planUser && (
            <form onSubmit={handleSaveUserPlan} className="space-y-4 pt-2">
              <div className="p-3 bg-muted/40 rounded-xl text-xs space-y-1 border">
                <div className="font-semibold text-foreground">{planUser.name}</div>
                <div className="text-muted-foreground">{planUser.email}</div>
                <div className="text-muted-foreground">
                  Instâncias ativas agora: <strong>{planUser.currentInstances || 0}</strong>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Plano de Assinatura</label>
                <select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border bg-background text-xs font-medium"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.maxInstances} {p.maxInstances === 1 ? "linha" : "linhas"} ({formatBRL(p.priceCents)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                  <span>Cota Customizada de Instâncias (Override)</span>
                  <span className="text-[10px] text-muted-foreground font-normal">0 = Usar limite do plano</span>
                </label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={customInstances}
                  onChange={(e) => setCustomInstances(parseInt(e.target.value) || 0)}
                  placeholder="0 para seguir o plano padrão"
                  className="rounded-xl font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Se preenchido com valor maior que 0, este número sobrepõe o limite do plano para este cliente específico.
                </p>
              </div>

              <DialogFooter className="pt-3">
                <Button type="button" variant="outline" onClick={() => setPlanUser(null)} className="rounded-xl">
                  Cancelar
                </Button>
                <Button type="submit" disabled={savingPlanUser} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">
                  {savingPlanUser ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Alterações"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: RESET PASSWORD / ROLE */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Key className="h-5 w-5 text-emerald-600" /> Alterar Senha / Função
            </DialogTitle>
          </DialogHeader>
          {editUser && (
            <form onSubmit={handleUpdateUser} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Nova Senha (opcional)</label>
                <Input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Deixe em branco para manter a atual"
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Função do Usuário</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full h-10 px-3 rounded-xl border bg-background text-xs"
                >
                  <option value="user">Cliente / Usuário</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <DialogFooter className="pt-3">
                <Button type="button" variant="outline" onClick={() => setEditUser(null)} className="rounded-xl">
                  Cancelar
                </Button>
                <Button type="submit" className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: CREATE / EDIT PLAN */}
      <Dialog open={isPlanModalOpen} onOpenChange={setIsPlanModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" />
              {editingPlan ? "Editar Plano" : "Criar Novo Plano"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSavePlan} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Nome do Plano</label>
              <Input
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="Ex: Básico, Pro, Empresa"
                required
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Descrição Curta</label>
              <Input
                value={planDesc}
                onChange={(e) => setPlanDesc(e.target.value)}
                placeholder="Ex: 2 linhas WhatsApp com Agente de Voz IA"
                className="rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Preço Mensal (R$)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={planPrice}
                  onChange={(e) => setPlanPrice(e.target.value)}
                  placeholder="0.00"
                  required
                  className="rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Qtd. de Linhas WhatsApp</label>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={planMaxInstances}
                  onChange={(e) => setPlanMaxInstances(parseInt(e.target.value) || 1)}
                  required
                  className="rounded-xl font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Chamadas Simultâneas</label>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={planMaxCalls}
                  onChange={(e) => setPlanMaxCalls(parseInt(e.target.value) || 2)}
                  required
                  className="rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Dias de Trial (0 = sem expirar)</label>
                <Input
                  type="number"
                  min="0"
                  max="365"
                  value={planTrialDays}
                  onChange={(e) => setPlanTrialDays(parseInt(e.target.value) || 0)}
                  className="rounded-xl font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="isDefaultPlan"
                checked={planIsDefault}
                onChange={(e) => setPlanIsDefault(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <label htmlFor="isDefaultPlan" className="text-xs font-medium text-foreground cursor-pointer">
                Definir como Plano Padrão de Novos Cadastros (Auto-registro)
              </label>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setIsPlanModalOpen(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button type="submit" disabled={savingPlan} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">
                {savingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Plano"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CONFIRM DELETE USER */}
      <ConfirmDialog
        open={!!toDeleteUser}
        onOpenChange={(o) => !o && setToDeleteUser(null)}
        title="Excluir Usuário"
        description={`Tem certeza que deseja remover o usuário ${toDeleteUser?.name}? As instâncias vinculadas também serão removidas.`}
        confirmLabel="Sim, Excluir"
        destructive
        onConfirm={handleDeleteUser}
      />

      {/* CONFIRM DELETE PLAN */}
      <ConfirmDialog
        open={!!toDeletePlan}
        onOpenChange={(o) => !o && setToDeletePlan(null)}
        title="Excluir Plano"
        description={`Tem certeza que deseja desativar o plano ${toDeletePlan?.name}?`}
        confirmLabel="Sim, Desativar"
        destructive
        onConfirm={handleDeletePlan}
      />
    </div>
  );
};
