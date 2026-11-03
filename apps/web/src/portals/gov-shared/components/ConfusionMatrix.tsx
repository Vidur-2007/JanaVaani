// Confusion matrix heatmap (Spec C §6.8). Correct predictions shade teal, mistakes red; a real table for screen readers.
import { useTranslation } from 'react-i18next';
import type { DepartmentId } from '@contracts/types';

export function ConfusionMatrix({ labels, matrix }: { labels: DepartmentId[]; matrix: number[][] }) {
  const { t } = useTranslation('gov');
  const { t: tc } = useTranslation('common');
  const max = Math.max(1, ...matrix.flat());
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('ai.confusion')}>
      <table className="border-separate border-spacing-0.5 text-[11px]" data-testid="confusion-matrix">
        <caption className="sr-only">{t('ai.confusion_caption')}</caption>
        <thead>
          <tr>
            <th scope="col" className="text-muted-foreground p-1 text-start font-normal">
              {t('ai.actual_predicted')}
            </th>
            {labels.map((l) => (
              <th key={l} scope="col" className="text-muted-foreground h-24 min-w-8 align-bottom font-normal">
                <span className="inline-block [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">
                  {tc(`departments.${l}`)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((actual, i) => (
            <tr key={actual}>
              <th scope="row" className="text-muted-foreground pe-2 text-start font-normal whitespace-nowrap">
                {tc(`departments.${actual}`)}
              </th>
              {labels.map((predicted, j) => {
                const n = matrix[i]?.[j] ?? 0;
                const tone = i === j ? 'var(--accent)' : 'var(--danger)';
                return (
                  <td
                    key={predicted}
                    title={t('ai.confusion_cell', {
                      count: n,
                      actual: tc(`departments.${actual}`),
                      predicted: tc(`departments.${predicted}`),
                    })}
                    className="tabular size-8 rounded text-center font-mono"
                    style={{
                      background: n ? `color-mix(in oklab, ${tone} ${Math.round(15 + (n / max) * 70)}%, transparent)` : 'var(--surface-2)',
                    }}
                  >
                    {n || ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
