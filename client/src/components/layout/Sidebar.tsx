import { LayoutDashboard, Phone, Smartphone, Users, LogOut, BarChart3, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

export type Tab = "dashboard" | "calls" | "reports" | "accounts" | "users";

interface SidebarProps {
  activeTab: Tab;
  onNavigate: (tab: Tab) => void;
  collapsed?: boolean;
}

export const Sidebar = ({ activeTab, onNavigate, collapsed = false }: SidebarProps) => {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const isAdmin = user?.role === "admin";

  const tabs = [
    { id: "dashboard" as Tab, label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5 shrink-0" /> },
    { id: "calls" as Tab, label: "Ligações", icon: <Phone className="h-5 w-5 shrink-0" /> },
    { id: "reports" as Tab, label: "Relatórios", icon: <BarChart3 className="h-5 w-5 shrink-0" /> },
    { id: "accounts" as Tab, label: "Contas WhatsApp", icon: <Smartphone className="h-5 w-5 shrink-0" /> },
    ...(isAdmin ? [{ id: "users" as Tab, label: "Usuários", icon: <Users className="h-5 w-5 shrink-0" /> }] : []),
  ];

  return (
    <div className="flex h-full flex-col justify-between p-3 select-none">
      <div className="space-y-4">
        {/* Top Logo Brand */}
        <div className={cn("flex items-center gap-3 px-2 py-1", collapsed && "justify-center px-0")}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
            <PhoneCall className="h-5 w-5" />
          </span>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-base font-extrabold tracking-tight text-foreground leading-tight">AtendiCalls</span>
              <span className="text-[10px] font-medium text-emerald-500 uppercase tracking-widest">VoIP & Telefonia</span>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              title={collapsed ? tab.label : undefined}
              onClick={() => onNavigate(tab.id)}
              className={cn(
                "flex cursor-pointer items-center rounded-xl text-sm font-medium transition-all duration-200",
                collapsed ? "justify-center h-11 w-full" : "gap-3 px-3.5 py-2.5",
                activeTab === tab.id
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {tab.icon}
              {!collapsed && <span className="truncate">{tab.label}</span>}
            </div>
          ))}
        </nav>
      </div>

      {/* Footer User Profile */}
      <div className="mt-auto border-t border-border/60 pt-3 space-y-2">
        <div className={cn("flex items-center gap-3 px-1", collapsed && "justify-center px-0")}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs border border-emerald-500/20 shadow-xs">
            {user?.name?.slice(0, 2).toUpperCase() || "US"}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground leading-tight">{user?.name}</p>
              <p className="truncate text-[10px] text-muted-foreground mt-0.5">{user?.email}</p>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          title={collapsed ? "Sair do Sistema" : undefined}
          className={cn(
            "text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors",
            collapsed ? "h-9 w-full justify-center" : "w-full justify-start gap-3 h-9 text-xs"
          )}
          onClick={logout}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sair do Sistema</span>}
        </Button>
      </div>
    </div>
  );
};
