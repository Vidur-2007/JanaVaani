// Spec A §8 stretch: share a complaint on WhatsApp via a plain wa.me link (free, no API, no account).
// The message carries the ticket ID, title and a link neighbours can open to add their support. It never
// includes the guest PIN, and private complaints can't be shared.
import { useTranslation } from 'react-i18next';
import { Share2 } from 'lucide-react';
import { Button } from '@/design/ui/button';
import { cn } from '@/lib/utils';

export function whatsappShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function ShareWhatsApp({
  id,
  title,
  isPrivate,
  className,
}: {
  id: string;
  title?: string;
  isPrivate?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('citizen');
  if (isPrivate) return null;
  // The tracker for non-owners shows only public-safe details plus "I'm affected too".
  const link = `${window.location.origin}/app/complaints/${encodeURIComponent(id)}`;
  const text = t('share.message', { id, title: title ?? '', link });
  return (
    <Button asChild variant="outline" className={cn('touch-target', className)}>
      <a href={whatsappShareUrl(text)} target="_blank" rel="noopener noreferrer" data-testid="share-whatsapp">
        <Share2 className="size-4" aria-hidden />
        {t('share.whatsapp')}
        <span className="sr-only"> {t('share.new_tab')}</span>
      </a>
    </Button>
  );
}
