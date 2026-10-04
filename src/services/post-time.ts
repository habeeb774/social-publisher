/** Form times are explicitly Riyadh time, independent of the browser timezone. */
export function riyadhInputToIso(value:string) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("موعد النشر غير صالح");
  const date=new Date(`${value}:00+03:00`);
  if(!Number.isFinite(date.getTime())) throw new Error("موعد النشر غير صالح");
  return date.toISOString();
}
export function isoToRiyadhInput(value:string|null) {
  if(!value) return "";
  return new Date(new Date(value).getTime()+3*60*60*1000).toISOString().slice(0,16);
}
