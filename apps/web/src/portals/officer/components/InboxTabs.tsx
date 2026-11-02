// Inbox and Incidents are sibling tabs with their own URLs.
import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function InboxTabs() {
  const { t } = useTranslation('gov');
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn(
      'touch-target inline-flex items-center border-b-2 px-3 text-sm transition-colors md:min-h-9',
      isActive ? 'border-primary text-text font-medium' : 'text-muted-foreground hover:text-text border-transparent',
    );
  return (
    <nav aria-label={t('inbox.views')} className="flex gap-1 border-b">
      <NavLink to="/officer" end className={tab}>
        {t('nav.inbox')}
      </NavLink>
      <NavLink to="/officer/incidents" className={tab}>
        {t('nav.incidents')}
      </NavLink>
    </nav>
  );
}
