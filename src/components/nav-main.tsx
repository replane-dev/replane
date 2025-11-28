'use client';

import {type LucideIcon, ChevronRight} from 'lucide-react';
import {usePathname} from 'next/navigation';

import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import Link from 'next/link';

export type NavMainItem = {
  name: string;
  url?: string;
  icon: LucideIcon;
  items?: Array<{
    name: string;
    url: string;
  }>;
};

export function NavMain({items}: {items: NavMainItem[]}) {
  const pathname = usePathname();

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarMenu>
        {items.map(item => {
          // If item has sub-items, render as collapsible
          if (item.items && item.items.length > 0) {
            const isAnySubItemActive = item.items.some(
              subItem => pathname === subItem.url || pathname.startsWith(`${subItem.url}/`),
            );

            return (
              <Collapsible key={item.name} asChild defaultOpen={isAnySubItemActive}>
                <SidebarMenuItem className="group/collapsible">
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton>
                      <item.icon />
                      <span>{item.name}</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items.map(subItem => {
                        const isActive =
                          pathname === subItem.url || pathname.startsWith(`${subItem.url}/`);
                        return (
                          <SidebarMenuSubItem key={subItem.name}>
                            <SidebarMenuSubButton asChild isActive={isActive}>
                              <Link href={subItem.url}>
                                <span>{subItem.name}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            );
          }

          // Regular item without sub-items
          const isActive = pathname === item.url || pathname.startsWith(`${item.url}/`);
          return (
            <SidebarMenuItem key={item.name}>
              <SidebarMenuButton asChild isActive={isActive}>
                <Link href={item.url!}>
                  <item.icon />
                  <span>{item.name}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
