export const DISTRICT_COURTS = [
  { code: 'MACT_UDR', name: 'MACT Udaipur', district: 'Udaipur' },
  { code: 'MACT2_UDR', name: 'MACT-2 Udaipur', district: 'Udaipur' },
  { code: 'DCR_UDR', name: 'District & Sessions Court Udaipur', district: 'Udaipur' },
  { code: 'DCR_DGP', name: 'District Court Dungarpur', district: 'Dungarpur' },
  { code: 'DCR_BNW', name: 'District Court Banswara', district: 'Banswara' },
  { code: 'DCR_RSM', name: 'District Court Rajsamand', district: 'Rajsamand' },
  { code: 'DCR_NTH', name: 'Sub-Division Court Nathdwara', district: 'Rajsamand' },
  { code: 'DCR_SGW', name: 'Sub-Division Court Sagwara', district: 'Dungarpur' },
  { code: 'COMM_UDR', name: 'Commercial Court Udaipur', district: 'Udaipur' },
  { code: 'CONS_UDR', name: 'Consumer Forum Udaipur', district: 'Udaipur' },
  { code: 'CONS_DGP', name: 'Consumer Forum Dungarpur', district: 'Dungarpur' },
  { code: 'CONS_RSM', name: 'Consumer Forum Rajsamand', district: 'Rajsamand' },
  { code: 'CONS_BNW', name: 'Consumer Forum Banswara', district: 'Banswara' },
  { code: 'FAM_UDR', name: 'Family Court Udaipur', district: 'Udaipur' },
  { code: 'SESS_UDR', name: 'Sessions Court Udaipur', district: 'Udaipur' },
  { code: 'LA_UDR', name: 'Land Acquisition Udaipur', district: 'Udaipur' },
  { code: 'NCL_UDR', name: 'NCLT / NCL Udaipur', district: 'Udaipur' },
  { code: 'DRT_JPR', name: 'DRT Jaipur', district: 'Jaipur' },
  { code: 'OTHER', name: 'Other — specify', district: null },
]

export const DISTRICT_CASE_TYPES = [
  'CSA', 'COD', 'CNA', 'CPV', 'CDA', 'NOV',
  'Civil Suit', 'Criminal Case', 'MACP', 'Execution Petition',
  'Section 138 NI Act', 'Domestic Violence', 'Maintenance',
  'Consumer Complaint', 'Writ (Service)', 'Appeal', 'Revision',
  'Land Acquisition Reference', 'Arbitration', 'Other',
]

export const DISTRICT_STAGES = [
  'Summons', 'Appearance', 'Written Statement', 'Issues',
  'Plaintiff Evidence', 'Defendant Evidence', 'Arguments',
  'Judgment Reserved', 'Judgment', 'Execution',
  '805', 'Arg', 'EMI', 'CPL', 'Sin', 'Eny', 'Ent',
  'Adjourned', 'For Orders', 'Other',
]

export const HC_BENCHES = [
  { code: 'jodhpur', name: 'Principal Seat Jodhpur' },
  { code: 'jaipur', name: 'Bench at Jaipur' },
]

export const HC_CASE_TYPES = [
  'SB Civil Writ Petition', 'DB Civil Writ Petition',
  'SB Criminal Writ Petition', 'DB Criminal Writ Petition',
  'SB Civil Appeal', 'DB Civil Appeal',
  'SB Criminal Appeal', 'DB Criminal Appeal',
  'SB Civil Misc Petition', 'SB Criminal Misc Petition',
  'Civil Revision Petition', 'Criminal Revision Petition',
  'Review Petition', 'Caveat', 'Contempt Petition',
  'Transfer Petition', 'Bail Application', 'Anticipatory Bail',
  'First Appeal', 'Second Appeal', 'Arbitration Appeal',
  'Income Tax Appeal', 'Sales Tax Revision', 'Other',
]

export const HC_STAGES = [
  'Admission', 'Motion', 'Regular Hearing', 'Final Hearing',
  'Arguments', 'Judgment Reserved', 'Judgment',
  'For Orders', 'Notice', 'Service Complete',
  'Counter Affidavit', 'Rejoinder', 'Other',
]

export const CLIENT_SIDES_DISTRICT = [
  'plaintiff', 'defendant', 'both', 'intervenor',
  'applicant', 'opposite_party',
]

export const CLIENT_SIDES_HC = [
  'petitioner', 'respondent', 'applicant', 'appellant',
  'caveator', 'intervenor',
]

export function getCourtLabel(code: string): string {
  const court = DISTRICT_COURTS.find(c => c.code === code)
  if (court) return court.name
  const bench = HC_BENCHES.find(b => b.code === code)
  if (bench) return bench.name
  return code
}

export function eCourtsDeepLink(cnr: string | null): string | null {
  if (!cnr) return null
  // eCourts case status search page — user can paste CNR there
  // Direct CNR deep links no longer work reliably, so we link to the search page
  return `https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index&app_token=&cino=${encodeURIComponent(cnr)}`
}

export function formatCaseNumber(num: string, year: number | null): string {
  if (!year) return num
  return `${num}/${year}`
}

export function getCourtColor(code: string): string {
  if (code.startsWith('MACT')) return '#dbeafe'
  if (code.startsWith('DCR') || code.startsWith('SESS')) return '#f3f4f6'
  if (code.startsWith('COMM') || code.startsWith('CONS')) return '#dcfce7'
  if (code === 'jodhpur' || code === 'jaipur') return '#ede9fe'
  return '#f9fafb'
}

export function getCourtBorderColor(code: string): string {
  if (code.startsWith('MACT')) return '#3b82f6'
  if (code.startsWith('DCR') || code.startsWith('SESS')) return '#6b7280'
  if (code.startsWith('COMM') || code.startsWith('CONS')) return '#22c55e'
  if (code === 'jodhpur' || code === 'jaipur') return '#8b5cf6'
  return '#9ca3af'
}
