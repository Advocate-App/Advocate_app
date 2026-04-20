/**
 * Companies where father (Shri Ratnesh Kumar Jain Shah) is already empanelled.
 * These companies NEVER receive empanelment applications from Avi.
 * They only get holiday wishes (separate feature).
 */
export const FATHER_EMPANELLED_COMPANIES = [
  'SBI General Insurance',
  'New India Assurance',
  'Oriental Insurance',
  'National Insurance',
  'United India Insurance',
  'ICICI Lombard',
  'Bajaj Allianz General Insurance',
  'IFFCO-Tokio',
  'Future Generali India Insurance',
  'Universal Sompo General Insurance',
] as const

export function isFatherEmpanelled(orgName: string): boolean {
  return FATHER_EMPANELLED_COMPANIES.some(
    (name) => name.toLowerCase() === orgName.toLowerCase()
  )
}
