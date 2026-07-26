import { useState, useEffect } from "react";
import { 
  Users, UserPlus, Search, PhoneCall, Building2, Pencil, Trash2, RefreshCw, LayoutGrid, List, CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getContactsApi, createContactApi, updateContactApi, deleteContactApi } from "@/services/contacts";
import { useDialerStore } from "@/stores/dialer";
import { useSessions } from "@/stores/sessions";
import { formatPhoneBR } from "@/utils/format";
import type { Contact } from "@/types/contact";

export const ContactsPage = () => {
  const openDialer = useDialerStore((s) => s.openDialer);
  const activeSessionId = useSessions((s) => s.activeId);

  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await getContactsApi({ search });
      setContacts(res.contacts);
      setTotal(res.total);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar contatos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [search]);

  const handleOpenAddModal = () => {
    setEditingContact(null);
    setFormName("");
    setFormPhone("");
    setFormCompany("");
    setFormNotes("");
    setModalOpen(true);
  };

  const handleOpenEditModal = (c: Contact) => {
    setEditingContact(c);
    setFormName(c.name);
    setFormPhone(c.phone);
    setFormCompany(c.company || "");
    setFormNotes(c.notes || "");
    setModalOpen(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) {
      toast.error("Nome e Telefone são obrigatórios.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingContact) {
        await updateContactApi(editingContact.id, {
          name: formName,
          phone: formPhone,
          company: formCompany,
          notes: formNotes,
        });
        toast.success("Contato atualizado com sucesso!");
      } else {
        await createContactApi({
          name: formName,
          phone: formPhone,
          company: formCompany,
          notes: formNotes,
        });
        toast.success("Contato cadastrado com sucesso!");
      }
      setModalOpen(false);
      fetchContacts();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar contato.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteContact = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir o contato "${name}"?`)) return;
    try {
      await deleteContactApi(id);
      toast.success("Contato excluído.");
      fetchContacts();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir contato.");
    }
  };

  const handleCallContact = (phone: string) => {
    const rawPhone = phone.replace(/\D/g, "");
    if (!rawPhone) return;
    openDialer(activeSessionId || undefined, rawPhone);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 select-none">
      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Total de Contatos */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Total de Contatos</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-foreground">{total}</span>
            <span className="text-xs text-muted-foreground">agenda cadastrada</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Base de leads e clientes</p>
        </div>

        {/* Card 2: Empresas / Tags */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Empresas & Contas</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-blue-500">
              {new Set(contacts.map((c) => c.company).filter(Boolean)).size}
            </span>
            <span className="text-xs text-muted-foreground">organizações</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Segmentação por empresa</p>
        </div>

        {/* Card 3: Status da Base */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Status da Agenda</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-emerald-500">100%</span>
            <span className="text-xs text-muted-foreground">pronta para discagem</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Compatível com campanhas</p>
        </div>
      </div>

      {/* Filter Bar & Action Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-card shadow-sm">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por nome, telefone ou empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between sm:justify-end gap-3">
          <div className="flex items-center bg-muted rounded-lg p-1 border border-border">
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "table" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
              title="Modo Tabela"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "grid" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
              title="Modo Cards"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          <Button onClick={handleOpenAddModal} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-xs">
            <UserPlus className="w-4 h-4" /> Novo Contato
          </Button>
        </div>
      </div>

      {/* Contacts List / Table */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground bg-card border border-border rounded-xl shadow-xs">
          <RefreshCw className="w-7 h-7 animate-spin mx-auto mb-2 text-emerald-500" />
          Carregando contatos...
        </div>
      ) : contacts.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground bg-card border border-dashed border-border rounded-xl shadow-xs flex flex-col items-center justify-center gap-2">
          <Users className="w-10 h-10 opacity-30 text-emerald-500" />
          <h3 className="font-bold text-base text-foreground">Nenhum contato encontrado</h3>
          <p className="text-xs max-w-sm">Cadastre seus clientes para discar em 1 clique ou incluir em campanhas ativas.</p>
          <Button onClick={handleOpenAddModal} variant="outline" className="mt-2 gap-2 text-emerald-600 border-emerald-500/30">
            <UserPlus className="w-4 h-4" /> Cadastrar Primeiro Contato
          </Button>
        </div>
      ) : viewMode === "table" ? (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-muted/80 border-b border-border text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <tr>
                <th className="py-3 px-4">Contato</th>
                <th className="py-3 px-4">Telefone / WhatsApp</th>
                <th className="py-3 px-4">Empresa / Cargo</th>
                <th className="py-3 px-4">Observações</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-emerald-500/10 text-emerald-600 font-bold text-xs flex items-center justify-center border border-emerald-500/20 shrink-0">
                        {c.pictureUrl ? (
                          <img src={c.pictureUrl} alt={c.name} className="h-full w-full rounded-full object-cover" />
                        ) : (
                          c.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="font-bold text-foreground text-xs">{c.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground font-semibold">
                    {formatPhoneBR(c.phone)}
                  </td>
                  <td className="py-3 px-4">
                    {c.company ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground bg-muted px-2.5 py-1 rounded-md border border-border">
                        <Building2 className="w-3 h-3 text-blue-500" /> {c.company}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">--</span>
                    )}
                  </td>
                  <td className="py-3 px-4 max-w-xs truncate text-xs text-muted-foreground">
                    {c.notes || "--"}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => handleCallContact(c.phone)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-2.5 text-xs gap-1.5"
                        title="Ligar agora em 1 clique"
                      >
                        <PhoneCall className="w-3.5 h-3.5" /> Ligar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEditModal(c)}
                        className="h-8 px-2 text-muted-foreground hover:text-foreground"
                        title="Editar contato"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteContact(c.id, c.name)}
                        className="h-8 px-2 text-rose-500 hover:bg-rose-500/10 border-rose-500/20"
                        title="Excluir contato"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map((c) => (
            <div key={c.id} className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3 hover:border-emerald-500/30 transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-600 font-bold text-sm flex items-center justify-center border border-emerald-500/20 shrink-0">
                    {c.pictureUrl ? (
                      <img src={c.pictureUrl} alt={c.name} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      c.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-foreground leading-tight">{c.name}</h4>
                    <p className="font-mono text-xs text-muted-foreground mt-0.5">{formatPhoneBR(c.phone)}</p>
                  </div>
                </div>

                <Button
                  size="icon"
                  onClick={() => handleCallContact(c.phone)}
                  className="h-9 w-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs shrink-0"
                  title="Ligar para contato"
                >
                  <PhoneCall className="w-4 h-4" />
                </Button>
              </div>

              {c.company && (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                  <Building2 className="w-3.5 h-3.5 text-blue-500" />
                  <span>{c.company}</span>
                </div>
              )}

              {c.notes && (
                <p className="text-xs text-muted-foreground bg-muted/40 p-2 rounded-lg border border-border/40 line-clamp-2">
                  {c.notes}
                </p>
              )}

              <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-border/50">
                <Button variant="ghost" size="sm" onClick={() => handleOpenEditModal(c)} className="h-7 text-xs gap-1">
                  <Pencil className="w-3 h-3" /> Editar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDeleteContact(c.id, c.name)} className="h-7 text-xs text-rose-500 hover:bg-rose-500/10 gap-1">
                  <Trash2 className="w-3 h-3" /> Excluir
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Contact Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserPlus className="w-5 h-5 text-emerald-500" />
              {editingContact ? "Editar Contato" : "Novo Contato"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveContact} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nome Completo *</label>
              <Input
                type="text"
                placeholder="Ex: João da Silva"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Telefone / WhatsApp *</label>
              <Input
                type="text"
                placeholder="Ex: 5544998857524"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                required
              />
              <p className="text-[11px] text-muted-foreground">Informe o número completo com DDD (ex: 5527998857524)</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Empresa / Cargo (Opcional)</label>
              <Input
                type="text"
                placeholder="Ex: E&L Vendas Linhares"
                value={formCompany}
                onChange={(e) => setFormCompany(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Observações / Anotações (Opcional)</label>
              <textarea
                rows={3}
                placeholder="Ex: Cliente interessado no plano empresarial VoIP."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="w-full p-2 text-xs rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {submitting ? "Salving..." : editingContact ? "Salvar Alterações" : "Cadastrar Contato"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
