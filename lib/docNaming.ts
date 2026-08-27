/**
 * Builds a human-readable file name for a case document, e.g.
 * "Petition_Ram_Laxman(NI-1).pdf" — so a downloaded file makes sense on
 * sight (which label, which case, which court) instead of whatever name a
 * phone's camera/scanner gave it. Shared between the case detail page's
 * upload flow and the in-app document scanner so both name files the
 * exact same way.
 */
import { getCourtShortLabel } from '@/lib/constants/courts'

export interface CaseForNaming {
  court_code: string | null
  court_name: string
  party_plaintiff: string
  party_defendant: string
}

export function sanitizeFileNamePart(s: string): string {
  return s.trim().replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').slice(0, 60)
}

export function buildDocFileName(caseData: CaseForNaming, label: string, ext: string): string {
  const p1 = sanitizeFileNamePart(caseData.party_plaintiff) || 'Party1'
  const p2 = sanitizeFileNamePart(caseData.party_defendant) || 'Party2'
  // getCourtShortLabel doesn't know about custom courts — for one, it just
  // hands back the raw code (e.g. "CUSTOM_<uuid>") unchanged rather than
  // failing, so check for that specifically and fall back to the real name.
  const shortLabel = getCourtShortLabel(caseData.court_code || '')
  const courtTag = sanitizeFileNamePart(shortLabel && !shortLabel.startsWith('CUSTOM_') ? shortLabel : caseData.court_name)
  const lbl = sanitizeFileNamePart(label) || 'Document'
  // The label you actually typed goes first — file lists elsewhere in the
  // app truncate long names from the right, so anything placed at the end
  // was getting cut off and hidden behind "...".
  return `${lbl}_${p1}_${p2}(${courtTag}).${ext}`
}
