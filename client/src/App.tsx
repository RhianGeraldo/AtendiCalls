import { useEffect, useState, useCallback } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/layout/AppShell";
import { type Tab } from "@/components/layout/Sidebar";
import { CallsPage } from "@/pages/CallsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { AccountsPage } from "@/pages/AccountsPage";
import { AIAgentPage } from "@/pages/AIAgentPage";
import { UsersPage } from "@/pages/UsersPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { ContactsPage } from "@/pages/ContactsPage";
import { CampaignsPage } from "@/pages/CampaignsPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { LandingPage } from "@/pages/LandingPage";
import { ApiDocsPage } from "@/pages/ApiDocsPage";
import { PhoneDialerModal } from "@/components/domain/call/PhoneDialerModal";
import { CampaignRunnerModal } from "@/components/domain/campaign/CampaignRunnerModal";
import { ensureSessionsWired } from "@/stores/sessions";
import { ensureCallsWired } from "@/stores/calls";
import { useTheme } from "@/stores/theme";
import { useAuth } from "@/stores/auth";

const TAB_ROUTES: Record<string, Tab> = {
  "": "dashboard",
  dashboard: "dashboard",
  calls: "calls",
  "ai-agent": "ai-agent",
  contacts: "contacts",
  campaigns: "campaigns",
  reports: "reports",
  accounts: "accounts",
  "api-docs": "api-docs",
  users: "users",
};

const getTabFromPath = (): Tab => {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, "");
  return TAB_ROUTES[path] || "dashboard";
};

export const App = () => {
  const theme = useTheme((s) => s.theme);
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const checkAuth = useAuth((s) => s.checkAuth);

  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [activeTab, setActiveTab] = useState<Tab>(getTabFromPath);

  // Validate session against server in background on app load
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Connect active session and calls listeners when authenticated
  useEffect(() => {
    if (token) {
      ensureSessionsWired();
      ensureCallsWired();
    }
  }, [token]);

  // Handle browser back/forward and path updates
  useEffect(() => {
    const onLocationChange = () => {
      const path = window.location.pathname;
      setCurrentPath(path);
      if (path !== "/login" && path !== "/register" && path !== "/" && path !== "/landing") {
        setActiveTab(getTabFromPath());
      }
    };

    window.addEventListener("popstate", onLocationChange);
    return () => window.removeEventListener("popstate", onLocationChange);
  }, []);

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    const targetPath = tab === "dashboard" ? "/" : `/${tab}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, "", targetPath);
      setCurrentPath(targetPath);
    }
  }, []);

  // Authentication & Route protection
  const isAuthenticated = Boolean(token && user);

  useEffect(() => {
    const path = window.location.pathname;
    if (!isAuthenticated) {
      // Unauthenticated users can view /, /landing, /login, /register
      if (path !== "/" && path !== "/landing" && path !== "/login" && path !== "/register") {
        window.history.replaceState({}, "", "/login");
        setCurrentPath("/login");
      }
    } else {
      if (path === "/login" || path === "/register") {
        window.history.replaceState({}, "", "/");
        setCurrentPath("/");
        setActiveTab("dashboard");
      }
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    if (currentPath === "/register") {
      return (
        <>
          <RegisterPage
            onSuccess={() => {
              window.history.pushState({}, "", "/");
              setCurrentPath("/");
              setActiveTab("dashboard");
            }}
          />
          <Toaster theme={theme} position="top-right" richColors closeButton />
        </>
      );
    }

    if (currentPath === "/login") {
      return (
        <>
          <LoginPage
            onSuccess={() => {
              window.history.pushState({}, "", "/");
              setCurrentPath("/");
              setActiveTab("dashboard");
            }}
          />
          <Toaster theme={theme} position="top-right" richColors closeButton />
        </>
      );
    }

    // Default for unauthenticated visitors is the high-conversion sales landing page
    return (
      <>
        <LandingPage />
        <Toaster theme={theme} position="top-right" richColors closeButton />
      </>
    );
  }

  // Authenticated user explicitly viewing landing page
  if (currentPath === "/landing") {
    return (
      <>
        <LandingPage />
        <Toaster theme={theme} position="top-right" richColors closeButton />
      </>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell activeTab={activeTab} onTabChange={handleTabChange}>
        {activeTab === "dashboard" && <DashboardPage />}
        {activeTab === "calls" && <CallsPage />}
        {activeTab === "ai-agent" && <AIAgentPage />}
        {activeTab === "contacts" && <ContactsPage />}
        {activeTab === "campaigns" && <CampaignsPage />}
        {activeTab === "reports" && <ReportsPage />}
        {activeTab === "accounts" && <AccountsPage />}
        {activeTab === "api-docs" && <ApiDocsPage />}
        {activeTab === "users" && <UsersPage />}
      </AppShell>
      <PhoneDialerModal />
      <CampaignRunnerModal />
      <Toaster theme={theme} position="top-right" richColors closeButton />
    </TooltipProvider>
  );
};
