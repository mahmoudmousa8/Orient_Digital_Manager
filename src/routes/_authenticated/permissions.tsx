import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/permissions")({
  ssr: false,
  component: lazyRouteComponent(() => import("@/components/permissions-page"), "PermissionsPage"),
});
