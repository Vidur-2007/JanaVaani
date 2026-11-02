// P0 login: Citizen (magic link · guest) | Government (email + password) + demo accounts panel. P1 polishes (Spec A §5.2).
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Loader2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { DEMO_USERS } from '@mocks/data/people';
import { Button } from '@/design/ui/button';
import { Input } from '@/design/ui/input';
import { Label } from '@/design/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/design/ui/tabs';
import { PageTransition } from '@/design/components';
import { DEMO_MODE, errorMessage } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/useAuth';
import { homeForRole, type Profile } from '@/lib/auth/types';

export default function Login() {
  const { t } = useTranslation('citizen');
  const { t: tc } = useTranslation('common');
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [govEmail, setGovEmail] = useState('');
  const [password, setPassword] = useState('');

  const done = (p: Profile | null) => {
    if (!p) {
      toast.success(t('login.magic_sent'));
      return;
    }
    const next = params.get('next');
    navigate(next && next.startsWith('/') ? next : homeForRole(p.role), { replace: true });
  };
  const run = async (key: string, fn: () => Promise<Profile | null>) => {
    setBusy(key);
    try {
      done(await fn());
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageTransition className="mx-auto max-w-md space-y-6">
      <h1 className="font-display text-2xl font-semibold">{t('login.title')}</h1>
      <Tabs defaultValue="citizen">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="citizen">{t('login.tab_citizen')}</TabsTrigger>
          <TabsTrigger value="gov">{t('login.tab_gov')}</TabsTrigger>
        </TabsList>
        <TabsContent value="citizen" className="space-y-4 pt-4">
          <form
            className="space-y-3"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              run('magic', () => auth.signInWithMagicLink(email));
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('login.email')}</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
            </div>
            <Button type="submit" className="touch-target w-full" disabled={!!busy}>
              {busy === 'magic' && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t('login.magic_link')}
            </Button>
          </form>
          <p className="text-muted-foreground text-center text-xs">{t('login.or')}</p>
          <Button
            variant="outline"
            className="touch-target w-full"
            disabled={!!busy}
            onClick={() => run('guest', auth.signInAsGuest)}
            data-testid="guest-login"
          >
            {busy === 'guest' ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <UserRound className="size-4" aria-hidden />
            )}
            {tc('auth.continue_as_guest')}
          </Button>
        </TabsContent>
        <TabsContent value="gov" className="pt-4">
          <form
            className="space-y-3"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              run('password', () => auth.signInWithPassword(govEmail, password));
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="gov-email">{t('login.email')}</Label>
              <Input
                id="gov-email"
                type="email"
                required
                autoComplete="username"
                value={govEmail}
                onChange={(e) => setGovEmail(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t('login.password')}</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
              />
            </div>
            <Button type="submit" className="touch-target w-full" disabled={!!busy}>
              {busy === 'password' && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t('login.sign_in')}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      {DEMO_MODE && (
        <section
          className="bg-surface space-y-3 rounded-[var(--radius-lg)] border p-4"
          aria-labelledby="demo-title"
        >
          <div>
            <h2 id="demo-title" className="font-display font-semibold">
              {t('login.demo_title')}
            </h2>
            <p className="text-muted-foreground text-sm">{t('login.demo_hint')}</p>
          </div>
          <div className="grid gap-2">
            {DEMO_USERS.map((u) => (
              <Button
                key={u.id}
                variant="secondary"
                className="touch-target h-auto justify-start py-2 text-start"
                disabled={!!busy}
                onClick={() => run(u.id, () => auth.demoLogin(u.email))}
                data-testid={`demo-${u.role}-${u.id}`}
              >
                <span className="flex flex-col items-start">
                  <span className="font-medium">
                    {u.name}{' '}
                    <span className="text-muted-foreground font-normal">· {tc(`roles.${u.role}`)}</span>
                  </span>
                  <span className="text-muted-foreground text-xs font-normal">{u.persona_en}</span>
                </span>
              </Button>
            ))}
          </div>
        </section>
      )}
    </PageTransition>
  );
}
