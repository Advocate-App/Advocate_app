/**
 * Companies where father (Shri Ratnesh Kumar Jain Shah) is already empanelled.
 * From his resume — exact names as listed.
 * These companies NEVER receive empanelment applications.
 * They only get holiday wishes (separate feature).
 */
export const FATHER_EMPANELLED_COMPANIES = [
  'SBI General Insurance Co. Ltd.',
  'SBI General Insurance',
  'New India Assurance Co. Ltd.',
  'New India Assurance',
  'Oriental Insurance Co. Ltd.',
  'Oriental Insurance',
  'National Insurance Co. Ltd.',
  'National Insurance',
  'United India General Insurance Co. Ltd.',
  'United India Insurance',
  'ICICI General Insurance Co. Ltd.',
  'ICICI Lombard',
  'Bajaj Allianz General Insurance Co. Ltd.',
  'Bajaj Allianz General Insurance',
  'IFFCO Tokio General Insurance Co. Ltd.',
  'IFFCO-Tokio',
  'Future Generali Insurance Co. Ltd.',
  'Future Generali India Insurance',
  'Sompo General Insurance Co. Ltd.',
  'Universal Sompo General Insurance',
] as const

export function isFatherEmpanelled(orgName: string): boolean {
  const lower = orgName.toLowerCase()
  return FATHER_EMPANELLED_COMPANIES.some(
    (name) => lower.includes(name.toLowerCase()) || name.toLowerCase().includes(lower)
  )
}
