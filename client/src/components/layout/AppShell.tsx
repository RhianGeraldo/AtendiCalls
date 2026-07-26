import { useState, type ReactNode } from "react";
import { Menu, PhoneForwarded, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar, type Tab } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { useDialerStore } from "@/stores/dialer";
import { cn } from "@/lib/utils";

const PAGE_TITLES: Record<Tab, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Dashboard de Desempenho",
    subtitle: "Visão geral de métricas, ligações e status em tempo real.",
  },
  calls: {
    title: "Ligações & Celular Virtual",
    subtitle: "Realize e receba chamadas de voz diretamente pelo navegador.",
  },
  reports: {
    title: "Relatórios & Analytics de Chamadas",
    subtitle: "Acompanhe o desempenho, volume de atendimento, duração e histórico detalhado das ligações.",
  },
  accounts: {
    title: "Contas WhatsApp",
    subtitle: "Gerencie instâncias conectadas e pareamento via QR Code.",
  },
  users: {
    title: "Gestão de Usuários",
    subtitle: "Administre usuários e permissões do sistema.",
  },
};

export const AppShell = ({
  children,
  activeTab,
  onTabChange,
}: {
  children: ReactNode;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const openDialer = useDialerStore((s) => s.openDialer);

  const currentTitle = PAGE_TITLES[activeTab] || { title: "AtendiCalls", subtitle: "" };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* --- DESKTOP COLLAPSIBLE ASIDE (FULL HEIGHT TOP-TO-BOTTOM) --- */}
      <aside
        className={cn(
          "relative hidden md:flex flex-col h-full border-r border-border bg-muted/20 transition-all duration-300 z-20 shrink-0 select-none",
          collapsed ? "w-20" : "w-64"
        )}
      >
        <Sidebar
          activeTab={activeTab}
          onNavigate={onTabChange}
          collapsed={collapsed}
        />

        {/* Round Toggle Arrow Button Sitting Right On The Border Edge Line */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3.5 top-6 z-30 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md hover:bg-accent hover:text-accent-foreground transition-all cursor-pointer"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </aside>

      {/* --- RIGHT CONTAINER: HEADER + MAIN CONTENT --- */}
      <div className="flex flex-1 flex-col h-full min-w-0 overflow-hidden">
        {/* TOP HEADER (POSITIONED AFTER ASIDE) */}
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between border-b border-border/80 bg-background/90 px-4 sm:px-6 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Sheet Trigger */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden shrink-0" aria-label="Menu">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">Navegação Principal</SheetTitle>
                <Sidebar
                  activeTab={activeTab}
                  onNavigate={(t) => {
                    onTabChange(t);
                    setMobileOpen(false);
                  }}
                />
              </SheetContent>
            </Sheet>

            {/* Page Title & Subtitle in Header */}
            <div className="flex flex-col min-w-0">
              <h1 className="text-lg font-bold tracking-tight text-foreground leading-tight truncate">
                {currentTitle.title}
              </h1>
              <p className="text-xs text-muted-foreground truncate hidden sm:block">
                {currentTitle.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <ThemeToggle />
          </div>
        </header>

        {/* MAIN CONTENT CONTAINER */}
        <main className="flex-1 overflow-y-auto bg-background p-6 relative">
          {children}

          {/* Floating Action Button - Celular Virtual */}
          <div
            onClick={() => openDialer()}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold text-xs px-4 py-3 shadow-xl hover:shadow-emerald-500/30 transition-all cursor-pointer border border-emerald-400/30 group select-none"
            title="Abrir Celular Virtual para ligar"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 group-hover:rotate-12 transition-transform">
              <PhoneForwarded className="h-3.5 w-3.5" />
            </div>
            Fazer Ligação
          </div>
        </main>
      </div>
    </div>
  );
};
