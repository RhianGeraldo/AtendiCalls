import { useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/layout/AppShell";
import { type Tab } from "@/components/layout/Sidebar";
import { CallsPage } from "@/pages/CallsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { AccountsPage } from "@/pages/AccountsPage";
import { UsersPage } from "@/pages/UsersPage";
import { LoginPage } from "@/pages/LoginPage";
import { PhoneDialerModal } from "@/components/domain/call/PhoneDialerModal";
import { IncomingCallModal } from "@/components/domain/call/IncomingCallModal";
import { ensureSessionsWired, useSessions } from "@/stores/sessions";
import { ensureCallsWired } from "@/stores/calls";
import { useTheme } from "@/stores/theme";
import { useAuth } from "@/stores/auth";

export const App = () => {
  const theme = useTheme((s) => s.theme);
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const activeId = useSessions((s) => s.activeId);
  
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  useEffect(() => {
    if (token) {
      ensureSessionsWired();
      ensureCallsWired();
    }
  }, [token]);

  if (!token || !user) {
    return (
      <>
        <LoginPage />
        <Toaster theme={theme} position="top-right" richColors closeButton />
      </>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === "dashboard" && <DashboardPage />}
        {activeTab === "calls" && <CallsPage sid={activeId || ""} />}
        {activeTab === "accounts" && <AccountsPage />}
        {activeTab === "users" && <UsersPage />}
      </AppShell>
      <PhoneDialerModal />
      <IncomingCallModal />
      <Toaster theme={theme} position="top-right" richColors closeButton />
    </TooltipProvider>
  );
};
