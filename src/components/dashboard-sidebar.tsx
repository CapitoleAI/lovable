import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Plus } from "lucide-react";
import logoAsset from "@/assets/capitoleai-logo.png.asset.json";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

type SiteItem = { id: string; name: string; url: string };

interface DashboardSidebarProps {
  sites: SiteItem[];
  onCreate: () => void;
  email: string | null;
}

export function DashboardSidebar({ sites, onCreate, email }: DashboardSidebarProps) {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon" className="bg-white border-r">
      <SidebarHeader className="border-b border-sidebar-border bg-white">
        <div className="flex items-center px-2 py-4">
          <img
            src={logoAsset.url}
            alt="CapitoleAI"
            className="h-9 w-auto object-contain group-data-[collapsible=icon]:h-7"
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <div className="px-2 pb-2 pt-1">
              <Button
                onClick={onCreate}
                className="w-full justify-start gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                size="sm"
              >
                <Plus className="h-4 w-4" />
                <span className="group-data-[collapsible=icon]:hidden">Créer</span>
              </Button>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Sites</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sites.length === 0 && (
                <div className="px-3 py-2 text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
                  Aucun site pour le moment.
                </div>
              )}
              {sites.map((site) => (
                <SidebarMenuItem key={site.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={currentPath === site.url}
                    tooltip={site.name}
                  >
                    <Link to={site.url}>
                      <LayoutDashboard className="h-4 w-4" />
                      <span>{site.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {email && (
        <SidebarFooter className="border-t border-sidebar-border">
          <div className="truncate px-2 py-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
            {email}
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
