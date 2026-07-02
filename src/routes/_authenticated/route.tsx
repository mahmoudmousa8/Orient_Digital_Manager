import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();

  const isAdmin = roles.includes("admin");
  const isEmployee = roles.includes("employee") && !isAdmin;

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (!loading && user && isEmployee) {
      const allowedPaths = ["/channels", "/publishing"];
      if (!allowedPaths.includes(loc.pathname)) {
        navigate({ to: "/channels", replace: true });
      }
    }
  }, [loading, user, isEmployee, loc.pathname, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppShell roles={roles} email={user.email}>
      <Outlet />
    </AppShell>
  );
}
