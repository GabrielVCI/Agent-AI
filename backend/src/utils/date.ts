export function formatDateDO(date: Date): string {
  return new Intl.DateTimeFormat("es-DO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Santo_Domingo"
  }).format(date);
}

export function formatDateTimeDO(date: Date): string {
  return new Intl.DateTimeFormat("es-DO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santo_Domingo"
  }).format(date);
}