import { useState, type ReactNode } from "react";
import { Menu, PhoneCall, PhoneForwarded } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar, type Tab } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { useDialerStore } from "@/stores/dialer";

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
  const openDialer = useDialerStore((s) => s.openDialer);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden" aria-label="Menu">
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
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow">
              <PhoneCall className="h-4 w-4" />
            </span>
            <span className="text-lg font-bold tracking-tight">WaCalls</span>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-64 shrink-0 border-r bg-muted/20 md:block">
          <Sidebar activeTab={activeTab} onNavigate={onTabChange} />
        </aside>
        <main className="flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-6 relative">
          {children}

          {/* Floating Action Button - Celular Virtual */}
          <div
            onClick={() => openDialer()}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold text-xs px-4 py-3 shadow-xl hover:shadow-emerald-500/30 transition-all cursor-pointer border border-emerald-400/30 group"
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
