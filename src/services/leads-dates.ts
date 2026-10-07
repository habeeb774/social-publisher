const formatter=new Intl.DateTimeFormat("ar-SA",{timeZone:"Asia/Riyadh",dateStyle:"medium",timeStyle:"short"});
export function leadDateLabel(value:unknown) {
  if(value==null||value==="")return "لم يُسجّل بعد";
  const date=new Date(String(value));
  return Number.isFinite(date.getTime())?formatter.format(date):"تاريخ غير متاح";
}
