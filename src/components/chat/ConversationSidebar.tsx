import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, MessageSquare } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  useConversations,
  useRenameConversation,
  useDeleteConversation,
} from './hooks/useConversations';
import { ConversationItem } from './ConversationItem';
import { NavUser } from './nav-user';
import { useOrg } from '@/contexts/OrgContext';

interface ConversationSidebarProps {
  conversationId: string | undefined;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

export function ConversationSidebar({
  conversationId,
  onSelectConversation,
  onNewConversation,
}: ConversationSidebarProps) {
  const { t } = useTranslation();
  const { data: conversations, isLoading } = useConversations();
  const renameMutation = useRenameConversation();
  const deleteMutation = useDeleteConversation();
  const { organization } = useOrg();

  const orgName = organization?.name ?? 'Organization';
  const orgLogoUrl = organization?.logo_url ?? null;
  const orgInitial = orgName.charAt(0).toUpperCase();
  const orgPlan = 'Pro'; // TODO: derive from org subscription

  const handleRename = useCallback(
    (id: string, title: string) => renameMutation.mutate({ id, title }),
    [renameMutation]
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate(id);
      if (id === conversationId) {
        onNewConversation();
      }
    },
    [deleteMutation, conversationId, onNewConversation]
  );

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                {orgLogoUrl ? (
                  <img src={orgLogoUrl} alt={orgName} className="h-8 w-auto object-contain" />
                ) : (
                  <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <span className="text-xs font-semibold">{orgInitial}</span>
                  </div>
                )}
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{orgName}</span>
                  <span className="truncate text-xs">{orgPlan}</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={onNewConversation}
        >
          <Plus className="size-4" />
          {t('chat.sidebar.newBrief')}
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {isLoading ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t('chat.sidebar.loading')}
              </div>
            ) : !conversations || conversations.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 opacity-40" />
                <div>
                  <p className="text-sm font-medium">{t('chat.sidebar.noConversations')}</p>
                  <p className="text-xs mt-1">{t('chat.sidebar.noConversationsDesc')}</p>
                </div>
              </div>
            ) : (
              <SidebarMenu>
                {conversations.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isActive={conv.id === conversationId}
                    onSelect={onSelectConversation}
                    onRename={handleRename}
                    onDelete={handleDelete}
                  />
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
