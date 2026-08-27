/**
 * Works out which city a case belongs to — prefers the case's own saved
 * city, falling back to the court's district for older cases that don't
 * have one, and finally the High Court bench. Shared by anywhere that
 * needs to group or filter cases by city (File Pull List, junior
 * advocates' Udaipur-only view).
 */
import { DISTRICT_COURTS } from '@/lib/constants/courts'

const DISTRICT_BY_CODE = new Map(DISTRICT_COURTS.map((c) => [c.code, c.district]))
const HC_BENCH_CITY: Record<string, string> = { jodhpur: 'Jodhpur', jaipur: 'Jaipur' }

export function cityFor(courtCode: string | null | undefined, explicitCity: string | null | undefined): string {
  if (explicitCity?.trim()) return explicitCity.trim()
  return DISTRICT_BY_CODE.get(courtCode || '') || HC_BENCH_CITY[courtCode || ''] || 'Other'
}
