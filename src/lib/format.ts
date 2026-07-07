export function formatCurrency(value: number | null | undefined): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(num);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

// Generate a sequential-looking order number: ORD-YYYY-XXXX
export function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${year}-${rand}`;
}

// Generate a barcode: 13-digit EAN-like number
export function generateBarcode(): string {
  const base = '200';
  const random = Math.floor(10000000 + Math.random() * 89999999).toString();
  const partial = base + random;
  // Simple checksum (not a real EAN-13 check digit, but unique enough)
  let sum = 0;
  for (let i = 0; i < partial.length; i++) {
    sum += parseInt(partial[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return partial + checkDigit.toString();
}
