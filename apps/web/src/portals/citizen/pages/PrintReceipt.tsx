// Print-optimized receipt / report (Spec A §5.9). jsPDF cannot shape Telugu/Devanagari/Urdu text, so the PDF is
// an image of this HTML (html-to-image toPng at 2× → jsPDF.addImage); "Print" uses window.print() with print CSS.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import type { GrievanceDetail } from '@contracts/types';
import { Button } from '@/design/ui/button';
import { ErrorState, PageSkeleton, Logo } from '@/design/components';
import { errorMessage } from '@/lib/api/client';
import { api, qk } from '@/lib/api/endpoints';
import { useLangFormat } from '@/lib/i18n/useLangFormat';
import { isRtl } from '@/lib/i18n';
import { pickLocalized } from '@/lib/localized';

function useQr(text: string) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import('qrcode').then((QR) => QR.toDataURL(text, { margin: 1, width: 240, errorCorrectionLevel: 'M' })).then((d) => alive && setSrc(d));
    return () => {
      alive = false;
    };
  }, [text]);
  return src;
}

export async function downloadPdf(node: HTMLElement, filename: string) {
  const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const png = await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const img = new Image();
  img.src = png;
  await img.decode();
  const imgH = (img.height * pageW) / img.width;
  // Tall content spills onto further pages by shifting the same image up.
  for (let y = 0, page = 0; y < imgH; y += pageH, page++) {
    if (page > 0) pdf.addPage();
    pdf.addImage(png, 'PNG', 0, -y, pageW, imgH);
  }
  pdf.save(filename);
}

function Receipt({ g, pin, full }: { g: GrievanceDetail; pin?: string; full: boolean }) {
  const { t, i18n } = useTranslation('citizen');
  const { t: tc } = useTranslation('common');
  const fmt = useLangFormat();
  const trackUrl = `${window.location.origin}${pin ? `/track?id=${g.id}&pin=${pin}` : `/app/complaints/${g.id}`}`;
  const qr = useQr(trackUrl);
  const title = pickLocalized(g.title, i18n.language, true);
  const events = g.timeline.filter((e) => !e.internal);
  const shownEvents = full ? events : events.slice(0, 4);
  const row = (k: string, v: ReactNode) => (
    <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-neutral-200 py-2 text-sm">
      <dt className="text-neutral-500">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
  return (
    <div className="space-y-6 text-neutral-900">
      <header className="flex items-start justify-between gap-4 border-b-2 border-neutral-900 pb-4">
        <div className="space-y-1">
          <Logo />
          <p className="text-xs text-neutral-500">{tc('brand.tagline')}</p>
        </div>
        <div className="text-end">
          <p className="text-xs tracking-wider text-neutral-500 uppercase">{full ? t('receipt.report_title') : t('receipt.title')}</p>
          <p className="font-mono text-2xl font-bold" data-testid="receipt-id">
            {g.id}
          </p>
          <p className="text-xs text-neutral-500">{fmt.dateTime(g.created_at)}</p>
        </div>
      </header>

      <div className="grid grid-cols-[1fr_auto] gap-6">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold" lang={title.lang} dir={title.dir}>
            {title.text}
          </h1>
          <p className="text-sm leading-relaxed" lang={g.description.lang} dir={isRtl(g.description.lang) ? 'rtl' : 'ltr'}>
            {g.description.original}
          </p>
          {g.description.lang !== 'en' && <p className="text-sm leading-relaxed text-neutral-600">{g.description.en}</p>}
        </div>
        <div className="space-y-1 text-center">
          {qr ? <img src={qr} alt={t('receipt.qr_alt')} className="size-32" data-testid="receipt-qr" /> : <div className="size-32 bg-neutral-100" />}
          <p className="max-w-32 text-[10px] text-neutral-500">{t('receipt.scan')}</p>
        </div>
      </div>

      <dl>
        {row(t('receipt.status'), tc(`status.${g.status}`))}
        {row(t('receipt.department'), tc(`departments.${g.category}`))}
        {row(t('receipt.priority'), `${tc(`priority.${g.priority}`)} · ${g.priority_score}`)}
        {row(t('receipt.due'), fmt.dateTime(g.sla.due_at))}
        {row(t('receipt.location'), g.location.address ?? g.location.ward_name ?? '—')}
        {g.assigned_officer && row(t('receipt.officer'), `${g.assigned_officer.name}, ${g.assigned_officer.office_name}`)}
        {pin && row(t('submitted.pin'), <span className="font-mono font-bold tracking-widest">{pin}</span>)}
        {full && (g.status === 'closed' || g.status === 'rejected') &&
          row(t('report_pdf.closure'), t(`tracker.closure.${g.closure_type === 'citizen_verified' ? 'verified' : g.closure_type === 'auto_closed_unverified' ? 'auto' : 'rejected'}`))}
        {full && g.rating != null && row(t('fix.rating'), '★'.repeat(g.rating) + '☆'.repeat(5 - g.rating))}
      </dl>

      {full && (
        <section className="space-y-1">
          <h2 className="text-sm font-semibold tracking-wider text-neutral-500 uppercase">{t('tracker.why_priority')}</h2>
          <ul className="grid grid-cols-2 gap-x-6 text-sm" lang="en">
            {g.priority_factors.map((f) => (
              <li key={f.key} className="flex justify-between border-b border-neutral-100 py-1">
                <span>{f.label_en}</span>
                <span className="font-mono">+{f.points}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {full && g.ai_verification && (
        <section className="space-y-1 text-sm">
          <h2 className="text-sm font-semibold tracking-wider text-neutral-500 uppercase">{t(`tracker.verdict.${g.ai_verification.verdict}`)}</h2>
          <ul lang="en">
            {g.ai_verification.reasons_en.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        </section>
      )}

      {full && g.appeal && (
        <section className="space-y-1 text-sm">
          <h2 className="text-sm font-semibold tracking-wider text-neutral-500 uppercase">
            {t('appeal.title')} · {t(`appeal.status.${g.appeal.status}`)}
          </h2>
          <p dir="auto">{g.appeal.reason.original}</p>
          {g.appeal.decision_note && <p className="text-neutral-600">{g.appeal.decision_note.en}</p>}
        </section>
      )}

      {full && g.messages.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="text-sm font-semibold tracking-wider text-neutral-500 uppercase">{t('tracker.messages')}</h2>
          <ol className="space-y-1.5 text-sm">
            {g.messages.map((m) => {
              const msg = pickLocalized(m.text, i18n.language);
              return (
                <li key={m.id} className="grid grid-cols-[9rem_1fr] gap-3">
                  <span className="text-neutral-500">
                    {fmt.dateTime(m.created_at)}
                    <span className="block text-xs">{m.sender_name ?? t(`tracker.sender.${m.sender}`)}</span>
                  </span>
                  <span lang={msg.lang} dir={msg.dir}>
                    {msg.text}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wider text-neutral-500 uppercase">{t('detail.timeline')}</h2>
        <ol className="space-y-1.5 text-sm">
          {shownEvents.map((e) => (
            <li key={e.id} className="grid grid-cols-[9rem_1fr] gap-3">
              <span className="text-neutral-500">{fmt.dateTime(e.created_at)}</span>
              <span>
                {tc(`timeline.types.${e.type}`, { defaultValue: e.message_en })}
                {full && <span className="block font-mono text-[10px] text-neutral-400">#{e.hash.slice(0, 16)}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t border-neutral-200 pt-3 text-[11px] text-neutral-500">{t('receipt.footer')}</footer>
    </div>
  );
}

export default function PrintReceipt({ full = false }: { full?: boolean }) {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const pin = params.get('pin') ?? undefined;
  const { t, i18n } = useTranslation('citizen');
  const { t: tc } = useTranslation('common');
  const sheet = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: qk.grievances.detail(id, pin), queryFn: ({ signal }) => api.getGrievance(id, { pin, lang: i18n.language }, signal) });

  return (
    <div className="bg-surface-2 min-h-dvh py-6 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display: none !important } @page { size: A4; margin: 12mm } html, body { background: #fff !important } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2 px-4">
        <Button asChild variant="ghost" className="touch-target">
          <Link to={pin ? `/track?id=${id}&pin=${pin}` : `/app/complaints/${id}`}>
            <ArrowLeft className="rtl-flip size-4" aria-hidden />
            {tc('actions.back')}
          </Link>
        </Button>
        <span className="flex-1" />
        <Button variant="outline" className="touch-target" onClick={() => window.print()} disabled={!q.data}>
          <Printer className="size-4" aria-hidden />
          {tc('actions.print')}
        </Button>
        <Button
          className="touch-target"
          disabled={!q.data || busy}
          data-testid="download-pdf"
          onClick={async () => {
            if (!sheet.current) return;
            setBusy(true);
            try {
              await downloadPdf(sheet.current, `JanaVaani-${id}.pdf`);
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
          {t('receipt.download')}
        </Button>
      </div>
      {/* data-theme="paper": the receipt is always printed light, whatever the app theme. */}
      <div ref={sheet} data-theme="paper" className="mx-auto w-full max-w-[210mm] bg-white p-[12mm] shadow-lg print:max-w-none print:p-0 print:shadow-none" data-testid="receipt-sheet">
        {q.isPending ? <PageSkeleton /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <Receipt g={q.data} pin={pin} full={full} />}
      </div>
    </div>
  );
}

export const PrintReport = () => <PrintReceipt full />;
