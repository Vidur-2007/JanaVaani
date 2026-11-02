// Login (Spec A §5.2): Citizen (magic link · guest) | Government (email + password), demo accounts panel,
// role-based redirect (citizen/guest → /app, officer/supervisor → /officer, admin → /admin).
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Building2, Landmark, Loader2, Mail, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import type { Role } from '@contracts/types';
import { DEMO_USERS } from '@mocks/data/people';
import { Button } from '@/design/ui/button';
import { Input } from '@/design/ui/input';
import { Label } from '@/design/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/design/ui/tabs';
import { PageTransition } from '@/design/components';
import { DEMO_MODE, errorMessage } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/useAuth';
import { homeForRole, type Profile } from '@/lib/auth/types';
import { usePrefs } from '@/lib/prefs/store';

const ROLE_ICON: Record<Role, typeof UserRound> = {
  citizen: UserRound,
  guest: UserRound,
  officer: Building2,
  supervisor: ShieldCheck,
  admin: Landmark,
};

export default function Login() {
  const { t } = useTranslation('citizen');
  const { t: tc } = useTranslation('common');
  const auth = useAuth();
  const onboarded = usePrefs((s) => s.onboarded);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState('');
  const [govEmail, setGovEmail] = useState('');
  const [password, setPassword] = useState('');

  const done = (p: Profile | null) => {
    if (!p) {
      setSent(true);
      toast.success(t('login.magic_sent'));
      return;
    }
    const next = params.get('next');
    const target = next && next.startsWith('/') ? next : homeForRole(p.role);
    // First-run citizens go through onboarding, then on to their destination.
    const citizen = p.role === 'citizen' || p.role === 'guest';
    navigate(citizen && !onboarded ? `/onboarding?next=${encodeURIComponent(target)}` : target, { replace: true });
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
  const spinner = (key: string) => busy === key && <Loader2 className="size-4 animate-spin" aria-hidden />;

  const citizens = DEMO_USERS.filter((u) => u.role === 'citizen');
  const gov = DEMO_USERS.filter((u) => u.role !== 'citizen');

  return (
    <PageTransition className="space-y-6">
      <div className="bg-surface overflow-hidden rounded-[var(--radius-xl)] border md:grid md:grid-cols-[1fr_1.2fr]">
        {/* Brand panel */}
        <div
          className="relative hidden flex-col justify-between gap-8 p-8 text-white md:flex"
          style={{
            background:
              'radial-gradient(70% 60% at 80% 20%, color-mix(in oklab, #FF7A1A 45%, transparent), transparent 70%), radial-gradient(60% 50% at 10% 90%, color-mix(in oklab, #22D3C5 35%, transparent), transparent 70%), #070A12',
          }}
        >
          <p className="font-mono text-xs tracking-[0.2em] text-white/70 uppercase">JanaVaani</p>
          <div className="space-y-3">
            <p className="font-display text-3xl leading-tight font-semibold">{tc('brand.tagline')}</p>
            <p className="text-sm text-white/70">{t('login.brand_body')}</p>
          </div>
          {/* i18n-ignore: each language's own name, shown in every UI language */}
          <p className="text-xs text-white/60">తెలుగు · हिन्दी · اردو · English</p>
        </div>

        {/* Forms */}
        <div className="space-y-5 p-5 md:p-8">
          <h1 className="font-display text-2xl font-semibold">{t('login.title')}</h1>
          <Tabs defaultValue="citizen">
            <TabsList className="grid h-11 w-full grid-cols-2">
              <TabsTrigger value="citizen">{t('login.tab_citizen')}</TabsTrigger>
              <TabsTrigger value="gov">{t('login.tab_gov')}</TabsTrigger>
            </TabsList>
            <TabsContent value="citizen" className="space-y-4 pt-4">
              {sent ? (
                <div className="bg-success/10 flex items-start gap-3 rounded-[var(--radius-lg)] p-4" role="status">
                  <Mail className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
                  <p className="text-sm">{t('login.magic_sent')}</p>
                </div>
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    run('magic', () => auth.signInWithMagicLink(email));
                  }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="email">{t('login.email')}</Label>
                    <Input id="email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
                  </div>
                  <Button type="submit" className="touch-target h-12 w-full" disabled={!!busy}>
                    {spinner('magic')}
                    {t('login.magic_link')}
                  </Button>
                </form>
              )}
              <div className="text-muted-foreground flex items-center gap-3 text-xs">
                <span className="bg-border h-px flex-1" />
                {t('login.or')}
                <span className="bg-border h-px flex-1" />
              </div>
              <Button variant="outline" className="touch-target h-12 w-full" disabled={!!busy} onClick={() => run('guest', auth.signInAsGuest)} data-testid="guest-login">
                {spinner('guest') || <UserRound className="size-4" aria-hidden />}
                {tc('auth.continue_as_guest')}
              </Button>
              <p className="text-muted-foreground text-xs">{t('login.guest_hint')}</p>
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
                  <Input id="gov-email" type="email" required autoComplete="username" value={govEmail} onChange={(e) => setGovEmail(e.target.value)} className="h-12" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">{t('login.password')}</Label>
                  <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" />
                </div>
                <Button type="submit" className="touch-target h-12 w-full" disabled={!!busy}>
                  {spinner('password')}
                  {t('login.sign_in')}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {DEMO_MODE && (
        <section className="space-y-4" aria-labelledby="demo-title">
          <div>
            <h2 id="demo-title" className="font-display text-lg font-semibold">
              {t('login.demo_title')}
            </h2>
            <p className="text-muted-foreground text-sm">{t('login.demo_hint')}</p>
          </div>
          {(
            [
              { key: 'citizens', icon: UsersRound, users: citizens },
              { key: 'government', icon: Landmark, users: gov },
            ] as const
          ).map((group) => (
            <div key={group.key} className="space-y-2">
              <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
                <group.icon className="size-4" aria-hidden />
                {t(`login.demo_${group.key}`)}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.users.map((u) => {
                  const Icon = ROLE_ICON[u.role];
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className="bg-surface hover:border-primary/50 touch-target flex items-center gap-3 rounded-[var(--radius-lg)] border p-3 text-start transition-colors disabled:opacity-60"
                      disabled={!!busy}
                      onClick={() => run(u.id, () => auth.demoLogin(u.email))}
                      data-testid={`demo-${u.role}-${u.id}`}
                    >
                      <span className="bg-surface-2 grid size-10 shrink-0 place-items-center rounded-full">
                        {busy === u.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Icon className="size-5" aria-hidden />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {u.name} <span className="text-muted-foreground font-normal">· {tc(`roles.${u.role}`)}</span>
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">{u.persona_en}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}
    </PageTransition>
  );
}
