// Human confirmation of an AI/rule emergency flag (feature 69). Used on the priority card and in the queue.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/design/ui/button';
import { Textarea } from '@/design/ui/textarea';
import { errorMessage } from '@/lib/api/client';
import { api, qk } from '@/lib/api/endpoints';

export function EmergencyDecision({ id }: { id: string }) {
  const { t } = useTranslation('gov');
  const qc = useQueryClient();
  const [denying, setDenying] = useState(false);
  const [note, setNote] = useState('');
  const decide = useMutation({
    mutationFn: (confirmed: boolean) => api.emergencyDecision(id, { confirmed, note: note || undefined }),
    onSuccess: (detail, confirmed) => {
      qc.setQueryData(qk.grievances.detail(id), detail);
      qc.invalidateQueries({ queryKey: qk.officer.all });
      toast.success(t(confirmed ? 'emergency.confirmed' : 'emergency.denied'));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (denying) {
    return (
      <div className="space-y-2">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          aria-label={t('emergency.deny_reason')}
          placeholder={t('emergency.deny_reason')}
        />
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 flex-1 md:min-h-9"
            onClick={() => setDenying(false)}
          >
            {t('emergency.back')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 flex-1 md:min-h-9"
            disabled={!note.trim() || decide.isPending}
            onClick={() => decide.mutate(false)}
          >
            {t('emergency.deny')}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Button
        variant="destructive"
        size="sm"
        className="min-h-11 flex-1 md:min-h-9"
        disabled={decide.isPending}
        onClick={() => decide.mutate(true)}
      >
        <ShieldAlert className="size-4" aria-hidden />
        {t('emergency.confirm')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="min-h-11 flex-1 md:min-h-9"
        onClick={() => setDenying(true)}
      >
        <ShieldOff className="size-4" aria-hidden />
        {t('emergency.deny')}
      </Button>
    </div>
  );
}
