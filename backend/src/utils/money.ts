export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateTax(subtotal: number, taxRate = 0.18) {
  const taxAmount = roundMoney(subtotal * taxRate);
  const total = roundMoney(subtotal + taxAmount);

  return {
    subtotal: roundMoney(subtotal),
    taxRate,
    taxAmount,
    total
  };
}

export function formatDop(value: number): string {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    minimumFractionDigits: 2
  }).format(value);
}