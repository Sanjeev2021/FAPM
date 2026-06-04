import { useTranslation } from 'react-i18next';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';

interface SiteHeaderProps {
  conversationTitle?: string;
}

export function SiteHeader({ conversationTitle }: SiteHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="relative flex shrink-0 items-center gap-2 border-b bg-card px-4 sticky top-0 z-50 h-14">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="font-light">
              {conversationTitle || t('chat.siteHeader.newConversation')}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#7C8CF8] via-[#C084FC] to-[#F59AC0]" />
    </header>
  );
}
