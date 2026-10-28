/**
 * Jalali (Solar Hijri) Date Converter and Persian Localization Utilities
 */

// Algorithms for converting Gregorian to Jalali and vice versa
export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) +
    gd +
    g_d_m[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm: number;
  let jd: number;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }
  return [jy, jm, jd];
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  jy += 1595;
  let days =
    -355668 +
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  let gm: number;
  for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) {
    gd -= sal_a[gm];
  }
  return [gy, gm, gd];
}

export const JALALI_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

/**
 * Returns formatted Jalali date string: YYYY/MM/DD
 */
export function getJalaliDateString(dateInput: Date | string | number = new Date()): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const mm = jm < 10 ? `0${jm}` : `${jm}`;
  const dd = jd < 10 ? `0${jd}` : `${jd}`;
  return `${jy}/${mm}/${dd}`;
}

/**
 * Returns human readable Persian date with month name (e.g. ۲۱ مهر ۱۴۰۴)
 */
export function formatJalaliReadable(dateInput: Date | string | number = new Date(), withTime = false): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '-';
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const monthName = JALALI_MONTH_NAMES[jm - 1] || '';
  const dateStr = `${jd} ${monthName} ${jy}`;
  if (!withTime) return dateStr;
  const hh = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${dateStr} - ${hh}:${min}`;
}

/**
 * Normalizes Persian and Arabic numbers to English digits
 */
export function normalizeDigits(input: string | number): string {
  if (input === null || input === undefined) return '';
  const str = input.toString();
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let result = str;
  for (let i = 0; i < 10; i++) {
    result = result.replace(new RegExp(persianDigits[i], 'g'), i.toString());
    result = result.replace(new RegExp(arabicDigits[i], 'g'), i.toString());
  }
  return result;
}

/**
 * Formats a number to Toman string with thousands separator (e.g. 150,000)
 */
export function formatToman(amount: number | string | undefined | null): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) return '0';
  const num = Math.round(Number(amount));
  return num.toLocaleString('en-US');
}

/**
 * Parses user input currency (handles commas, spaces, persian numbers) safely to integer Toman
 */
export function parseTomanInput(val: string | number): number {
  if (typeof val === 'number') return Math.round(val);
  if (!val) return 0;
  const clean = normalizeDigits(val).replace(/[^0-9-]/g, '');
  const parsed = parseInt(clean, 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Get date range bounds based on presets
 */
export function getDateRangeBounds(preset: 'today' | 'week' | 'month' | 'last30' | 'year'): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (preset === 'today') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return { from, to };
  }
  if (preset === 'week') {
    // Current week starting from Saturday (Iranian week)
    const dayOfWeek = now.getDay(); // 0 is Sunday, 6 is Saturday
    const daysSinceSaturday = (dayOfWeek + 1) % 7;
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceSaturday, 0, 0, 0, 0);
    return { from, to };
  }
  if (preset === 'month') {
    // Current Jalali month
    const [jy, jm] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const [gy, gm, gd] = jalaliToGregorian(jy, jm, 1);
    const from = new Date(gy, gm - 1, gd, 0, 0, 0, 0);
    return { from, to };
  }
  if (preset === 'last30') {
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  // year
  const [jy] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const [gy, gm, gd] = jalaliToGregorian(jy, 1, 1);
  const from = new Date(gy, gm - 1, gd, 0, 0, 0, 0);
  return { from, to };
}

/**
 * Parses Jalali string like "1404/07/21" or "1404-07-21" to Gregorian Date
 */
export function parseJalaliDate(jalaliStr: string): Date | null {
  if (!jalaliStr) return null;
  const normalized = normalizeDigits(jalaliStr).trim();
  const parts = normalized.split(/[/\\-]/).map((p) => parseInt(p, 10));
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return null;
  }
  const [jy, jm, jd] = parts;
  if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > 31) {
    return null;
  }
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  return new Date(gy, gm - 1, gd);
}

/**
 * Returns bounds (from 00:00:00 to 23:59:59.999) for an exact Jalali date string
 */
export function getJalaliDayBounds(jalaliStr: string): { from: Date; to: Date } | null {
  const d = parseJalaliDate(jalaliStr);
  if (!d) return null;
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { from, to };
}

/**
 * Adds or subtracts days to/from a Jalali date string (e.g. "1404/07/21" + 1 -> "1404/07/22")
 */
export function addJalaliDays(jalaliStr: string, days: number): string {
  const d = parseJalaliDate(jalaliStr) || new Date();
  d.setDate(d.getDate() + days);
  return getJalaliDateString(d);
}
