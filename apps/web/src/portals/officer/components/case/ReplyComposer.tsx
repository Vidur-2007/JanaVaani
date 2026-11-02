// Reply composer (Spec C §5.2): intent → AI draft → editable English → citizen-language preview → send.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { DraftReply, Grievance, ReplyIntent } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { Label } from '@/design/ui/label';
import { Textarea } from '@/design/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/design/ui/toggle-group';
import { AIBadge, ListenButton } from '@/design/components';
import { errorMessage } from '@/lib/api/client';
import { api } from '@/lib/api/endpoints';
import { isRtl, LANGUAGE_NAMES } from '@/lib/i18n';
import { Panel } from '@/portals/gov-shared/components/Panel';
import { useCaseAction } from '../../hooks/useCaseAction';

const INTENTS: ReplyIntent[] = [
  'acknowledge',
  'request_info',
  'schedule_visit',
  'work_started',
  'delay_update',
  'resolved',
  'transfer',
];

export function ReplyComposer({ grievance: g }: { grievance: Grievance }) {
  const { t } = useTranslation('gov');
  const [intent, setIntent] = useState<ReplyIntent>('acknowledge');
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<DraftReply | null>(null);
  const language = LANGUAGE_NAMES[g.language]?.en ?? g.language;

  const generate = useMutation({
    mutationFn: () => api.draftReply(g.id, { intent }),
    onSuccess: (d) => {
      setDraft(d);
      setText(d.draft_en);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const send = useCaseAction(
    g.id,
    (text_en: string) => api.officerMessage(g.id, { text_en }),
    () => {
      setText('');
      setDraft(null);
      toast.success(t('reply.sent', { language }));
    },
  );
  const edited = !!draft && text !== draft.draft_en;
  const showPreview = !!draft && g.language !== 'en';

  return (
    <Panel title={t('reply.title')}>
      <ToggleGroup
        type="single"
        size="sm"
        value={intent}
        onValueChange={(v) => v && setIntent(v as ReplyIntent)}
        aria-label={t('reply.intent')}
        className="flex flex-wrap justify-start gap-1"
      >
        {INTENTS.map((i) => (
          <ToggleGroupItem
            key={i}
            value={i}
            className="data-[state=on]:bg-primary/15 data-[state=on]:text-primary min-h-11 rounded-full border px-2.5 text-xs md:min-h-7"
          >
            {t(`reply.intents.${i}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Button
        variant="outline"
        size="sm"
        className="border-ai/40 text-ai min-h-11 w-full md:min-h-9"
        disabled={generate.isPending}
        onClick={() => generate.mutate()}
        data-testid="draft-ai"
      >
        <Sparkles className="size-4" aria-hidden />
        {generate.isPending ? t('reply.drafting') : t('reply.draft')}
      </Button>
      <div className="space-y-1">
        <Label htmlFor="case-reply" className="text-xs">
          {t('reply.english')}
        </Label>
        <Textarea
          id="case-reply"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          aria-keyshortcuts="r"
        />
      </div>
      {showPreview && (
        <div className="border-ai/35 bg-ai/5 space-y-1 rounded-[var(--radius-sm)] border p-2" data-testid="citizen-preview">
          <div className="flex items-center justify-between gap-2">
            <AIBadge variant="suggested" label={t('reply.citizen_sees')} />
            <ListenButton text={draft.draft_citizen.original} lang={g.language} size="icon" />
          </div>
          <p
            lang={g.language}
            dir={isRtl(g.language) ? 'rtl' : 'ltr'}
            className="text-sm leading-[1.8] break-words"
          >
            {draft.draft_citizen.original}
          </p>
          {edited && <p className="text-warning text-xs">{t('reply.edited_note')}</p>}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">{t('reply.delivered_in', { language })}</p>
        <Button
          size="sm"
          className="min-h-11 md:min-h-9"
          disabled={!text.trim() || send.isPending}
          onClick={() => send.mutate(text.trim())}
          data-testid="send-reply"
        >
          <Send className="rtl-flip size-4" aria-hidden />
          {t('reply.send')}
        </Button>
      </div>
    </Panel>
  );
}
