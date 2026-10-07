/** Validate the download response instead of saving an error or login page as CSV. */
export async function requestLeadReport(href: string, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const response = await fetcher(href, { cache: 'no-store', signal });
  if (!response.ok) {
    const message = response.status === 401 ? 'انتهت الجلسة. سجّل الدخول مجددًا.'
      : response.status === 403 ? 'ليست لديك صلاحية لتصدير هذا التقرير.'
      : response.status === 400 ? 'خيارات التقرير غير صالحة. أعد اختيار الفترة والفلاتر.'
      : 'تعذر تصدير التقرير. حاول مجددًا.';
    throw new Error(message);
  }
  if (!/^text\/csv(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error('تعذر استلام ملف التقرير. حاول مجددًا.');
  const filename = response.headers.get('content-disposition')?.match(/filename="(leads-analytics-[\d-]+\.csv)"/)?.[1] ?? 'leads-analytics.csv';
  return { blob: await response.blob(), filename };
}
