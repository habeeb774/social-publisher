'use client';
import { useEffect, useRef, useState } from 'react';
import { requestLeadReport } from './export-request';

export function LeadExportButton({ href }: { href: string }) {
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);
  useEffect(() => () => pending.current?.abort(), []);
  async function download() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(''); setStarted(false);
    try {
      const { blob, filename } = await requestLeadReport(href, AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]));
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStarted(true);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error && failure.name === 'Error' ? failure.message : 'تعذر تنزيل التقرير. تحقق من الاتصال وحاول مجددًا.');
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return <div aria-busy={busy}>
    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void download()}>{busy ? 'جارٍ تجهيز التقرير…' : error ? 'إعادة محاولة التصدير' : 'تصدير التقرير CSV'}</button>
    {error ? <p role="alert">{error}</p> : null}
    {started ? <p role="status">بدأ تنزيل التقرير.</p> : null}
  </div>;
}
