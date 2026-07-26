import { LayoutDashboard, Phone, Smartphone, Users, LogOut, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

export type Tab = "dashboard" | "calls" | "reports" | "accounts" | "users";

interface SidebarProps {
  activeTab: Tab;
  onNavigate: (tab: Tab) => void;
}

export const Sidebar = ({ activeTab, onNavigate }: SidebarProps) => {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const isAdmin = user?.role === "admin";

  const tabs = [
    { id: "dashboard" as Tab, label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
    { id: "calls" as Tab, label: "Ligações", icon: <Phone className="h-5 w-5" /> },
    { id: "reports" as Tab, label: "Relatórios", icon: <BarChart3 className="h-5 w-5" /> },
    { id: "accounts" as Tab, label: "Contas WhatsApp", icon: <Smartphone className="h-5 w-5" /> },
    ...(isAdmin ? [{ id: "users" as Tab, label: "Usuários", icon: <Users className="h-5 w-5" /> }] : []),
  ];

  return (
    <div className="flex h-full flex-col justify-between p-3 select-none">
      <div className="space-y-2">
        <nav className="space-y-1">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              onClick={() => onNavigate(tab.id)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {tab.icon}
              {tab.label}
            </div>
          ))}
        </nav>
      </div>

      <div className="mt-auto border-t pt-4 px-2 space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold dark:bg-emerald-900/40 dark:text-emerald-400">
            {user?.name?.slice(0, 2).toUpperCase() || "US"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{user?.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive gap-3 rounded-xl h-11" onClick={logout}>
          <LogOut className="h-5 w-5" />
          Sair do Sistema
        </Button>
      </div>
    </div>
  );
};
