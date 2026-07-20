import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup,
  SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem,
  SidebarMenuButton, SidebarFooter,
} from 'colloquiz';
import { Home, BookOpen, BarChart3, Settings } from 'lucide-react';

export const AppNav = () => (
  <div className="h-[420px] w-64 overflow-hidden rounded-md border">
    <SidebarProvider style={{ ['--sidebar-width' as string]: '16rem' }}>
      <Sidebar collapsible="none" className="h-full">
        <SidebarHeader className="px-3 py-2 font-semibold">Colloquiz</SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menu</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem><SidebarMenuButton isActive><Home /> Home</SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton><BookOpen /> My quizzes</SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton><BarChart3 /> Stats</SidebarMenuButton></SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton><Settings /> Settings</SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>
  </div>
);
