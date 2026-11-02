import { useState, useEffect } from "react";
import {
  PhoneCall, Sparkles, Check, ArrowRight, Zap,
  Smartphone, Bot, BarChart3, Megaphone, Code2, Headphones,
  ChevronDown, Sun, Moon, Volume2, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/stores/theme";
import { listPlansApi } from "@/services/plans";
import type { Plan } from "@/types/user";

export const LandingPage = () => {
  const theme = useTheme((s) => s.theme);
  const toggleTheme = useTheme((s) => s.toggle);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  useEffect(() => {
    listPlansApi()
      .then((data) => {
        // Sort plans by price
        const sorted = [...data].sort((a, b) => a.priceCents - b.priceCents);
        setPlans(sorted);
      })
      .catch(() => {
        // Fallback default plans if offline
        setPlans([
          {
            id: "plan_free",
            name: "Gratuito / Teste",
            description: "Plano inicial com 1 linha WhatsApp e agente de voz IA.",
            priceCents: 0,
            maxInstances: 1,
            maxConcurrentCalls: 2,
            trialDays: 0,
            hasVoiceAi: true,
            hasApiAccess: true,
            hasCampaigns: true,
            isDefault: true,
            isActive: true,
            createdAt: Date.now(),
          },
          {
            id: "plan_pro",
            name: "Profissional",
            description: "Ideal para equipes e empresas em crescimento: 3 linhas simultâneas.",
            priceCents: 9700,
            maxInstances: 3,
            maxConcurrentCalls: 5,
            trialDays: 0,
            hasVoiceAi: true,
            hasApiAccess: true,
            hasCampaigns: true,
            isDefault: false,
            isActive: true,
            createdAt: Date.now(),
          },
        ]);
      })
      .finally(() => setLoadingPlans(false));
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const formatBRL = (cents: number) => {
    if (cents === 0) return "R$ 0,00";
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const faqs = [
    {
      q: "Preciso de operadora de telefonia ou chip VoIP tradicional?",
      a: "Não! O AtendiCalls opera com ligações de voz diretamente sobre o protocolo de voz do WhatsApp. Você utiliza o seu próprio número de WhatsApp (DDD de qualquer região) e não paga tarifas por minuto para operadoras de telecom."
    },
    {
      q: "Como funciona o Agente de Voz com Inteligência Artificial?",
      a: "O agente é treinado com o contexto da sua empresa e atende ou realiza ligações conversando em tempo real com voz humanizada (via OpenAI, Google Gemini, Groq ou OpenRouter). Ele compreende a fala do cliente, responde com entonação natural e pode agendar, tirar dúvidas ou transferir."
    },
    {
      q: "Posso conectar vários números de WhatsApp ao mesmo tempo?",
      a: "Sim! Cada linha conecta de forma independente através da leitura de QR Code. Você pode ter linhas para setores diferentes (Comercial, Suporte, Financeiro) ou filiais diferentes em um único painel."
    },
    {
      q: "Como funciona a integração com o meu CRM ou sistemas externos?",
      a: "O AtendiCalls possui uma API REST completa e sistema de Webhooks. Cada instância possui seu próprio token de conexão para que plataformas externas (N8N, Make, Typebot, CRMs próprios) possam disparar chamadas ou receber eventos de chamadas em tempo real."
    },
    {
      q: "As ligações são gravadas e transcritas?",
      a: "Sim. O sistema grava automaticamente as chamadas e realiza transcrição por inteligência artificial (Whisper), permitindo auditoria, leitura rápida do histórico e busca por palavras-chave."
    },
    {
      q: "Existe fidelidade ou contrato de longo prazo?",
      a: "Não há fidelidade nem multas rescisórias. Você pode iniciar no plano gratuito de teste para validar a ferramenta e fazer upgrade a qualquer momento conforme a sua demanda cresce."
    }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground antialiased selection:bg-emerald-500 selection:text-white">
      {/* NAVBAR */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <PhoneCall className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              Atendi<span className="text-emerald-600 dark:text-emerald-400">Calls</span>
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-muted-foreground">
            <a href="#funcionalidades" className="hover:text-foreground transition-colors">Funcionalidades</a>
            <a href="#inteligencia-artificial" className="hover:text-foreground transition-colors">Agente de IA</a>
            <a href="#como-funciona" className="hover:text-foreground transition-colors">Como Funciona</a>
            <a href="#planos" className="hover:text-foreground transition-colors">Planos & Preços</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
              title="Alternar Tema"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <Button
              variant="ghost"
              onClick={() => navigateTo("/login")}
              className="text-xs font-semibold rounded-xl text-foreground hover:bg-muted"
            >
              Entrar
            </Button>

            <Button
              onClick={() => navigateTo("/register")}
              className="text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm gap-1.5"
            >
              Criar Conta Grátis <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/10 via-background to-background" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center space-y-8">
          {/* Top Pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Motor de Telefonia VoIP & Softphone com IA para WhatsApp</span>
          </div>

          {/* Headline */}
          <div className="max-w-4xl mx-auto space-y-4">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.15]">
              Transforme seu WhatsApp em uma{" "}
              <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                Central Telefônica Inteligente
              </span>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Atenda e realize chamadas de voz diretamente pelo navegador. Integre com Agentes de IA que conversam com voz natural em tempo real, sem tarifas de minutos por operadora.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              size="lg"
              onClick={() => navigateTo("/register")}
              className="w-full sm:w-auto rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-8 py-6 text-sm shadow-lg shadow-emerald-600/20 gap-2 cursor-pointer transition-all hover:scale-[1.02]"
            >
              Começar Gratuitamente com 1 Linha <ArrowRight className="h-4 w-4" />
            </Button>

            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                const el = document.getElementById("planos");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className="w-full sm:w-auto rounded-2xl font-semibold px-6 py-6 text-sm border-border hover:bg-muted/60"
            >
              Ver Planos & Recursos
            </Button>
          </div>

          {/* Trust Badges */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Sem taxas por minuto</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> WebRTC Direto no Navegador</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Gravação & Transcrição por IA</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> API REST & Webhooks</span>
          </div>

          {/* Hero Visual Mockup: Softphone Live Preview */}
          <div className="pt-8 max-w-4xl mx-auto">
            <div className="relative rounded-3xl border border-border/80 bg-card/60 p-4 sm:p-6 shadow-2xl backdrop-blur-xl">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Chamada Ativa em Andamento
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 text-left">
                {/* Left: Caller Info */}
                <div className="rounded-2xl border bg-background/80 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-base border border-emerald-500/20">
                      MC
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-foreground">Mariana Costa</h4>
                      <p className="text-xs text-muted-foreground">+55 (11) 98765-4321</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-border/50 text-[11px]">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Duração:</span>
                      <span className="font-mono text-foreground font-semibold">03:42</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Protocolo:</span>
                      <span className="text-emerald-600 font-medium">WhatsApp VoIP HD</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Linha:</span>
                      <span className="text-foreground">Comercial Matriz</span>
                    </div>
                  </div>
                </div>

                {/* Center: Live Waveform & Controls */}
                <div className="rounded-2xl border bg-background/80 p-4 flex flex-col justify-between space-y-4 md:col-span-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <Bot className="h-4 w-4 text-purple-500" /> Agente de Voz IA Atendendo
                      </span>
                      <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/20">
                        Gemini 2.0 Flash
                      </Badge>
                    </div>

                    {/* Audio wave simulation */}
                    <div className="h-10 flex items-center justify-center gap-1 bg-muted/40 rounded-xl px-4 py-2 border">
                      {[40, 65, 30, 85, 95, 45, 70, 90, 60, 80, 40, 75, 90, 50, 85, 60, 40].map((h, i) => (
                        <div
                          key={i}
                          className="w-1.5 bg-emerald-500 rounded-full transition-all duration-300"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Transcript Preview */}
                  <div className="rounded-xl bg-muted/30 p-3 text-xs space-y-1.5 border border-border/40">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Transcrição ao Vivo</span>
                    <p className="text-foreground italic">
                      "Olá Mariana! Vi que você se interessou pela integração com o seu CRM. Nosso sistema já está pronto para conectar suas linhas agora mesmo..."
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* VALUE PROPOSITION: ZERO TELECOM */}
      <section className="py-16 border-y border-border/40 bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
            <div className="space-y-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">Economia Radical</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Elimine contas caras de minutos VoIP e planos de operadoras. As chamadas acontecem direto pela rede do WhatsApp com alta qualidade de áudio.
              </p>
            </div>

            <div className="space-y-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20">
                <Headphones className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">Softphone 100% Web</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Sem necessidade de instalar aplicativos ou configurar gateways analógicos. Toda a sua equipe atende e liga direto pelo navegador.
              </p>
            </div>

            <div className="space-y-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 border border-purple-500/20">
                <Bot className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">Atendimento com IA Humanizada</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Substitua URAs robóticas por agentes de inteligência artificial que realmente conversam, tiram dúvidas e qualificam seus clientes 24/7.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* DETAILED FEATURES GRID */}
      <section id="funcionalidades" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-500/30 bg-emerald-500/10">
              Recursos Avançados
            </Badge>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              Tudo o que você precisa em uma única plataforma
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              O AtendiCalls reúne a robustez de um PABX moderno com o poder dos modelos de inteligência artificial de última geração.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="rounded-2xl border bg-card p-6 space-y-3 hover:border-emerald-500/50 transition-all shadow-xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <Smartphone className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">Multi-Instâncias WhatsApp</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Conecte múltiplos números de WhatsApp simultâneos. Distribua linhas entre filiais, setores comerciais ou membros do time sem complicação.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl border bg-card p-6 space-y-3 hover:border-emerald-500/50 transition-all shadow-xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
                <Bot className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">Agente de IA com Voz Natural</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Integração nativa com OpenAI GPT-4o, Google Gemini 2.0, Groq e OpenRouter para respostas de voz com ultra baixa latência e total naturalidade.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl border bg-card p-6 space-y-3 hover:border-emerald-500/50 transition-all shadow-xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                <Volume2 className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">Gravação & Transcrição Whisper</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Todas as ligações são gravadas e transcritas automaticamente em texto. Ouça o áudio ou pesquise o conteúdo de qualquer conversa quando quiser.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="rounded-2xl border bg-card p-6 space-y-3 hover:border-emerald-500/50 transition-all shadow-xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                <Megaphone className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">Campanhas de Chamadas em Massa</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Crie listas de contatos e dispare chamadas automáticas de voz com scripts e playbooks inteligentes para recuperação de clientes e confirmações.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="rounded-2xl border bg-card p-6 space-y-3 hover:border-emerald-500/50 transition-all shadow-xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600">
                <Code2 className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">API REST & Webhooks Abertos</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Conecte seu CRM, N8N, Typebot ou Make em minutos. Cada instância possui seu próprio token seguro para disparar chamadas ou enviar mensagens.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="rounded-2xl border bg-card p-6 space-y-3 hover:border-emerald-500/50 transition-all shadow-xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
                <BarChart3 className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">Relatórios & Métricas em Tempo Real</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Acompanhe o volume de chamadas, duração média, taxa de sucesso de atendimento e desempenho de cada linha através de dashboards completos.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="como-funciona" className="py-20 border-t border-border/40 bg-muted/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <Badge variant="outline" className="text-xs text-blue-600 border-blue-500/30 bg-blue-500/10">
              Simplicidade de Configuração
            </Badge>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              Em menos de 2 minutos você está pronto para operar
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Sem burocracia, sem operadoras e sem placas de hardware caras.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="relative rounded-2xl border bg-card p-6 space-y-3">
              <div className="h-8 w-8 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                1
              </div>
              <h3 className="font-bold text-base text-foreground">Crie sua Conta Grátis</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Cadastre-se na plataforma em segundos. O plano gratuito de teste é ativado imediatamente sem precisar cadastrar cartão de crédito.
              </p>
            </div>

            <div className="relative rounded-2xl border bg-card p-6 space-y-3">
              <div className="h-8 w-8 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                2
              </div>
              <h3 className="font-bold text-base text-foreground">Conecte seu WhatsApp</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Abra a aba de instâncias e leia o QR Code com o aplicativo WhatsApp do seu celular. A sincronização com a central VoIP é instantânea.
              </p>
            </div>

            <div className="relative rounded-2xl border bg-card p-6 space-y-3">
              <div className="h-8 w-8 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                3
              </div>
              <h3 className="font-bold text-base text-foreground">Atenda ou Deixe a IA Falar</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Receba chamadas no softphone do navegador ou ative o Agente de IA para conversar com seus leads e clientes de forma automática e humanizada.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING & PLANS SECTION (DYNAMIC FROM BACKEND) */}
      <section id="planos" className="py-20 border-t border-border/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-500/30 bg-emerald-500/10">
              Planos Transparentes
            </Badge>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              Escolha o plano ideal para a sua empresa
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Sem fidelidade. Sem contratos de longo prazo. Comece no gratuito e faça upgrade quando desejar.
            </p>
          </div>

          {loadingPlans ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto items-stretch">
              {plans.map((p) => {
                const isPro = p.priceCents > 0;
                return (
                  <div
                    key={p.id}
                    className={`rounded-3xl border p-6 sm:p-8 flex flex-col justify-between transition-all bg-card ${
                      isPro
                        ? "border-emerald-500 shadow-xl shadow-emerald-500/10 ring-2 ring-emerald-500/30 relative"
                        : "border-border shadow-sm hover:border-emerald-500/40"
                    }`}
                  >
                    {isPro && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-3.5 py-1 text-[11px] font-bold text-white shadow-sm uppercase tracking-wider">
                        Mais Recomendado
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <h3 className="text-xl font-bold text-foreground">{p.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {p.description || "Plano completo para atendimento VoIP WhatsApp com inteligência artificial."}
                        </p>
                      </div>

                      <div className="pt-2">
                        <span className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
                          {p.priceCents === 0 ? "Gratuito" : formatBRL(p.priceCents)}
                        </span>
                        {p.priceCents > 0 && <span className="text-xs text-muted-foreground"> /mês</span>}
                      </div>

                      <div className="space-y-2.5 pt-4 border-t border-border/50 text-xs">
                        <div className="flex items-center gap-2 text-foreground font-semibold">
                          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span><strong>{p.maxInstances}</strong> {p.maxInstances === 1 ? "Linha WhatsApp" : "Linhas WhatsApp"}</span>
                        </div>

                        <div className="flex items-center gap-2 text-foreground">
                          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span><strong>{p.maxConcurrentCalls}</strong> chamadas simultâneas por linha</span>
                        </div>

                        <div className="flex items-center gap-2 text-foreground">
                          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>Softphone no Navegador (WebRTC)</span>
                        </div>

                        <div className="flex items-center gap-2 text-foreground">
                          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>Agente de Voz IA (OpenAI / Gemini / Groq)</span>
                        </div>

                        <div className="flex items-center gap-2 text-foreground">
                          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>Gravação & Transcrição Automática</span>
                        </div>

                        <div className="flex items-center gap-2 text-foreground">
                          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>API REST & Webhooks para CRM</span>
                        </div>

                        {p.trialDays > 0 ? (
                          <div className="flex items-center gap-2 text-amber-600 font-medium">
                            <Sparkles className="h-4 w-4 shrink-0" />
                            <span>{p.trialDays} dias de teste sem compromisso</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                            <span>Sem limite de dias de expiração</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-6">
                      <Button
                        onClick={() => navigateTo("/register")}
                        className={`w-full rounded-xl py-5 text-xs font-semibold cursor-pointer shadow-sm ${
                          isPro
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : "bg-muted hover:bg-muted/80 text-foreground"
                        }`}
                      >
                        {p.priceCents === 0 ? "Criar Conta Gratuita" : "Contratar Este Plano"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* FAQ SECTION */}
      <section id="faq" className="py-20 border-t border-border/40 bg-muted/10">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Perguntas Frequentes
            </h2>
            <p className="text-xs text-muted-foreground">
              Tire suas principais dúvidas sobre o funcionamento do AtendiCalls.
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = activeFaq === idx;
              return (
                <div
                  key={idx}
                  onClick={() => setActiveFaq(isOpen ? null : idx)}
                  className="rounded-2xl border bg-card p-4 transition-colors cursor-pointer hover:border-emerald-500/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs sm:text-sm font-semibold text-foreground">
                      {faq.q}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${isOpen ? "rotate-180 text-emerald-600" : ""}`} />
                  </div>
                  {isOpen && (
                    <p className="mt-3 text-xs text-muted-foreground leading-relaxed pt-2 border-t border-border/40">
                      {faq.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FINAL CALL TO ACTION */}
      <section className="py-20 border-t border-border/40 bg-gradient-to-b from-background to-emerald-500/5 text-center">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Pronto para modernizar o atendimento por voz da sua empresa?
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Crie sua conta em 30 segundos, conecte seu número WhatsApp e comece a testar gratuitamente agora mesmo.
          </p>
          <div className="pt-2">
            <Button
              size="lg"
              onClick={() => navigateTo("/register")}
              className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-8 py-6 text-sm shadow-xl shadow-emerald-600/20 gap-2 cursor-pointer transition-all hover:scale-[1.02]"
            >
              Criar Minha Conta Gratuita Agora <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border/40 py-8 bg-background text-xs text-muted-foreground">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">AtendiCalls</span>
            <span>— Sistema de Telefonia VoIP & Softphone WhatsApp</span>
          </div>

          <div className="flex items-center gap-6">
            <a href="#funcionalidades" className="hover:text-foreground">Recursos</a>
            <a href="#planos" className="hover:text-foreground">Planos</a>
            <span onClick={() => navigateTo("/login")} className="hover:text-foreground cursor-pointer">Login</span>
            <span onClick={() => navigateTo("/register")} className="hover:text-foreground cursor-pointer">Cadastro</span>
          </div>

          <div>
            © {new Date().getFullYear()} AtendiCalls. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
};
