'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { formatCaseNumber, getCourtShortLabel, getCourtSortPriority } from '@/lib/constants/courts'

const HINDI_DAYS: Record<string, string> = {
  Sunday: 'रविवार', Monday: 'सोमवार', Tuesday: 'मंगलवार',
  Wednesday: 'बुधवार', Thursday: 'गुरुवार', Friday: 'शुक्रवार', Saturday: 'शनिवार',
}

interface SlipCase {
  sr: number
  court: string
  caseNumber: string
  caseYear: number | null
  plaintiff: string
  defendant: string
}

export default function PrintSlipPage() {
  const { date } = useParams<{ date: string }>()
  const [cases, setCases] = useState<SlipCase[]>([])
  const [advocateName, setAdvocateName] = useState('')
  const [loading, setLoading] = useState(true)

  const parsedDate = (() => { try { return parseISO(date) } catch { return new Date() } })()
  const displayDate = format(parsedDate, 'd MMMM yyyy')
  const dayName = format(parsedDate, 'EEEE')
  const dayHindi = HINDI_DAYS[dayName] || ''

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: advData } = await supabase
        .from('advocates').select('id, full_name').eq('user_id', user.id).limit(1).single()
      if (advData) setAdvocateName(advData.full_name)

      const { data: hearings } = await supabase
        .from('hearings').select('case_id').eq('hearing_date', date).order('created_at', { ascending: true })
      if (!hearings || hearings.length === 0) { setLoading(false); return }

      const caseIds = [...new Set(hearings.map((h: { case_id: string }) => h.case_id))]
      const { data: casesData } = await supabase
        .from('cases')
        .select('id, advocate_id, court_code, court_name, case_number, case_year, party_plaintiff, party_defendant')
        .in('id', caseIds)
        .eq('advocate_id', advData?.id)

      if (!casesData) { setLoading(false); return }

      const caseMap = new Map(casesData.map((c: { id: string }) => [c.id, c]))
      const slip: SlipCase[] = []
      let sr = 1

      for (const h of hearings) {
        const c = caseMap.get(h.case_id) as {
          court_code: string; court_name: string; case_number: string;
          case_year: number | null; party_plaintiff: string; party_defendant: string
        } | undefined
        if (!c) continue
        slip.push({
          sr: sr++,
          court: c.court_code || c.court_name,
          caseNumber: c.case_number,
          caseYear: c.case_year,
          plaintiff: c.party_plaintiff,
          defendant: c.party_defendant,
        })
      }

      // Sort: MACT-1 → MACT-2 → Udaipur courts → other cities
      slip.sort((a, b) => getCourtSortPriority(a.court) - getCourtSortPriority(b.court))
      // Re-number after sort
      slip.forEach((c, i) => { c.sr = i + 1 })

      setCases(slip)
      setLoading(false)
    }
    load()
  }, [date])

  const COMPANY_SHORT: [string, string][] = [
    ['Universal Sompo', 'Sompo'], ['United India', 'United India'],
    ['New India Assurance', 'New India'], ['National Insurance', 'National Ins.'],
    ['Oriental Insurance', 'Oriental Ins.'], ['SBI General', 'SBI Gen.'],
    ['SBI Life', 'SBI Life'], ['State Bank of India', 'SBI'],
    ['HDFC ERGO', 'HDFC Ergo'], ['HDFC Ergo', 'HDFC Ergo'],
    ['HDFC Life', 'HDFC Life'], ['HDFC Bank', 'HDFC'],
    ['ICICI Lombard', 'ICICI Lom.'], ['ICICI Prudential', 'ICICI Pru.'], ['ICICI Bank', 'ICICI'],
    ['Bajaj Allianz', 'Bajaj Allianz'], ['Bajaj Finance', 'Bajaj Fin.'],
    ['Tata AIG', 'Tata AIG'], ['Star Health', 'Star Health'],
    ['Reliance General', 'Reliance'], ['Cholamandalam', 'Chola'],
    ['Royal Sundaram', 'Royal Sun.'], ['Future Generali', 'Future Gen.'],
    ['IFFCO-Tokio', 'IFFCO'], ['IFFCO Tokio', 'IFFCO'],
    ['Punjab National Bank', 'PNB'], ['Bank of Baroda', 'BOB'],
    ['Bank of India', 'BOI'], ['Canara Bank', 'Canara'],
    ['Union Bank', 'Union Bank'], ['Axis Bank', 'Axis'],
    ['Kotak Mahindra', 'Kotak'], ['IndusInd Bank', 'IndusInd'],
    ['Yes Bank', 'Yes Bank'], ['Shriram', 'Shriram'],
    ['Mahindra Finance', 'M&M Fin.'], ['L&T Finance', 'L&T Fin.'],
    ['Muthoot', 'Muthoot'], ['LIC of India', 'LIC'],
    ['Life Insurance Corporation', 'LIC'], ['Agriculture Insurance', 'Agri. Ins.'],
    ['Niva Bupa', 'Niva Bupa'], ['Go Digit', 'Digit'], ['Care Health', 'Care'],
  ]

  function companyShort(raw: string): string {
    const n = raw.trim()
    for (const [key, short] of COMPANY_SHORT) {
      if (n.toLowerCase().includes(key.toLowerCase())) return short
    }
    const companyWords = /\b(ltd|llp|corp|bank|insurance|finance|assurance|company|co\.|pvt|inc|authority|corporation|general)\b/i
    if (companyWords.test(n)) {
      const skip = new Set(['the', 'of', 'and', 'a', 'an', 'for', 'in', 'at', '&'])
      return n.split(/\s+/).find(w => !skip.has(w.toLowerCase())) || n.split(' ')[0]
    }
    return n
  }

  function shortName(name: string): string {
    const n = name.trim()
    // Check if name has a company in brackets: "Rahul Shrivastav (ICICI Bank)"
    const bracketMatch = n.match(/^(.+?)\s*\((.+)\)\s*$/)
    if (bracketMatch) {
      const personPart = bracketMatch[1].trim()
      const companyPart = bracketMatch[2].trim()
      const firstName = personPart.split(' ')[0]
      return `${firstName} (${companyShort(companyPart)})`
    }
    // Pure company name
    const companyWords = /\b(ltd|llp|corp|bank|insurance|finance|assurance|company|co\.|pvt|inc|authority|corporation|general|sompo|lombard|allianz|tokio|ergo)\b/i
    if (companyWords.test(n)) return companyShort(n)
    // Plain person name — first name only
    return n.split(' ')[0]
  }

  useEffect(() => {
    if (!loading) {
      if (window.parent !== window) {
        // Inside iframe — tell parent we're ready
        window.parent.postMessage('slip-ready', '*')
      } else {
        // Opened directly in browser tab
        setTimeout(() => window.print(), 300)
      }
    }
  }, [loading])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'serif' }}>
      Loading…
    </div>
  )

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body {
            margin: 0; padding: 0; background: white;
            width: 210mm; height: 297mm; overflow: hidden;
          }
          .no-print { display: none !important; }
          .wrap { display: block; padding: 0; background: white; }
          .slip {
            position: absolute;
            top: 10mm;
            right: 8mm;
            width: 88mm;
            border: none;
          }
        }
        body { font-family: 'Times New Roman', Georgia, serif; background: #eee; margin: 0; padding: 0; }
        .wrap { display: flex; justify-content: flex-end; padding: 20px 24px; }
        .slip {
          width: 88mm;
          background: white;
          border: 1px solid #888;
          padding: 5mm 5mm 4mm;
          box-sizing: border-box;
        }
        .header {
          text-align: center;
          border-bottom: 1.5px solid #222;
          padding-bottom: 2mm;
          margin-bottom: 2mm;
        }
        .header-title { font-size: 8px; letter-spacing: 1px; text-transform: uppercase; color: #555; }
        .header-date { font-size: 13px; font-weight: bold; margin: 1mm 0 0; }
        .header-day { font-size: 8.5px; color: #333; }
        .header-adv { font-size: 8px; color: #666; font-style: italic; margin-top: 1mm; }
        .cases { list-style: none; margin: 0; padding: 0; }
        .case-row {
          display: flex;
          align-items: baseline;
          gap: 2mm;
          padding: 1mm 0;
          border-bottom: 0.3px dotted #ccc;
          font-size: 9px;
          line-height: 1.4;
        }
        .case-row:last-child { border-bottom: none; }
        .sr { min-width: 4mm; font-weight: bold; color: #555; flex-shrink: 0; }
        .court { font-weight: bold; flex-shrink: 0; min-width: 12mm; }
        .sep { color: #aaa; flex-shrink: 0; }
        .caseno { font-family: monospace; font-size: 8.5px; flex-shrink: 0; }
        .parties { color: #222; }
        .footer {
          margin-top: 2mm;
          padding-top: 1.5mm;
          border-top: 0.5px solid #bbb;
          text-align: center;
          font-size: 7px;
          color: #888;
        }
        .print-btn {
          display: block;
          margin: 16px auto 8px;
          padding: 10px 32px;
          background: #1e3a5f;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          font-family: sans-serif;
        }
        .count-label {
          text-align: center;
          font-family: sans-serif;
          font-size: 12px;
          color: #555;
          margin-bottom: 12px;
        }
      `}</style>

      {cases.length > 0 && (
        <p className="count-label no-print">{cases.length} hearing{cases.length !== 1 ? 's' : ''} — printing…</p>
      )}

      <div className="wrap">
        <div className="slip">
          <div className="header">
            <div className="header-title">Court Diary</div>
            <div className="header-date">{displayDate}</div>
            <div className="header-day">{dayName} &nbsp;·&nbsp; {dayHindi}</div>
            {advocateName && <div className="header-adv">Adv. {advocateName}</div>}
          </div>

          {cases.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '8mm 0', fontSize: '9px', color: '#999' }}>
              No hearings today
            </div>
          ) : (
            <ul className="cases">
              {cases.map((c) => (
                <li key={c.sr} className="case-row">
                  <span className="sr">{c.sr}.</span>
                  <span className="court">{getCourtShortLabel(c.court)}</span>
                  <span className="sep">–</span>
                  <span className="caseno">{formatCaseNumber(c.caseNumber, c.caseYear)}</span>
                  <span className="sep">–</span>
                  <span className="parties">{shortName(c.plaintiff)} / {shortName(c.defendant)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="footer">
            {cases.length} matter{cases.length !== 1 ? 's' : ''} &nbsp;|&nbsp; {displayDate}
          </div>
        </div>
      </div>
    </>
  )
}
