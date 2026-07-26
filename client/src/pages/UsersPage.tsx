import { useState, useEffect } from "react";
import { UserPlus, Shield, User as UserIcon, Loader2, Trash2, Key } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { listUsersApi, createUserApi, updateUserApi, deleteUserApi } from "@/services/users";
import { useAuth } from "@/stores/auth";
import type { User, UserRole } from "@/types/user";

export const UsersPage = () => {
  const currentUser = useAuth((s) => s.user);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Create User Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [submitting, setSubmitting] = useState(false);

  // Edit Password / Role Modal State
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("user");

  // Delete User State
  const [toDelete, setToDelete] = useState<User | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await listUsersApi();
      setUsers(data);
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createUserApi({ name, email, password, role });
      toast.success("Usuário criado com sucesso!");
      setIsCreateOpen(false);
      setName("");
      setEmail("");
      setPassword("");
      setRole("user");
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar usuário.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setSubmitting(true);
    try {
      await updateUserApi(editUser.id, {
        password: editPassword || undefined,
        role: editRole,
      });
      toast.success("Usuário atualizado com sucesso!");
      setEditUser(null);
      setEditPassword("");
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar usuário.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteUserApi(toDelete.id);
      toast.success("Usuário excluído.");
      setToDelete(null);
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir usuário.");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 select-none">
      <div className="flex justify-end items-center">
        <Button onClick={() => setIsCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm">
          <UserPlus className="h-4 w-4" /> Novo Usuário
        </Button>
      </div>

      {/* Users Table / List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
          <div className="divide-y divide-border">
            {users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between p-4 gap-3 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold ${
                      u.role === "admin"
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    }`}
                  >
                    {u.role === "admin" ? <Shield className="h-5 w-5" /> : <UserIcon className="h-5 w-5" />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground truncate">{u.name}</p>
                      <Badge variant={u.role === "admin" ? "secondary" : "outline"} className="capitalize text-[10px]">
                        {u.role === "admin" ? "Administrador" : "Operador"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditUser(u);
                      setEditRole(u.role);
                      setEditPassword("");
                    }}
                    className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Key className="h-3.5 w-3.5" /> Permissões / Senha
                  </Button>

                  {currentUser?.id !== u.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setToDelete(u)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title="Excluir usuário"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Novo Usuário */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Cadastrar Novo Usuário</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Nome Completo</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: João da Silva" required />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">E-mail de Acesso</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@atendicalls.com" required />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Senha Inicial</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Função / Permissão</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="user">Operador (Apenas Chamadas e Atendimento)</option>
                  <option value="admin">Administrador (Acesso Total ao Sistema)</option>
                </select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Cadastrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar Permissão / Senha */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleUpdate}>
            <DialogHeader>
              <DialogTitle>Editar {editUser?.name}</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Função / Permissão</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="user">Operador (Apenas Chamadas e Atendimento)</option>
                  <option value="admin">Administrador (Acesso Total ao Sistema)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Nova Senha (Deixe em branco para não alterar)</label>
                <Input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="••••••••" />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditUser(null)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar Alterações
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir Usuário?"
        description={toDelete ? `O usuário "${toDelete.name}" (${toDelete.email}) será removido do sistema.` : undefined}
        confirmLabel="Excluir"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
};
