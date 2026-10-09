export const formatRupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
export const formatTon = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value) + " ton";
export const formatDate = (value: Date | string) => new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
