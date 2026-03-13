import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Activity,
  ChevronLeft,
  Cpu,
  HeartPulse,
  LayoutDashboard,
  Menu,
  Settings,
  Tags,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Devices', href: '/devices', icon: Cpu },
  { name: 'Tags', href: '/tags', icon: Tags },
  { name: 'System', href: '/system', icon: Activity },
  { name: 'Health', href: '/health', icon: HeartPulse },
];

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Derive page title from current route
  const currentNav = navigation.find((n) => location.pathname.startsWith(n.href));
  const pageTitle = currentNav?.name ?? 'NEXUS Edge';

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar - Desktop */}
        <aside
          className={cn(
            'hidden lg:flex flex-col border-r border-border/50 bg-card/50 transition-all duration-300 ease-in-out',
            collapsed ? 'w-16' : 'w-60'
          )}
        >
          {/* Logo */}
          <div className="flex h-14 items-center border-b border-border/50 px-4">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-delaware-red text-white font-bold text-sm">
                d<span className="text-delaware-dot-red">.</span>
              </div>
              {!collapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-sm tracking-tight truncate">NEXUS Edge</span>
                  <span className="text-[10px] text-muted-foreground -mt-0.5">delaware</span>
                </div>
              )}
            </div>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {navigation.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                    collapsed && 'justify-center px-2',
                    isActive
                      ? 'bg-primary/10 text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )
                }
                title={collapsed ? item.name : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.name}</span>}
              </NavLink>
            ))}
          </nav>

          {/* Collapse toggle */}
          <div className="border-t border-border/50 p-3">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all w-full',
                collapsed && 'justify-center px-2'
              )}
            >
              <ChevronLeft
                className={cn('h-4 w-4 shrink-0 transition-transform', collapsed && 'rotate-180')}
              />
              {!collapsed && <span>Collapse</span>}
            </button>
          </div>
        </aside>

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="fixed inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <div className="relative flex w-72 flex-col bg-card border-r shadow-xl">
              {/* Logo */}
              <div className="flex h-14 items-center border-b border-border/50 px-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-delaware-red text-white font-bold text-sm">
                    d<span className="text-delaware-dot-red">.</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm tracking-tight">NEXUS Edge</span>
                    <span className="text-[10px] text-muted-foreground -mt-0.5">delaware</span>
                  </div>
                </div>
              </div>

              {/* Nav */}
              <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                {navigation.map((item) => (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      )
                    }
                  >
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border/50 bg-card/30 backdrop-blur-sm px-4 lg:px-6">
            {/* Mobile menu */}
            <button
              className="lg:hidden -ml-1 p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Page title */}
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold">{pageTitle}</h1>
            </div>

            {/* Right side */}
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground mr-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>Connected</span>
                </div>
              </div>
              <button className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors">
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
