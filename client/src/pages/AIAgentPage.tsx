import { useState, useEffect } from "react";
import {
  Bot,
  Plus,
  Key,
  Save,
  Loader2,
  Cpu,
  PhoneCall,
  Sparkles,
  Smartphone,
  Copy,
  CheckCircle2,
  Send,
  Zap,
  Trash2,
  Edit,
  Radio,
  AlertCircle,
  Volume2,
  Clock,
  ShieldCheck,
  ExternalLink,
  PhoneOff,
  MessageSquare,
  MousePointerClick,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useSessions } from "@/stores/sessions";
import { getAISettings, saveAISettings, type AISettings } from "@/services/settings";
import {
  listAIAgents,
  createAIAgent,
  updateAIAgent,
  deleteAIAgent,
  type AIAgent,
} from "@/services/aiAgents";
import { apiPost } from "@/lib/api";

export const AIAgentPage = () => {
  const sessions = useSessions((s) => s.sessions);
  const pairedSessions = sessions.filter((s) => s.paired);

  // Tab State: "agents" | "settings"
  const [activeTab, setActiveTab] = useState<"agents" | "settings">("agents");

  // Agents State
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);

  // Modal State for Create/Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Partial<AIAgent> | null>(null);
  const [savingAgent, setSavingAgent] = useState(false);

  // Delete Confirm Dialog
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Quick Test Dialog
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testAgent, setTestAgent] = useState<AIAgent | null>(null);
  const [testSessionId, setTestSessionId] = useState<string>("");
  const [testPhone, setTestPhone] = useState("");
  const [testingCall, setTestingCall] = useState(false);
  const [testingMessage, setTestingMessage] = useState(false);
  const [testingButtons, setTestingButtons] = useState(false);

  // Global Settings State
  const [settings, setSettings] = useState<AISettings>({
    groqApiKey: "",
    openaiApiKey: "",
    openrouterApiKey: "",
    googleApiKey: "",
    systemApiKey: "",
    defaultProvider: "openrouter",
    defaultModel: "meta-llama/llama-3.3-70b-instruct",
    defaultVoice: "alloy",
    defaultPrompt: "",
    defaultFirstMessage: "",
    agentName: "",
    aiSessionId: "all",
    autoAnswerAi: "true",
    autoAnswerDelaySec: "1",
    messageWebhookUrl: "",
    callWebhookUrl: "",
    whisperModel: "whisper-large-v3-turbo",
  });
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Load Agents and Settings
  const loadAgents = async () => {
    try {
      setLoadingAgents(true);
      const data = await listAIAgents();
      setAgents(data);
    } catch {
      toast.error("Não foi possível carregar a lista de agentes de IA.");
    } finally {
      setLoadingAgents(false);
    }
  };

  const loadSettings = async () => {
    try {
      setLoadingSettings(true);
      const res = await getAISettings();
      setSettings((prev) => ({
        ...prev,
        ...res,
        defaultProvider: res.defaultProvider || "openrouter",
        defaultModel: res.defaultModel || "meta-llama/llama-3.3-70b-instruct",
        defaultVoice: res.defaultVoice || "alloy",
      }));
    } catch {
      toast.error("Erro ao carregar configurações de chaves de API.");
    } finally {
      setLoadingSettings(false);
    }
  };

  useEffect(() => {
    loadAgents();
    loadSettings();
  }, []);

  // Handle Save Global Settings
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await saveAISettings(settings);
      toast.success("Chaves de API e configurações salvas com sucesso!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar configurações.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCopySystemKey = () => {
    if (!settings.systemApiKey) {
      toast.error("Defina ou gere uma chave primeiro.");
      return;
    }
    navigator.clipboard.writeText(settings.systemApiKey);
    setCopiedKey(true);
    toast.success("Chave de API copiada para a área de transferência!");
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleGenerateKey = () => {
    const key = "atk_live_" + Array.from(crypto.getRandomValues(new Uint8Array(20)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    setSettings((prev) => ({ ...prev, systemApiKey: key }));
    toast.success("Nova chave gerada! Lembre-se de clicar em 'Salvar Chaves'.");
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingAgent({
      name: "",
      description: "",
      provider: "gemini_live",
      model: "gemini-2.5-flash-native-audio-latest",
      voice: "Aoede",
      systemPrompt:
        "Você é um assistente de inteligência artificial de voz do AtendiCalls. Seu objetivo é atender ligações com educação, objetividade e cordialidade, tirando dúvidas sobre produtos/serviços e direcionando para a equipe humana quando necessário.\n\nRegras de Ferramentas:\n- Se prometer enviar um lembrete, link, resumo ou continuar por mensagem, use a ferramenta 'enviar_mensagem_whatsapp' e avise o interlocutor na ligação que já enviou.\n- Quando a conversa for concluída ou o cliente disser 'tchau', 'obrigado' ou 'pode desligar', despeça-se educadamente e use a ferramenta 'encerrar_chamada'.\nSeja conciso com respostas faladas de 2 a 3 frases no máximo.",
      firstMessage: "Olá! Como posso te ajudar hoje?",
      autoAnswer: true,
      autoAnswerDelaySec: 1,
      assignedSessions: ["all"],
      callWebhookUrl: "",
      enableHangup: true,
      hangupDelaySec: 1.5,
      enableWhatsAppMessage: true,
      whatsappMessageRules: "",
      isActive: true,
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (agent: AIAgent) => {
    setEditingAgent({ ...agent });
    setIsModalOpen(true);
  };

  // Save Agent (Create or Update)
  const handleSaveAgent = async () => {
    if (!editingAgent?.name?.trim()) {
      toast.error("O nome do agente é obrigatório.");
      return;
    }
    if (!editingAgent?.systemPrompt?.trim()) {
      toast.error("O Prompt do Sistema é obrigatório.");
      return;
    }

    setSavingAgent(true);
    try {
      if (editingAgent.id) {
        // Update
        const updated = await updateAIAgent(editingAgent.id, editingAgent);
        setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        toast.success(`Agente "${updated.name}" atualizado com sucesso!`);
      } else {
        // Create
        const created = await createAIAgent(editingAgent);
        setAgents((prev) => [...prev, created]);
        toast.success(`Agente "${created.name}" criado com sucesso!`);
      }
      setIsModalOpen(false);
      setEditingAgent(null);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar agente de IA.");
    } finally {
      setSavingAgent(false);
    }
  };

  // Delete Agent
  const handleDeleteAgent = async (id: string) => {
    try {
      await deleteAIAgent(id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
      toast.success("Agente de IA excluído com sucesso.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir agente.");
    } finally {
      setDeleteConfirmId(null);
    }
  };

  // Open Quick Test Modal
  const handleOpenTest = (agent: AIAgent) => {
    setTestAgent(agent);
    // Auto select first session or agent's assigned session
    if (agent.assignedSessions && agent.assignedSessions.length > 0 && agent.assignedSessions[0] !== "all") {
      setTestSessionId(agent.assignedSessions[0]);
    } else if (pairedSessions.length > 0) {
      setTestSessionId(pairedSessions[0].id);
    } else {
      setTestSessionId("");
    }
    setTestModalOpen(true);
  };

  const handleTestCall = async () => {
    if (!testPhone.trim()) {
      toast.error("Digite o número de telefone com DDD.");
      return;
    }
    if (!testSessionId) {
      toast.error("Selecione uma instância do WhatsApp conectada.");
      return;
    }

    setTestingCall(true);
    try {
      const res = await apiPost<{ callId: string; status: string }>("/api/v1/voice/calls", {
        sessionId: testSessionId,
        to: testPhone,
        agentId: testAgent?.id,
        agent: {
          provider: testAgent?.provider,
          model: testAgent?.model,
          voice: testAgent?.voice,
          systemPrompt: testAgent?.systemPrompt,
          firstMessage: testAgent?.firstMessage,
        },
      });

      toast.success(`Ligação iniciada com sucesso! CallID: ${res.callId || "OK"}`);
      setTestModalOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Falha ao disparar ligação com IA.");
    } finally {
      setTestingCall(false);
    }
  };

  const handleTestMessage = async () => {
    if (!testPhone.trim()) {
      toast.error("Digite o número de telefone com DDD.");
      return;
    }
    if (!testSessionId) {
      toast.error("Selecione uma instância do WhatsApp conectada.");
      return;
    }

    setTestingMessage(true);
    try {
      const text = testAgent?.firstMessage || "Olá! Mensagem de teste do AtendiCalls com IA.";
      const res = await apiPost<{ messageId: string }>("/api/v1/messages/send-text", {
        sessionId: testSessionId,
        to: testPhone,
        text,
      });

      toast.success(`Mensagem enviada com sucesso! ID: ${res.messageId || "OK"}`);
    } catch (e: any) {
      toast.error(e.message || "Falha ao enviar mensagem de texto.");
    } finally {
      setTestingMessage(false);
    }
  };

  const handleTestButtons = async () => {
    if (!testPhone.trim()) {
      toast.error("Digite o número de telefone com DDD.");
      return;
    }
    if (!testSessionId) {
      toast.error("Selecione uma instância do WhatsApp conectada.");
      return;
    }

    setTestingButtons(true);
    try {
      const res = await apiPost<{ messageId: string }>("/api/v1/messages/send-buttons", {
        sessionId: testSessionId,
        to: testPhone,
        title: "AtendiCalls • Assistente Virtual",
        text: "Olá! Como posso te ajudar hoje? Selecione uma das opções abaixo:",
        footer: "Atendimento Automatizado Inteligente",
        buttons: [
          { type: "reply", text: "✅ Confirmar Agendamento", id: "btn_confirmar" },
          { type: "reply", text: "📅 Remarcar Horário", id: "btn_remarcar" },
          { type: "url", text: "🌐 Acessar Painel", url: "https://atendicalls.com" },
        ],
      });

      toast.success(`Mensagem com botões enviada com sucesso! ID: ${res.messageId || "OK"}`);
    } catch (e: any) {
      toast.error(e.message || "Falha ao enviar botões interativos.");
    } finally {
      setTestingButtons(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Tabs Switcher & Actions Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("agents")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "agents"
                ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Bot className="w-4 h-4" />
            Assistentes Cadastrados
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-300">
              {agents.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "settings"
                ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Key className="w-4 h-4" />
            Chaves de API & Integração
          </button>
        </div>

        {activeTab === "agents" && (
          <Button
            onClick={handleOpenCreate}
            className="bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/20 gap-2 font-medium shrink-0"
          >
            <Plus className="w-4 h-4" />
            Novo Agente de IA
          </Button>
        )}
      </div>

      {/* TAB 1: AGENTS LIST */}
      {activeTab === "agents" && (
        <div>
          {loadingAgents ? (
            <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-3" />
              <p>Carregando agentes de IA...</p>
            </div>
          ) : agents.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-border/60 rounded-2xl bg-card/40 p-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto">
                <Bot className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">Nenhum agente cadastrado</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Cadastre seu primeiro assistente virtual para atender ligações automaticamente em suas instâncias do WhatsApp.
                </p>
              </div>
              <Button onClick={handleOpenCreate} className="bg-purple-600 hover:bg-purple-700 text-white gap-2">
                <Plus className="w-4 h-4" />
                Criar Primeiro Agente
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {agents.map((agent) => {
                const isAllSessions =
                  !agent.assignedSessions ||
                  agent.assignedSessions.length === 0 ||
                  agent.assignedSessions.includes("all") ||
                  agent.assignedSessions.includes("*");

                const assignedNames = isAllSessions
                  ? ["Todas as instâncias"]
                  : agent.assignedSessions
                      .map((sid) => {
                        const sess = sessions.find((s) => s.id === sid);
                        return sess ? sess.name || sess.id : sid;
                      })
                      .filter(Boolean);

                return (
                  <div
                    key={agent.id}
                    className="flex flex-col justify-between rounded-xl border border-border/60 bg-card hover:border-purple-500/40 transition-all p-5 shadow-sm space-y-4"
                  >
                    {/* Header */}
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="relative p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            <Bot className="w-5 h-5" />
                            <span
                              className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-background ${
                                agent.isActive ? "bg-emerald-500" : "bg-neutral-500"
                              }`}
                            />
                          </div>
                          <div>
                            <h3 className="font-semibold text-base leading-tight text-foreground">
                              {agent.name}
                            </h3>
                            <span className="text-xs text-muted-foreground font-mono">
                              ID: {agent.id}
                            </span>
                          </div>
                        </div>

                        <Badge
                          variant={agent.isActive ? "default" : "secondary"}
                          className={`text-xs ${
                            agent.isActive
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {agent.isActive ? "Ativo" : "Pausado"}
                        </Badge>
                      </div>

                      {agent.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {agent.description}
                        </p>
                      )}

                      {/* Badges / Specs */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20">
                          <Cpu className="w-3 h-3" />
                          {agent.provider === "openrouter"
                            ? "OpenRouter"
                            : agent.provider === "gemini_live"
                            ? "Gemini Live"
                            : "OpenAI Realtime"}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono bg-muted/60 text-muted-foreground border border-border/40">
                          {agent.model.split("/").pop()}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20">
                          <Volume2 className="w-3 h-3" />
                          {agent.voice}
                        </span>
                      </div>

                      {/* Capabilities Badges */}
                      <div className="flex flex-wrap gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                            agent.enableHangup !== false
                              ? "bg-purple-500/10 text-purple-300 border-purple-500/20"
                              : "bg-muted/40 text-muted-foreground border-border/30 opacity-60"
                          }`}
                        >
                          <PhoneOff className="w-3 h-3" />
                          {agent.enableHangup !== false
                            ? `Auto-desliga (${agent.hangupDelaySec || 1.5}s)`
                            : "Sem auto-desligar"}
                        </span>

                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                            agent.enableWhatsAppMessage !== false
                              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                              : "bg-muted/40 text-muted-foreground border-border/30 opacity-60"
                          }`}
                        >
                          <MessageSquare className="w-3 h-3" />
                          {agent.enableWhatsAppMessage !== false ? "Envia WhatsApp" : "Sem envio de msg"}
                        </span>
                      </div>

                      {/* Auto Answer Status */}
                      <div className="rounded-lg bg-muted/30 border border-border/40 p-2.5 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-purple-400" />
                            Autoatendimento Receptivo:
                          </span>
                          <span
                            className={`font-semibold ${
                              agent.autoAnswer ? "text-emerald-400" : "text-neutral-400"
                            }`}
                          >
                            {agent.autoAnswer ? `Atende em ${agent.autoAnswerDelaySec}s` : "Desativado"}
                          </span>
                        </div>

                        {/* Assigned WhatsApp instances */}
                        <div className="pt-1 border-t border-border/30 flex items-start gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="flex-1 flex flex-wrap gap-1">
                            {assignedNames.map((name, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[11px] font-medium border border-emerald-500/20"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* First message preview */}
                      {agent.firstMessage && (
                        <div className="text-xs text-muted-foreground italic bg-muted/20 p-2 rounded border border-border/30 line-clamp-2">
                          "{agent.firstMessage}"
                        </div>
                      )}
                    </div>

                    {/* Actions Footer */}
                    <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/40">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenTest(agent)}
                        className="text-xs h-8 text-purple-400 border-purple-500/30 hover:bg-purple-500/10 gap-1.5"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        Testar
                      </Button>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEdit(agent)}
                          className="text-xs h-8 text-foreground hover:bg-muted gap-1"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          Editar
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirmId(agent.id)}
                          className="text-xs h-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: GLOBAL API KEYS & INTEGRATIONS */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-border/40">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Chaves de API dos Provedores de IA</h2>
                  <p className="text-xs text-muted-foreground">
                    Essas chaves são compartilhadas por todos os agentes criados na plataforma.
                  </p>
                </div>
              </div>

              <Button
                onClick={handleSaveSettings}
                disabled={savingSettings || loadingSettings}
                className="bg-purple-600 hover:bg-purple-700 text-white gap-2 font-medium"
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Chaves
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-purple-400" />
                  OpenRouter API Key (Recomendado)
                </label>
                <Input
                  type="password"
                  placeholder="sk-or-v1-..."
                  value={settings.openrouterApiKey || ""}
                  onChange={(e) => setSettings({ ...settings, openrouterApiKey: e.target.value })}
                  className="font-mono text-xs bg-muted/40"
                />
                <span className="text-[11px] text-muted-foreground">
                  Acesso a centenas de modelos (Llama 3.3, Claude, Gemini Flash, etc.).
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  Google Gemini API Key
                </label>
                <Input
                  type="password"
                  placeholder="AIzaSy..."
                  value={settings.googleApiKey || ""}
                  onChange={(e) => setSettings({ ...settings, googleApiKey: e.target.value })}
                  className="font-mono text-xs bg-muted/40"
                />
                <span className="text-[11px] text-muted-foreground">
                  Para Gemini 2.0 Live com voz ultra-rápida nativa.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  OpenAI API Key
                </label>
                <Input
                  type="password"
                  placeholder="sk-proj-..."
                  value={settings.openaiApiKey || ""}
                  onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                  className="font-mono text-xs bg-muted/40"
                />
                <span className="text-[11px] text-muted-foreground">
                  Para OpenAI Realtime Voice ou TTS (vozes Alloy, Echo, etc.).
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-amber-400" />
                  Groq API Key (Whisper Transcriber)
                </label>
                <Input
                  type="password"
                  placeholder="gsk_..."
                  value={settings.groqApiKey || ""}
                  onChange={(e) => setSettings({ ...settings, groqApiKey: e.target.value })}
                  className="font-mono text-xs bg-muted/40"
                />
                <span className="text-[11px] text-muted-foreground">
                  Transcrição em tempo real (STT) ultrarrápida (sub-200ms).
                </span>
              </div>
            </div>
          </div>

          {/* Public Integration API & Webhook */}
          <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-border/40">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Chave de Autenticação da API Pública (Bearer Token)</h2>
                <p className="text-xs text-muted-foreground">
                  Utilize esta chave no cabeçalho <code className="text-purple-400">Authorization: Bearer &lt;chave&gt;</code> para disparar chamadas ou mensagens via CRM/N8N/Make.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  readOnly
                  value={settings.systemApiKey || ""}
                  placeholder="Nenhuma chave configurada (clique em Gerar Nova)"
                  className="font-mono text-xs bg-muted/50 text-foreground"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopySystemKey}
                  disabled={!settings.systemApiKey}
                  className="gap-1.5 shrink-0"
                >
                  {copiedKey ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  Copiar
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerateKey}
                  className="shrink-0 text-xs"
                >
                  Gerar Nova
                </Button>
              </div>

              <div className="rounded-lg bg-muted/20 border border-border/40 p-4 space-y-2">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-purple-400" />
                  Exemplo de Disparo de Ligação Ativa com Agente Específico:
                </h4>
                <pre className="text-[11px] font-mono bg-neutral-950 p-3 rounded-md text-neutral-300 overflow-x-auto">
{`curl -X POST http://localhost:8080/api/v1/voice/calls \\
  -H "Authorization: Bearer ${settings.systemApiKey || "SUA_CHAVE_AQUI"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "sessionId": "whats_comercial",
    "agentId": "agent_comercial_padrao",
    "to": "5511999998888"
  }'`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT AGENT MODAL */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col justify-between overflow-hidden p-0">
          <DialogHeader className="p-6 pb-4 border-b border-border/40">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Bot className="w-5 h-5 text-purple-400" />
              {editingAgent?.id ? "Editar Agente de IA" : "Criar Novo Agente de IA"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure as instruções de conversação, voz, autoatendimento e quais instâncias de WhatsApp este agente irá gerenciar.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 overflow-y-auto space-y-6">
            {/* 1. Identificação Básica */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Nome do Agente *
                </label>
                <Input
                  placeholder="Ex: Sara - Comercial, Suporte N1, etc."
                  value={editingAgent?.name || ""}
                  onChange={(e) => setEditingAgent({ ...editingAgent, name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Descrição Interna (Opcional)
                </label>
                <Input
                  placeholder="Ex: Responsável por qualificação de leads novos"
                  value={editingAgent?.description || ""}
                  onChange={(e) => setEditingAgent({ ...editingAgent, description: e.target.value })}
                />
              </div>
            </div>

            {/* 2. Instâncias do WhatsApp Vinculadas */}
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    Instâncias do WhatsApp Vinculadas
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Selecione quais números de WhatsApp serão atendidos por este agente.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                {/* Option: Todas as instâncias */}
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    editingAgent?.assignedSessions?.includes("all")
                      ? "bg-purple-500/10 border-purple-500/50 text-purple-300"
                      : "bg-card border-border/40 hover:border-border text-foreground"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="rounded border-border text-purple-600 focus:ring-purple-500"
                    checked={editingAgent?.assignedSessions?.includes("all") || false}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setEditingAgent({ ...editingAgent, assignedSessions: ["all"] });
                      } else {
                        setEditingAgent({ ...editingAgent, assignedSessions: [] });
                      }
                    }}
                  />
                  <div>
                    <div className="text-xs font-semibold">Todas as Instâncias</div>
                    <div className="text-[11px] text-muted-foreground">
                      Atende chamadas em qualquer WhatsApp conectado
                    </div>
                  </div>
                </label>

                {/* Individual Paired Sessions */}
                {pairedSessions.map((sess) => {
                  const isChecked =
                    editingAgent?.assignedSessions?.includes("all") ||
                    editingAgent?.assignedSessions?.includes(sess.id) ||
                    false;

                  return (
                    <label
                      key={sess.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        isChecked && !editingAgent?.assignedSessions?.includes("all")
                          ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-300"
                          : "bg-card border-border/40 hover:border-border text-foreground"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={editingAgent?.assignedSessions?.includes("all")}
                        className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                        checked={isChecked}
                        onChange={(e) => {
                          let current = [...(editingAgent?.assignedSessions || [])].filter((s) => s !== "all");
                          if (e.target.checked) {
                            current.push(sess.id);
                          } else {
                            current = current.filter((s) => s !== sess.id);
                          }
                          setEditingAgent({ ...editingAgent, assignedSessions: current });
                        }}
                      />
                      <div className="truncate">
                        <div className="text-xs font-semibold truncate">{sess.name || sess.id}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {sess.phone ? `+${sess.phone}` : sess.id}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 3. Autoatendimento Receptivo */}
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <PhoneCall className="w-4 h-4 text-purple-400" />
                    Autoatendimento para Chamadas Recebidas
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Quando alguém ligar para as instâncias vinculadas, a IA atende automaticamente.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={editingAgent?.autoAnswer ?? true}
                      onChange={(e) => setEditingAgent({ ...editingAgent, autoAnswer: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>
              </div>

              {editingAgent?.autoAnswer && (
                <div className="flex items-center gap-3 pt-2 border-t border-border/30">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Tempo antes de atender (segundos):</span>
                  <Input
                    type="number"
                    min="0"
                    max="15"
                    className="w-20 h-8 text-xs text-center"
                    value={editingAgent?.autoAnswerDelaySec ?? 1}
                    onChange={(e) =>
                      setEditingAgent({
                        ...editingAgent,
                        autoAnswerDelaySec: parseInt(e.target.value) || 1,
                      })
                    }
                  />
                  <span className="text-[11px] text-muted-foreground">
                    (Dê 1 a 2 segundos para o toque soar natural para o cliente)
                  </span>
                </div>
              )}
            </div>

            {/* 4. Motor de IA e Voz */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Provedor de Voz</label>
                <select
                  value={editingAgent?.provider || "gemini_live"}
                  onChange={(e) => {
                    const newProv = e.target.value;
                    let newModel = editingAgent?.model || "";
                    let newVoice = editingAgent?.voice || "Aoede";
                    if (newProv === "gemini_live") {
                      newModel = "gemini-2.5-flash-native-audio-latest";
                      if (!["Aoede", "Charon", "Fenrir", "Kore", "Puck"].includes(newVoice)) {
                        newVoice = "Aoede";
                      }
                    } else if (newProv === "openai_realtime") {
                      newModel = "gpt-4o-realtime-preview";
                      if (["Aoede", "Charon", "Fenrir", "Kore", "Puck"].includes(newVoice)) {
                        newVoice = "alloy";
                      }
                    } else if (newProv === "openrouter") {
                      newModel = "meta-llama/llama-3.3-70b-instruct";
                      if (["Aoede", "Charon", "Fenrir", "Kore", "Puck"].includes(newVoice)) {
                        newVoice = "alloy";
                      }
                    }
                    setEditingAgent({
                      ...editingAgent,
                      provider: newProv,
                      model: newModel,
                      voice: newVoice,
                    });
                  }}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="gemini_live">Google Gemini Live (Voz Nativa)</option>
                  <option value="openrouter">OpenRouter (Multimodelo Llama/Claude)</option>
                  <option value="openai_realtime">OpenAI Realtime</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Modelo de Linguagem (LLM)</label>
                <Input
                  value={editingAgent?.model || ""}
                  onChange={(e) => setEditingAgent({ ...editingAgent, model: e.target.value })}
                  placeholder={
                    editingAgent?.provider === "gemini_live"
                      ? "gemini-2.5-flash-native-audio-latest"
                      : "meta-llama/llama-3.3-70b-instruct"
                  }
                  className="text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Voz do Atendente</label>
                <select
                  value={editingAgent?.voice || (editingAgent?.provider === "gemini_live" ? "Aoede" : "alloy")}
                  onChange={(e) => setEditingAgent({ ...editingAgent, voice: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                >
                  {editingAgent?.provider === "gemini_live" ? (
                    <>
                      <option value="Aoede">Aoede (Feminina Suave / Confiante)</option>
                      <option value="Kore">Kore (Feminina Clara / Expressiva)</option>
                      <option value="Puck">Puck (Neutra / Dinâmica)</option>
                      <option value="Charon">Charon (Masculina Profissional / Calma)</option>
                      <option value="Fenrir">Fenrir (Masculina Forte / Firme)</option>
                    </>
                  ) : (
                    <>
                      <option value="alloy">Alloy (Neutra / Equilibrada)</option>
                      <option value="echo">Echo (Masculina Executiva)</option>
                      <option value="shimmer">Shimmer (Feminina Clara)</option>
                      <option value="ash">Ash (Conversacional)</option>
                      <option value="coral">Coral (Expressiva)</option>
                      <option value="sage">Sage (Autoridade Profissional)</option>
                      <option value="verse">Verse (Dinâmica)</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* 5. Mensagem de Saudação & Prompt */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Primeira Mensagem de Saudação (Assim que a ligação conectar)
              </label>
              <Input
                placeholder="Ex: Olá! Sou a Sara do atendimento. Como posso te ajudar?"
                value={editingAgent?.firstMessage || ""}
                onChange={(e) => setEditingAgent({ ...editingAgent, firstMessage: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Prompt do Sistema (Personalidade, Regras de Negócio e Conhecimento) *
              </label>
              <textarea
                rows={6}
                placeholder="Defina o papel do agente, as informações dos seus produtos, limites de atendimento, etc."
                value={editingAgent?.systemPrompt || ""}
                onChange={(e) => setEditingAgent({ ...editingAgent, systemPrompt: e.target.value })}
                className="w-full rounded-md border border-input bg-background p-3 text-xs font-sans leading-relaxed resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {/* 6. Habilidades e Ações em Chamada (Tools) */}
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4 text-purple-400" />
                  Habilidades e Ações em Chamada
                </h4>
                <p className="text-xs text-muted-foreground">
                  Ative ou desative ferramentas automáticas que a IA pode executar durante e após as ligações.
                </p>
              </div>

              {/* Sub-item: Encerrar Chamada */}
              <div className="rounded-lg border border-border/40 bg-card p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-2.5">
                    <PhoneOff className="w-4 h-4 text-purple-400 mt-0.5" />
                    <div>
                      <div className="text-xs font-semibold text-foreground">
                        Encerrar Chamada por Voz (Auto-Hangup)
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Permite que a IA desligue a ligação após se despedir ou quando o cliente disser tchau/obrigado.
                      </div>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={editingAgent?.enableHangup ?? true}
                      onChange={(e) =>
                        setEditingAgent({
                          ...editingAgent,
                          enableHangup: e.target.checked,
                        })
                      }
                    />
                    <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                {(editingAgent?.enableHangup ?? true) && (
                  <div className="flex items-center gap-3 pt-2 border-t border-border/30 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Tempo de espera após a fala de despedida:</span>
                    <Input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="10"
                      className="w-20 h-7 text-xs text-center"
                      value={editingAgent?.hangupDelaySec ?? 1.5}
                      onChange={(e) =>
                        setEditingAgent({
                          ...editingAgent,
                          hangupDelaySec: parseFloat(e.target.value) || 1.5,
                        })
                      }
                    />
                    <span className="text-[11px]">segundos</span>
                  </div>
                )}
              </div>

              {/* Sub-item: Enviar Mensagem no WhatsApp */}
              <div className="rounded-lg border border-border/40 bg-card p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-2.5">
                    <MessageSquare className="w-4 h-4 text-emerald-400 mt-0.5" />
                    <div>
                      <div className="text-xs font-semibold text-foreground">
                        Enviar Mensagens pelo WhatsApp em Tempo Real
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Permite que a IA envie mensagens de texto, resumos, links ou lembretes diretamente para o WhatsApp do cliente.
                      </div>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={editingAgent?.enableWhatsAppMessage ?? true}
                      onChange={(e) =>
                        setEditingAgent({
                          ...editingAgent,
                          enableWhatsAppMessage: e.target.checked,
                        })
                      }
                    />
                    <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {(editingAgent?.enableWhatsAppMessage ?? true) && (
                  <div className="space-y-1.5 pt-2 border-t border-border/30">
                    <label className="text-[11px] font-semibold text-muted-foreground">
                      Regras de Mensagens & Links Autorizados (Opcional):
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Ex: Se pedirem agendamento envie https://empresa.com/agenda. Se pedirem catálogo envie https://empresa.com/catalogo. Para pagamentos envie a chave Pix financeiro@empresa.com."
                      value={editingAgent?.whatsappMessageRules || ""}
                      onChange={(e) =>
                        setEditingAgent({
                          ...editingAgent,
                          whatsappMessageRules: e.target.value,
                        })
                      }
                      className="w-full rounded-md border border-input bg-background p-2 text-xs font-sans leading-relaxed resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 7. Webhook Opcional */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Webhook de Eventos & Transcrição deste Agente (Opcional)
              </label>
              <Input
                placeholder="https://seu-sistema.com/webhook/calls"
                value={editingAgent?.callWebhookUrl || ""}
                onChange={(e) => setEditingAgent({ ...editingAgent, callWebhookUrl: e.target.value })}
                className="text-xs font-mono"
              />
            </div>
          </div>

          <DialogFooter className="p-4 border-t border-border/40 bg-muted/20">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveAgent}
              disabled={savingAgent}
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
            >
              {savingAgent ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Agente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QUICK TEST MODAL */}
      <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneCall className="w-5 h-5 text-purple-400" />
              Testar Agente: {testAgent?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Dispare uma ligação telefônica imediata ou envie mensagem de teste pelo WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Instância WhatsApp Remetente</label>
              <select
                value={testSessionId}
                onChange={(e) => setTestSessionId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
              >
                {pairedSessions.length === 0 ? (
                  <option value="">Nenhuma instância conectada</option>
                ) : (
                  pairedSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name || s.id} ({s.phone ? `+${s.phone}` : "Sem número"})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Número de Telefone de Destino</label>
              <Input
                placeholder="Ex: 5511999998888"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="font-mono text-xs"
              />
              <span className="text-[11px] text-muted-foreground">
                Código do País + DDD + Número (ex: 5511999998888)
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestMessage}
              disabled={testingMessage || testingButtons || testingCall}
              className="gap-1.5 text-xs"
            >
              {testingMessage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Enviar Texto
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestButtons}
              disabled={testingButtons || testingMessage || testingCall}
              className="gap-1.5 text-xs text-sky-400 border-sky-500/30 hover:bg-sky-500/10"
            >
              {testingButtons ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MousePointerClick className="w-3.5 h-3.5" />}
              Enviar Botões
            </Button>
            <Button
              size="sm"
              onClick={handleTestCall}
              disabled={testingCall || testingMessage || testingButtons}
              className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5 text-xs font-medium"
            >
              {testingCall ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneCall className="w-3.5 h-3.5" />}
              Ligar com IA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CONFIRM DELETE DIALOG */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              Excluir Agente de IA?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Esta ação removerá o agente permanentemente. Ligações recebidas nas instâncias vinculadas não serão mais atendidas por ele.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteConfirmId && handleDeleteAgent(deleteConfirmId)}
            >
              Sim, Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
