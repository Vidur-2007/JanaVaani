// Floating demo role switcher (VITE_DEMO_MODE=true). Switches the mock session or signs in to the demo account.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { UserRoundCog } from 'lucide-react';
import { toast } from 'sonner';
import { DEMO_USERS } from '@mocks/data/people';
import { DEMO_MODE, errorMessage } from '@/lib/api/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAuth } from './useAuth';
import { homeForRole } from './types';

export function DemoRoleSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation('common');
  const { profile, demoLogin, signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!DEMO_MODE) return null;

  const pick = async (who: string) => {
    setBusy(true);
    try {
      const p = await demoLogin(who);
      navigate(homeForRole(p.role));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          // Icon-only on small screens so it never covers page content.
          'glass fixed bottom-20 start-3 z-50 flex size-11 items-center justify-center gap-2 rounded-full text-xs font-medium opacity-80 shadow-lg hover:opacity-100 md:bottom-4 md:w-auto md:px-3 md:opacity-100',
          className,
        )}
        aria-label={t('demo.switch_role')}
        disabled={busy}
      >
        <UserRoundCog className="size-4" aria-hidden />
        <span className="hidden max-w-28 truncate md:inline">
          {profile ? t(`roles.${profile.role}`) : t('demo.signed_out')}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>{t('demo.accounts')}</DropdownMenuLabel>
        {DEMO_USERS.map((u) => (
          <DropdownMenuItem
            key={u.id}
            onSelect={() => pick(u.email)}
            className="flex flex-col items-start gap-0"
          >
            <span className="font-medium">{u.name}</span>
            <span className="text-muted-foreground text-xs">{u.persona_en}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => pick('guest')}>{t('auth.continue_as_guest')}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut();
            navigate('/login');
          }}
        >
          {t('auth.sign_out')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
