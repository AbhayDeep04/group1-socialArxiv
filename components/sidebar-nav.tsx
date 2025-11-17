"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Home, BookMarked, User, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function SidebarNav() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const items = [
    { href: "/library", label: "Library", icon: BookMarked },
    { href: "/profile", label: "Profile", icon: User },
  ];

  return (
    <aside className="w-14 shrink-0 border-r bg-background">
      <TooltipProvider delayDuration={150}>
        <nav className="flex h-svh flex-col items-center py-3">
          <div className="flex flex-col items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/">
                  <Button variant="ghost" size="icon" className="rounded-lg">
                    <Home className="h-5 w-5" />
                    <span className="sr-only">Home</span>
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Home</TooltipContent>
            </Tooltip>
            <div className="my-1 h-px w-8 bg-border" />

            {items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Tooltip key={href}>
                  <TooltipTrigger asChild>
                    <Link href={href}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "rounded-lg",
                          active && "bg-accent text-accent-foreground"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="sr-only">{label}</span>
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              );
            })}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-lg"
                  onClick={() => setTheme(isDark ? "light" : "dark")}
                >
                  {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  <span className="sr-only">Toggle theme</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Toggle theme</TooltipContent>
            </Tooltip>
          </div>
        </nav>
      </TooltipProvider>
    </aside>
  );
}
