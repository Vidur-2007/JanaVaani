import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/design/ui/button';

interface Props {
  children: ReactNode;
  /** Changing this value resets the boundary (we pass the pathname). */
  resetKey?: string;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}
interface State {
  error: Error | null;
}

class Boundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) return this.props.fallback?.(this.state.error, this.reset) ?? <ErrorScreen error={this.state.error} onReset={this.reset} />;
    return this.props.children;
  }
}

export function ErrorScreen({ error, onReset }: { error: Error; onReset?: () => void }) {
  const { t } = useTranslation('common');
  return (
    <div className="grid min-h-[60dvh] place-items-center p-6" role="alert" data-testid="error-boundary">
      <div className="max-w-md space-y-4 text-center">
        <div className="bg-danger/12 mx-auto grid size-14 place-items-center rounded-2xl">
          <AlertTriangle className="text-danger size-7" aria-hidden />
        </div>
        <h1 className="font-display text-xl font-semibold">{t('errors.boundary_title')}</h1>
        <p className="text-muted-foreground text-sm">{t('errors.boundary_body')}</p>
        {import.meta.env.DEV && <pre className="bg-surface-2 overflow-auto rounded-lg p-3 text-start text-xs">{error.message}</pre>}
        <div className="flex justify-center gap-2">
          {onReset && (
            <Button variant="outline" onClick={onReset} className="touch-target">
              <RotateCw className="size-4" aria-hidden />
              {t('actions.retry')}
            </Button>
          )}
          <Button onClick={() => window.location.reload()} className="touch-target">
            {t('actions.reload')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Error boundary that resets on navigation. */
export function ErrorBoundary({ children, fallback }: Omit<Props, 'resetKey'>) {
  const { pathname } = useLocation();
  return (
    <Boundary resetKey={pathname} fallback={fallback}>
      {children}
    </Boundary>
  );
}

/** Top-level boundary for use outside the router (no reset-on-navigate). */
export const RootErrorBoundary = Boundary;
