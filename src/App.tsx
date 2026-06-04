import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { OrgProvider, useOrg } from "@/contexts/OrgContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Landing from "./pages/Landing";
import ChatPage from "./pages/ChatPage";
import Auth from "./pages/Auth";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Legal from "./pages/Legal";
import Contact from "./pages/Contact";
import AdminDashboard from "./pages/admin/AdminDashboard";
import OrgDetail from "./pages/admin/OrgDetail";

const queryClient = new QueryClient();

function AuthAwareHome() {
  const { user, loading } = useAuth();
  const { isSuperAdmin, orgId, loading: orgLoading } = useOrg();
  if (loading || orgLoading) return null;
  if (!user) return <Landing />;
  // Super admin without an org goes straight to admin dashboard
  if (isSuperAdmin && !orgId) {
    return <AdminDashboard />;
  }
  return <ChatPage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <OrgProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<AuthAwareHome />} />
              <Route
                path="/chat"
                element={
                  <ProtectedRoute blockSuperAdmin>
                    <ChatPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chat/:conversationId"
                element={
                  <ProtectedRoute blockSuperAdmin>
                    <ChatPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/auth" element={<Auth />} />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute blockSuperAdmin>
                    <Settings />
                  </ProtectedRoute>
                }
              />
              {/* Super Admin Routes */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requiredRole="super_admin">
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/org/:orgId"
                element={
                  <ProtectedRoute requiredRole="super_admin">
                    <OrgDetail />
                  </ProtectedRoute>
                }
              />
              {/* Public pages */}
              <Route path="/legal" element={<Legal />} />
              <Route path="/contact" element={<Contact />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </OrgProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
