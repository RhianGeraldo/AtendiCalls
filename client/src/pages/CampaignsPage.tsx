import { useState, useEffect } from "react";
import { 
  Megaphone, Plus, Play, Trash2, RefreshCw, Smartphone, Users, Clock, ChevronRight, FileText, BookmarkPlus, Pencil
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getCampaignsApi, createCampaignApi, deleteCampaignApi, getCampaignDetailsApi } from "@/services/campaigns";
import { getContactsApi } from "@/services/contacts";
import { getPlaybooksApi, createPlaybookApi, updatePlaybookApi, deletePlaybookApi } from "@/services/playbooks";
import { useSessions } from "@/stores/sessions";
import { useCampaignRunner } from "@/stores/campaignRunner";
import type { Campaign } from "@/types/campaign";
import type { Contact } from "@/types/contact";
import type { Playbook } from "@/types/playbook";
import { parsePlaybookContent, serializePlaybookContent, PlaybookStage } from "@/types/playbook";

export const CampaignsPage = () => {
  const sessions = useSessions((s) => s.sessions);
  const startRunner = useCampaignRunner((s) => s.startRunner);

  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);

  // Wizard Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [formName, setFormName] = useState("");
  const [formSessionId, setFormSessionId] = useState("");
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>("");
  const [formPlaybook, setFormPlaybook] = useState(
    "👋 PITCH DE VENDAS:\n- Olá, meu nome é [Agente] da equipe AtendiCalls!\n- Gostaria de apresentar nossa nova solução VoIP para WhatsApp.\n\n❓ QUALIFICAÇÃO DE LEAD:\n1. Quantas chamadas vocês realizam por dia?\n2. Já utilizam automação ou discador sequencial?\n\n💡 TRATAMENTO DE OBJEÇÕES:\n- Objeção 'Sem tempo': 'Prometo ser breve, apenas 2 minutos!'\n- Objeção 'Preço': 'Temos planos escaláveis para qualquer equipe.'"
  );
  const [formDelaySeconds, setFormDelaySeconds] = useState(5);
  const [availableContacts, setAvailableContacts] = useState<Contact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Playbooks Manager State
  const [playbookLibraryOpen, setPlaybookLibraryOpen] = useState(false);
  const [playbookEditorOpen, setPlaybookEditorOpen] = useState(false);
  const [activeEditorStageIdx, setActiveEditorStageIdx] = useState(0);

  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null);
  const [pbTitle, setPbTitle] = useState("");
  const [pbMode, setPbMode] = useState<"text" | "stages">("stages");
  const [pbContent, setPbContent] = useState("");
  const [pbStages, setPbStages] = useState<PlaybookStage[]>([]);
  const [pbCategory, setPbCategory] = useState("");
  const [pbSubmitting, setPbSubmitting] = useState(false);

  const activeSessions = sessions.filter((s) => s.paired);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const data = await getCampaignsApi();
      setCampaigns(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar campanhas.");
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchContactsForSelection = async () => {
    try {
      const res = await getContactsApi({ limit: 200 });
      setAvailableContacts(res.contacts);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPlaybooks = async () => {
    try {
      const data = await getPlaybooksApi();
      setPlaybooks(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setPlaybooks([]);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    fetchContactsForSelection();
    fetchPlaybooks();
  }, []);

  const handleSelectSavedPlaybook = (pbId: string) => {
    setSelectedPlaybookId(pbId);
    if (!pbId) return;
    const found = playbooks.find((p) => p.id === pbId);
    if (found) {
      setFormPlaybook(found.content);
      toast.success(`Playbook "${found.title}" carregado!`);
    }
  };

  const handleSaveCurrentPlaybook = async () => {
    const title = prompt("Digite um nome/título para este Roteiro/Playbook:");
    if (!title?.trim()) return;

    try {
      await createPlaybookApi({ title, content: formPlaybook });
      toast.success("Roteiro salvo na biblioteca de Playbooks!");
      fetchPlaybooks();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar playbook.");
    }
  };

  const handleOpenPlaybookLibrary = () => {
    fetchPlaybooks();
    setPlaybookLibraryOpen(true);
  };

  const handleOpenCreatePlaybook = () => {
    setEditingPlaybook(null);
    setPbTitle("");
    setPbMode("stages");
    setPbContent("");
    setPbStages([
      { id: "stg_1", title: "1. Abertura (15 a 20s)", script: "Olá, [Nome]. Tudo bem?", objections: [] },
      { id: "stg_2", title: "2. Descoberta (30s)", script: "Você já conhece nossa solução?", objections: [] },
      { id: "stg_3", title: "3. Fechamento (40s)", script: "Qual período fica melhor para agendarmos?", objections: [] },
    ]);
    setPbCategory("");
    setActiveEditorStageIdx(0);
    setPlaybookEditorOpen(true);
  };

  const handleEditPlaybookInEditor = (pb: Playbook) => {
    setEditingPlaybook(pb);
    setPbTitle(pb.title);
    setPbCategory(pb.category || "");

    const parsed = parsePlaybookContent(pb.content);
    setPbMode(parsed.mode);
    if (parsed.mode === "stages" && parsed.stages.length > 0) {
      setPbStages(parsed.stages);
      setPbContent("");
    } else {
      setPbContent(parsed.text);
      setPbStages([]);
    }
    setActiveEditorStageIdx(0);
    setPlaybookEditorOpen(true);
  };

  const handleAddStage = () => {
    const nextNum = pbStages.length + 1;
    const newStage: PlaybookStage = {
      id: `stg_${Date.now()}`,
      title: `${nextNum}. Nova Etapa`,
      script: "",
      objections: [],
    };
    setPbStages((prev) => [...prev, newStage]);
    setActiveEditorStageIdx(pbStages.length);
  };

  const handleRemoveStage = (idx: number) => {
    setPbStages((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (activeEditorStageIdx >= next.length) {
        setActiveEditorStageIdx(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  const handleUpdateStage = (idx: number, field: keyof PlaybookStage, value: any) => {
    setPbStages((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const handleAddObjection = (stageIdx: number) => {
    setPbStages((prev) => {
      const copy = [...prev];
      const stg = copy[stageIdx];
      const objs = stg.objections || [];
      copy[stageIdx] = {
        ...stg,
        objections: [...objs, { trigger: "", response: "" }],
      };
      return copy;
    });
  };

  const handleRemoveObjection = (stageIdx: number, objIdx: number) => {
    setPbStages((prev) => {
      const copy = [...prev];
      const stg = copy[stageIdx];
      const objs = (stg.objections || []).filter((_: any, i: number) => i !== objIdx);
      copy[stageIdx] = { ...stg, objections: objs };
      return copy;
    });
  };

  const handleUpdateObjection = (stageIdx: number, objIdx: number, field: "trigger" | "response", val: string) => {
    setPbStages((prev) => {
      const copy = [...prev];
      const stg = copy[stageIdx];
      const objs = [...(stg.objections || [])];
      objs[objIdx] = { ...objs[objIdx], [field]: val };
      copy[stageIdx] = { ...stg, objections: objs };
      return copy;
    });
  };

  const handleSavePlaybookInManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pbTitle.trim()) {
      toast.error("Título do Playbook é obrigatório.");
      return;
    }

    if (pbMode === "stages" && pbStages.length === 0) {
      toast.error("Adicione pelo menos 1 Etapa no seu Playbook.");
      return;
    }

    if (pbMode === "text" && !pbContent.trim()) {
      toast.error("Digite o texto do roteiro.");
      return;
    }

    const finalContent = serializePlaybookContent(pbMode, pbContent, pbStages);

    setPbSubmitting(true);
    try {
      if (editingPlaybook) {
        await updatePlaybookApi(editingPlaybook.id, { title: pbTitle, content: finalContent, category: pbCategory });
        toast.success("Playbook atualizado com sucesso!");
      } else {
        await createPlaybookApi({ title: pbTitle, content: finalContent, category: pbCategory });
        toast.success("Playbook criado com sucesso!");
      }
      setPlaybookEditorOpen(false);
      fetchPlaybooks();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar playbook.");
    } finally {
      setPbSubmitting(false);
    }
  };

  const handleDeletePlaybook = async (id: string, title: string) => {
    if (!confirm(`Excluir o playbook "${title}"?`)) return;
    try {
      await deletePlaybookApi(id);
      toast.success("Playbook excluído.");
      fetchPlaybooks();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir playbook.");
    }
  };

  const handleOpenCreateModal = () => {
    fetchPlaybooks();
    fetchContactsForSelection();
    setFormName("");
    setFormSessionId(activeSessions[0]?.id || "");
    setSelectedContactIds(availableContacts.map((c) => c.id)); // Select all by default
    setFormDelaySeconds(5);
    setStep(1);
    setModalOpen(true);
  };

  const handleToggleSelectContact = (id: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllContacts = () => {
    if (selectedContactIds.length === availableContacts.length) {
      setSelectedContactIds([]);
    } else {
      setSelectedContactIds(availableContacts.map((c) => c.id));
    }
  };

  const handleCreateCampaign = async () => {
    if (!formName.trim() || !formSessionId || selectedContactIds.length === 0) {
      toast.error("Preencha todos os campos e selecione ao menos 1 contato.");
      return;
    }

    setSubmitting(true);
    try {
      const selectedContacts = availableContacts.filter((c) => selectedContactIds.includes(c.id));
      const itemsPayload = selectedContacts.map((c) => ({
        contactId: c.id,
        name: c.name,
        phone: c.phone,
        pictureUrl: c.pictureUrl,
      }));

      await createCampaignApi({
        name: formName,
        sessionId: formSessionId,
        playbook: formPlaybook,
        delaySeconds: formDelaySeconds,
        items: itemsPayload,
      });

      toast.success("Campanha criada com sucesso!");
      setModalOpen(false);
      fetchCampaigns();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar campanha.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartCampaign = async (cmpId: string) => {
    try {
      const fullCmp = await getCampaignDetailsApi(cmpId);
      startRunner(fullCmp);
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar campanha.");
    }
  };

  const handleDeleteCampaign = async (id: string, name: string) => {
    if (!confirm(`Excluir a campanha "${name}"?`)) return;
    try {
      await deleteCampaignApi(id);
      toast.success("Campanha excluída.");
      fetchCampaigns();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir campanha.");
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 select-none">
      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Total de Campanhas */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Total de Campanhas</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <Megaphone className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-foreground">{campaigns.length}</span>
            <span className="text-xs text-muted-foreground">criadas</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Disparos de ligações ativos</p>
        </div>

        {/* Card 2: Campanhas em Execução */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Rodando Agora</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Play className="h-4 w-4 animate-pulse" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-amber-500">
              {campaigns.filter((c) => c.status === "running").length}
            </span>
            <span className="text-xs text-muted-foreground">em tempo real</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Discagem automotiva 1 a 1</p>
        </div>

        {/* Card 3: Total Contatos Impactados */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Alcance Total</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-extrabold tracking-tight text-blue-500">
              {campaigns.reduce((sum, c) => sum + (c.totalItems || 0), 0)}
            </span>
            <span className="text-xs text-muted-foreground">contatos na fila</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Total de leads mapeados</p>
        </div>
      </div>

      {/* Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-card shadow-sm">
        <div>
          <h3 className="font-bold text-base text-foreground">Campanhas de Ligação Sequenciais</h3>
          <p className="text-xs text-muted-foreground">Disparo automático 1 a 1 com delay de 5s e Playbook Comercial.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleOpenPlaybookLibrary} variant="outline" className="gap-2 text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
            <FileText className="w-4 h-4" /> Biblioteca de Playbooks ({playbooks.length})
          </Button>
          <Button onClick={handleOpenCreateModal} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-xs text-xs">
            <Plus className="w-4 h-4" /> Nova Campanha
          </Button>
        </div>
      </div>

      {/* Campaigns List */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground bg-card border border-border rounded-xl shadow-xs space-y-3 flex flex-col items-center justify-center">
          <RefreshCw className="w-7 h-7 animate-spin text-emerald-500" />
          <p className="text-xs">Carregando campanhas...</p>
          <Button variant="outline" size="sm" onClick={fetchCampaigns} className="text-xs gap-1.5 border-emerald-500/30 text-emerald-600">
            <RefreshCw className="w-3.5 h-3.5" /> Recarregar Lista
          </Button>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground bg-card border border-dashed border-border rounded-xl shadow-xs flex flex-col items-center justify-center gap-2">
          <Megaphone className="w-10 h-10 opacity-30 text-emerald-500" />
          <h3 className="font-bold text-base text-foreground">Nenhuma campanha criada ainda</h3>
          <p className="text-xs max-w-sm">Crie sua primeira campanha para discar sequencialmente para seus leads com Playbook ao vivo.</p>
          <Button onClick={handleOpenCreateModal} variant="outline" className="mt-2 gap-2 text-emerald-600 border-emerald-500/30">
            <Plus className="w-4 h-4" /> Criar Primeira Campanha
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {campaigns.map((cmp) => {
            const sess = sessions.find((s) => s.id === cmp.sessionId);
            const progress = cmp.totalItems > 0 ? Math.round((cmp.doneItems / cmp.totalItems) * 100) : 0;

            return (
              <div key={cmp.id} className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4 hover:border-emerald-500/30 transition-all flex flex-col justify-between">
                <div className="space-y-3">
                  {/* Campaign Header & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <h4 className="font-extrabold text-base text-foreground leading-tight">{cmp.name}</h4>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Smartphone className="w-3.5 h-3.5 text-blue-500" />
                        <span>{sess?.name || cmp.sessionName || "Linha WhatsApp"}</span>
                      </div>
                    </div>

                    <Badge
                      variant={
                        cmp.status === "running"
                          ? "success"
                          : cmp.status === "completed"
                          ? "outline"
                          : cmp.status === "paused"
                          ? "secondary"
                          : "secondary"
                      }
                      className="text-[10px] capitalize shrink-0"
                    >
                      {cmp.status === "running"
                        ? "Rodando"
                        : cmp.status === "completed"
                        ? "Concluída"
                        : cmp.status === "paused"
                        ? "Pausada"
                        : "Pendente"}
                    </Badge>
                  </div>

                  {/* Progress Bar & Stats */}
                  <div className="space-y-1.5 pt-2 border-t border-border/50">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Progresso</span>
                      <span className="font-mono font-bold text-foreground">
                        {cmp.doneItems} / {cmp.totalItems} ({progress}%)
                      </span>
                    </div>

                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Delay Tag */}
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span>Delay: {cmp.delaySeconds || 5}s entre chamadas</span>
                  </div>
                </div>

                {/* Bottom Action Controls */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/60 mt-2">
                  <Button
                    onClick={() => handleStartCampaign(cmp.id)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-2 font-bold shadow-xs"
                  >
                    <Play className="w-3.5 h-3.5" /> Abrir Discador / Executar
                  </Button>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleDeleteCampaign(cmp.id, cmp.name)}
                    className="h-9 w-9 text-rose-500 hover:bg-rose-500/10 border-rose-500/20 shrink-0"
                    title="Excluir campanha"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Wizard Modal: Create New Campaign */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Megaphone className="w-5 h-5 text-emerald-500" />
              Nova Campanha de Ligações (Passo {step} de 3)
            </DialogTitle>
          </DialogHeader>

          {/* Wizard Step 1: Configurações Básicas */}
          {step === 1 && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Nome da Campanha *</label>
                <Input
                  type="text"
                  placeholder="Ex: Prospecção Clientes Vendas Julho"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Conta / Linha de WhatsApp *</label>
                <select
                  value={formSessionId}
                  onChange={(e) => setFormSessionId(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {activeSessions.length === 0 ? (
                    <option value="">Nenhuma conta de WhatsApp pareada!</option>
                  ) : (
                    activeSessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.phone || s.id.slice(0, 8)})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Delay entre chamadas não atendidas (Segundos)</label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={formDelaySeconds}
                  onChange={(e) => setFormDelaySeconds(parseInt(e.target.value) || 5)}
                />
                <p className="text-[11px] text-muted-foreground">Tempo de espera antes de discar para o próximo contato da lista (Padrão: 5s).</p>
              </div>
            </div>
          )}

          {/* Wizard Step 2: Seleção de Contatos */}
          {step === 2 && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">
                  Selecionar Contatos ({selectedContactIds.length} selecionados de {availableContacts.length})
                </label>
                <Button variant="ghost" size="sm" onClick={handleSelectAllContacts} className="text-xs text-emerald-600 h-7">
                  {selectedContactIds.length === availableContacts.length ? "Desmarcar Todos" : "Selecionar Todos"}
                </Button>
              </div>

              {availableContacts.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center border border-dashed rounded-lg">
                  Nenhum contato cadastrado. Cadastre contatos na aba Contatos primeiro!
                </p>
              ) : (
                <div className="max-h-60 overflow-y-auto border border-border rounded-xl divide-y divide-border/50 bg-background">
                  {availableContacts.map((c) => {
                    const selected = selectedContactIds.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => handleToggleSelectContact(c.id)}
                        className={`flex items-center justify-between p-2.5 cursor-pointer hover:bg-muted/40 transition-colors ${
                          selected ? "bg-emerald-500/5" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => {}}
                            className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="font-bold text-xs text-foreground">{c.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">({c.phone})</span>
                        </div>
                        {c.company && (
                          <span className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground">
                            {c.company}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Wizard Step 3: Roteiro / Playbook do Vendedor */}
          {step === 3 && (() => {
            const parsedFormPb = parsePlaybookContent(formPlaybook);
            const isStages = parsedFormPb.mode === "stages";

            return (
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">Carregar Playbook Salvo (Opcional)</label>
                    {!isStages && (
                      <Button variant="ghost" size="sm" onClick={handleSaveCurrentPlaybook} className="text-xs text-emerald-600 h-6 gap-1">
                        <BookmarkPlus className="w-3.5 h-3.5" /> Salvar este Roteiro
                      </Button>
                    )}
                  </div>

                  <select
                    value={selectedPlaybookId}
                    onChange={(e) => handleSelectSavedPlaybook(e.target.value)}
                    className="w-full p-2.5 text-xs rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold"
                  >
                    <option value="">-- Roteiro Livre Padrão (Ou selecione da biblioteca) --</option>
                    {playbooks.map((pb) => (
                      <option key={pb.id} value={pb.id}>
                        📖 {pb.title} {pb.category ? `[${pb.category}]` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {isStages ? (
                  /* VISUAL STAGES PREVIEW CARD (NO JSON SHOWN!) */
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-emerald-500" />
                        Visualização do Playbook por Etapas
                      </label>
                      <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold">
                        🎯 {parsedFormPb.stages.length} Etapas Interativas
                      </Badge>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-2 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                      {parsedFormPb.stages.map((stg, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg border border-border bg-card space-y-1 shadow-xs">
                          <div className="flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            <span>{stg.title}</span>
                            {stg.objections && stg.objections.length > 0 && (
                              <span className="text-[10px] text-amber-500 font-mono">
                                ⚡ {stg.objections.length} objeções prontas
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-foreground font-sans line-clamp-2 leading-relaxed">
                            {stg.script}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* PLAIN TEXT AREA */
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Conteúdo do Roteiro / Pitch do Vendedor *</label>
                    <textarea
                      rows={8}
                      value={formPlaybook}
                      onChange={(e) => setFormPlaybook(e.target.value)}
                      placeholder="Digite o texto do roteiro..."
                      className="w-full p-3 text-xs font-sans leading-relaxed rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Wizard Footer Controls */}
          <DialogFooter className="pt-2 flex items-center justify-between">
            {step > 1 ? (
              <Button variant="outline" onClick={() => setStep((s) => (s - 1) as any)}>
                Voltar
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
            )}

            {step < 3 ? (
              <Button onClick={() => setStep((s) => (s + 1) as any)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                Avançar <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button onClick={handleCreateCampaign} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {submitting ? "Criando..." : "Criar & Lançar Campanha"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 1. Modal Biblioteca de Playbooks */}
      <Dialog open={playbookLibraryOpen} onOpenChange={setPlaybookLibraryOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col justify-between overflow-hidden">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-border pb-3 pr-6">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-5 h-5 text-emerald-500" />
              Biblioteca de Playbooks (Roteiros Comerciais)
            </DialogTitle>
            <Button onClick={handleOpenCreatePlaybook} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 shadow-xs">
              <Plus className="w-4 h-4" /> Criar Novo Playbook
            </Button>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-1">
            {playbooks.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground border border-dashed rounded-xl flex flex-col items-center justify-center gap-2">
                <FileText className="w-10 h-10 opacity-30 text-emerald-500" />
                <h4 className="font-bold text-sm text-foreground">Nenhum playbook cadastrado</h4>
                <p className="text-xs text-muted-foreground">Crie roteiros em etapas para orientar a equipe durante os disparos de vendas.</p>
                <Button onClick={handleOpenCreatePlaybook} variant="outline" className="mt-2 text-emerald-600 border-emerald-500/30 gap-1.5 text-xs">
                  <Plus className="w-4 h-4" /> Criar Primeiro Roteiro
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {playbooks.map((pb) => {
                  const parsed = parsePlaybookContent(pb.content);
                  const isStages = parsed.mode === "stages";

                  return (
                    <div key={pb.id} className="p-4 rounded-xl border border-border bg-card space-y-3 hover:border-emerald-500/40 transition-all flex flex-col justify-between shadow-xs">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h5 className="font-extrabold text-sm text-foreground leading-snug">{pb.title}</h5>
                          {pb.category && (
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {pb.category}
                            </Badge>
                          )}
                        </div>

                        {isStages ? (
                          <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold">
                            🎯 {parsed.stages.length} Etapas Interativas (Stories)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            📝 Texto Livre
                          </Badge>
                        )}

                        <p className="text-xs text-muted-foreground line-clamp-3 font-sans bg-muted/40 p-2.5 rounded-lg border border-border/40">
                          {isStages
                            ? `Etapas: ${parsed.stages.map((s) => s.title).join(" ➔ ")}`
                            : pb.content}
                        </p>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditPlaybookInEditor(pb)}
                          className="h-8 text-xs gap-1.5 text-foreground"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Editar Playbook
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeletePlaybook(pb.id, pb.title)}
                          className="h-8 text-xs text-rose-500 hover:bg-rose-500/10 border-rose-500/20"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="pt-3 border-t border-border">
            <Button variant="outline" onClick={() => setPlaybookLibraryOpen(false)}>
              Fechar Biblioteca
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Modal Studio de Criação / Edição de Playbook (2 Colunas Limpas) */}
      <Dialog open={playbookEditorOpen} onOpenChange={setPlaybookEditorOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col justify-between overflow-hidden p-0">
          {/* Header Bar */}
          <div className="p-4 bg-muted/50 border-b border-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-500" />
                <h3 className="font-extrabold text-base text-foreground">
                  {editingPlaybook ? "Editar Playbook Comercial" : "Criar Novo Playbook Comercial"}
                </h3>
              </div>

              {/* Mode Switcher */}
              <div className="flex items-center gap-1 bg-background p-1 rounded-lg border border-border text-xs">
                <button
                  type="button"
                  onClick={() => setPbMode("stages")}
                  className={`px-3 py-1 rounded-md transition-all font-semibold ${
                    pbMode === "stages" ? "bg-emerald-600 text-white shadow-xs" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🎯 Etapas Interativas (Stories)
                </button>
                <button
                  type="button"
                  onClick={() => setPbMode("text")}
                  className={`px-3 py-1 rounded-md transition-all font-semibold ${
                    pbMode === "text" ? "bg-emerald-600 text-white shadow-xs" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  📝 Texto Livre
                </button>
              </div>
            </div>

            {/* Inputs Title & Category */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-bold text-foreground">Título do Playbook *</label>
                <Input
                  type="text"
                  placeholder="Ex: Playbook Completo - Indicação & Cortesia (Estética e Laser)"
                  value={pbTitle}
                  onChange={(e) => setPbTitle(e.target.value)}
                  className="bg-background font-bold text-xs"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground">Categoria (Opcional)</label>
                <Input
                  type="text"
                  placeholder="Ex: Vendas / Indicação"
                  value={pbCategory}
                  onChange={(e) => setPbCategory(e.target.value)}
                  className="bg-background text-xs"
                />
              </div>
            </div>
          </div>

          {/* Body Studio Content */}
          <div className="flex-1 overflow-hidden">
            {pbMode === "stages" ? (
              /* 2-COLUMN STUDIO LAYOUT */
              <div className="grid grid-cols-1 md:grid-cols-12 h-full min-h-[420px]">
                {/* Left Sidebar (4/12): List of Stages Tabs */}
                <div className="md:col-span-4 p-4 border-r border-border/80 bg-muted/20 flex flex-col justify-between space-y-3 overflow-y-auto max-h-[500px]">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                        Etapas ({pbStages.length})
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddStage}
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar Etapa
                      </Button>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      {pbStages.map((stg, sIdx) => {
                        const active = sIdx === activeEditorStageIdx;
                        return (
                          <div
                            key={sIdx}
                            onClick={() => setActiveEditorStageIdx(sIdx)}
                            className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border text-xs font-semibold ${
                              active
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 shadow-xs"
                                : "bg-card border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            }`}
                          >
                            <span className="truncate flex-1 font-bold">{stg.title || `Etapa ${sIdx + 1}`}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {stg.objections && stg.objections.length > 0 && (
                                <span className="text-[10px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded font-mono">
                                  {stg.objections.length} obj
                                </span>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveStage(sIdx);
                                }}
                                className="h-6 w-6 text-rose-500 hover:bg-rose-500/10"
                                title="Remover esta etapa"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right Panel (8/12): Focused Stage Content Editor */}
                <div className="md:col-span-8 p-5 overflow-y-auto max-h-[500px] space-y-4">
                  {pbStages[activeEditorStageIdx] ? (
                    <div className="space-y-4">
                      {/* Active Stage Header & Title */}
                      <div className="space-y-1.5 border-b border-border pb-3">
                        <label className="text-xs font-bold text-foreground flex items-center justify-between">
                          <span>Nome da Etapa {activeEditorStageIdx + 1} & Duração Estimada *</span>
                          <span className="text-[10px] text-muted-foreground font-normal">Ex: 1. Abertura (15 a 20 segundos)</span>
                        </label>
                        <Input
                          type="text"
                          placeholder="Ex: 1. Abertura (15 a 20s)"
                          value={pbStages[activeEditorStageIdx].title}
                          onChange={(e) => handleUpdateStage(activeEditorStageIdx, "title", e.target.value)}
                          className="font-bold text-xs bg-background"
                          required
                        />
                      </div>

                      {/* Active Stage Script Textarea */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground">
                          O que o vendedor deve falar nesta etapa *
                        </label>
                        <textarea
                          rows={6}
                          placeholder="Digite as falas, perguntas e guia do vendedor para esta etapa..."
                          value={pbStages[activeEditorStageIdx].script}
                          onChange={(e) => handleUpdateStage(activeEditorStageIdx, "script", e.target.value)}
                          className="w-full p-3 text-xs font-sans leading-relaxed rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          required
                        />
                      </div>

                      {/* Active Stage Objections & Answers */}
                      <div className="space-y-3 pt-2 border-t border-border">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-bold text-xs text-amber-500 uppercase tracking-wider">
                              Tratativa de Objeções Desta Etapa
                            </h4>
                            <p className="text-[11px] text-muted-foreground">Cadastre respostas prontas quando o cliente apresentar dúvidas ou objeções.</p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddObjection(activeEditorStageIdx)}
                            className="h-7 text-xs border-amber-500/30 text-amber-600 hover:bg-amber-500/10 gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" /> Adicionar Objeção
                          </Button>
                        </div>

                        {(!pbStages[activeEditorStageIdx].objections || pbStages[activeEditorStageIdx].objections.length === 0) ? (
                          <p className="text-xs text-muted-foreground italic py-3 text-center border border-dashed rounded-lg">
                            Nenhuma objeção cadastrada nesta etapa ainda.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {pbStages[activeEditorStageIdx].objections.map((obj: any, oIdx: number) => (
                              <div key={oIdx} className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <label className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                    ⚡ Se o cliente disser:
                                  </label>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveObjection(activeEditorStageIdx, oIdx)}
                                    className="h-6 w-6 text-rose-500 hover:bg-rose-500/10"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>

                                <Input
                                  type="text"
                                  placeholder="Ex: 'Não posso falar agora' ou 'Tenho medo de doer'"
                                  value={obj.trigger}
                                  onChange={(e) => handleUpdateObjection(activeEditorStageIdx, oIdx, "trigger", e.target.value)}
                                  className="h-8 text-xs font-semibold bg-background"
                                />

                                <label className="text-[11px] font-bold text-foreground block pt-1">
                                  💡 O que o vendedor deve responder:
                                </label>
                                <textarea
                                  rows={2}
                                  placeholder="Ex: Sem problemas! Qual horário fica melhor para eu retornar?"
                                  value={obj.response}
                                  onChange={(e) => handleUpdateObjection(activeEditorStageIdx, oIdx, "response", e.target.value)}
                                  className="w-full p-2.5 text-xs rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="py-20 text-center text-muted-foreground text-xs">
                      Selecione ou crie uma etapa na barra lateral para começar a editar.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* PLAIN TEXT MODE */
              <div className="p-5 space-y-2">
                <label className="text-xs font-bold text-foreground">Conteúdo do Roteiro em Texto Livre *</label>
                <textarea
                  rows={14}
                  placeholder="Digite o roteiro comercial completo em texto corrido..."
                  value={pbContent}
                  onChange={(e) => setPbContent(e.target.value)}
                  className="w-full p-3 text-xs font-sans leading-relaxed rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  required
                />
              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className="p-4 bg-muted/40 border-t border-border flex items-center justify-between">
            <Button type="button" variant="outline" onClick={() => setPlaybookEditorOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSavePlaybookInManager}
              disabled={pbSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 text-xs"
            >
              {pbSubmitting ? "Salvando..." : editingPlaybook ? "Atualizar Playbook Salvo" : "Salvar Playbook na Biblioteca"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
