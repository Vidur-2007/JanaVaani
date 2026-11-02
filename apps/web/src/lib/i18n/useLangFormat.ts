// Locale-aware number/date formatting in Asia/Kolkata. Western digits everywhere (ticket IDs stay readable).
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export const TIME_ZONE = 'Asia/Kolkata';
const localeFor = (lang: string) => `${lang.slice(0, 2)}-IN-u-nu-latn`;

export function makeFormatters(lang: string) {
  const locale = localeFor(lang);
  const num = new Intl.NumberFormat(locale);
  const pct = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' });
  const dateTime = new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const time = new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });
  const rel = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  const toDate = (d: string | number | Date) => (d instanceof Date ? d : new Date(d));

  return {
    locale,
    number: (n: number) => num.format(n),
    percent: (n: number) => `${pct.format(n)}%`,
    date: (d: string | number | Date) => date.format(toDate(d)),
    dateTime: (d: string | number | Date) => dateTime.format(toDate(d)),
    time: (d: string | number | Date) => time.format(toDate(d)),
    /** "3 hours ago" / "in 2 days". */
    relative: (d: string | number | Date, now: number = Date.now()) => {
      const diff = (toDate(d).getTime() - now) / 1000;
      const abs = Math.abs(diff);
      if (abs < 60) return rel.format(Math.round(diff), 'second');
      if (abs < 3600) return rel.format(Math.round(diff / 60), 'minute');
      if (abs < 86400) return rel.format(Math.round(diff / 3600), 'hour');
      if (abs < 86400 * 30) return rel.format(Math.round(diff / 86400), 'day');
      return rel.format(Math.round(diff / (86400 * 30)), 'month');
    },
    /** Compact duration from minutes: "2d 4h", "3h 20m", "45m". */
    duration: (minutes: number) => {
      const m = Math.abs(Math.round(minutes));
      const d = Math.floor(m / 1440);
      const h = Math.floor((m % 1440) / 60);
      const mm = m % 60;
      if (d) return `${num.format(d)}d ${num.format(h)}h`;
      if (h) return `${num.format(h)}h ${num.format(mm)}m`;
      return `${num.format(mm)}m`;
    },
  };
}

export type LangFormat = ReturnType<typeof makeFormatters>;

export function useLangFormat(): LangFormat {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  return useMemo(() => makeFormatters(lang), [lang]);
}
