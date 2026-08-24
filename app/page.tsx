'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { EB_Garamond, Archivo } from 'next/font/google'
import { createClient } from '@/lib/supabase/client'

const serif = EB_Garamond({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], variable: '--font-serif' })
const sans = Archivo({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' })

const GOLD = '#8a6a34'
const INK = '#1b2a3a'
const CREAM = '#f6f3ed'
const CREAM_DARK = '#eeeae1'

const STATS = [
  { value: '34', label: 'Years at the Bar' },
  { value: '18+', label: 'Insurance Panels' },
  { value: '07', label: 'Practice Areas' },
]

const PRACTICE = [
  { num: '01', title: 'Civil Litigation', body: 'Suits, appeals, recovery and injunction matters through trial and appellate stages.' },
  { num: '02', title: 'Property & Land', body: 'Title, partition, possession, tenancy and land-record disputes.' },
  { num: '03', title: 'MACT & Insurance Claims', body: 'Motor accident claims before the Tribunal, and liability and policy matters for empanelled insurers.' },
  { num: '04', title: 'Consumer Cases', body: 'Representation before District and State Consumer Commissions.' },
  { num: '05', title: 'Commercial & Corporate', body: 'Commercial suits, contracts, recovery, documentation and pre-litigation advice for firms.' },
  { num: '06', title: 'Arbitration', body: 'Arbitral proceedings, references and related applications before court.' },
  { num: '07', title: 'Labour & Service', body: 'Industrial disputes, workplace claims and service matters.' },
]

const MILESTONES = [
  { year: '1992', title: 'Enrolled and began practice', body: 'Started at Udaipur District Court, taking civil and property briefs.' },
  { year: 'Over the years', title: 'Empanelled with 18+ insurance companies', body: 'Standing panel counsel for insurers in motor-accident, liability and property claims — the longest-running strand of the practice.' },
  { year: 'Repeatedly', title: 'Company-level awards', body: 'Recognised by empanelling companies for case handling and results.' },
  { year: 'Ongoing', title: 'Community recognition', body: 'Honoured on several occasions by the Jain community of Udaipur for social and community service.' },
  { year: 'Today', title: 'Chamber No. 39, Court Campus', body: 'Still appearing personally in every matter he accepts.' },
]

const AWARDS = [
  { title: '18+ insurance empanelments', body: 'Panel counsel across more than eighteen insurance companies.' },
  { title: 'Company-level awards', body: 'Multiple recognitions from empanelling companies for case performance.' },
  { title: 'Jain community honours', body: 'Repeated recognition for social and community service in Udaipur.' },
]

function EnterAppButton({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  const router = useRouter()
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => setLoggedIn(!!data.session))
  }, [])

  const label = loggedIn ? 'Take me to the app' : 'Login'
  const dest = loggedIn ? '/diary' : '/login'

  const base = 'inline-block px-7 py-3.5 text-[12.5px] tracking-[0.16em] uppercase transition-colors'
  const style =
    variant === 'dark'
      ? { background: INK, color: CREAM }
      : { border: `1px solid rgba(246,243,237,0.4)`, color: CREAM }

  return (
    <button
      onClick={() => router.push(dest)}
      className={`${base} hover:!bg-[#8a6a34]`}
      style={style}
    >
      {label} →
    </button>
  )
}

export default function RatneshTributePage() {
  return (
    <div
      className={`${serif.variable} ${sans.variable}`}
      style={{ background: CREAM, color: INK, fontFamily: 'var(--font-sans), Helvetica, Arial, sans-serif' }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between gap-6 px-[6vw] py-[22px] sticky top-0 z-20 backdrop-blur-md"
        style={{ borderBottom: '1px solid rgba(27,42,58,0.12)', background: 'rgba(246,243,237,0.92)' }}
      >
        <div style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 19, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
          Adv. R. K. Jain (Shah)
        </div>
        <nav className="hidden sm:flex gap-[30px] text-[12.5px] tracking-[0.14em] uppercase" style={{ color: 'rgba(27,42,58,0.66)' }}>
          <a href="#about" className="hover:!text-[#8a6a34]">About</a>
          <a href="#practice" className="hover:!text-[#8a6a34]">Practice</a>
          <a href="#milestones" className="hover:!text-[#8a6a34]">Record</a>
          <a href="#contact" className="hover:!text-[#8a6a34]">Contact</a>
        </nav>
        <EnterAppButton />
      </header>

      {/* Hero */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-[6vw] items-center px-[6vw] py-[9vh] lg:py-[10vh]">
        <div>
          <div className="text-[11.5px] tracking-[0.28em] uppercase mb-[34px]" style={{ color: GOLD }}>
            Advocate &nbsp;·&nbsp; Udaipur District Court &nbsp;·&nbsp; Since 1992
          </div>
          <h1
            className="font-medium leading-[1.04] tracking-[-0.015em] mb-4"
            style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 'clamp(42px,5.2vw,80px)' }}
          >
            Ratnesh Kumar Jain <span style={{ color: 'rgba(27,42,58,0.45)' }}>(Shah)</span>
          </h1>
          <div className="mb-[30px]" style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 19, letterSpacing: '0.1em', color: 'rgba(27,42,58,0.6)' }}>
            B.Sc., LL.B.
          </div>
          <p
            className="mb-10 max-w-[30em]"
            style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 'clamp(19px,1.5vw,24px)', lineHeight: 1.6, color: 'rgba(27,42,58,0.8)' }}
          >
            Civil, property, MACT, consumer, commercial and arbitration matters at Udaipur District Court — argued personally, one brief at a time, since 1992.
          </p>
          <div className="flex flex-wrap gap-3.5">
            <a
              href="tel:+919414164590"
              className="inline-block px-[30px] py-[15px] text-[12.5px] tracking-[0.16em] uppercase hover:!bg-[#8a6a34] transition-colors"
              style={{ background: INK, color: CREAM }}
            >
              Call Chambers
            </a>
            <a
              href="#milestones"
              className="inline-block px-[30px] py-[15px] text-[12.5px] tracking-[0.16em] uppercase hover:!border-[#8a6a34] hover:!text-[#8a6a34] transition-colors"
              style={{ border: '1px solid rgba(27,42,58,0.28)' }}
            >
              The Record
            </a>
          </div>
          <div
            className="grid grid-cols-3 gap-7 mt-16 pt-8"
            style={{ borderTop: '1px solid rgba(27,42,58,0.14)' }}
          >
            {STATS.map((s) => (
              <div key={s.label}>
                <div style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 38, lineHeight: 1 }}>{s.value}</div>
                <div className="text-[11px] tracking-[0.16em] uppercase mt-2.5" style={{ color: 'rgba(27,42,58,0.6)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative hidden lg:block">
          <div className="absolute" style={{ inset: '26px -26px -26px 26px', border: '1px solid rgba(138,106,52,0.45)' }} />
          <div className="relative overflow-hidden" style={{ aspectRatio: '4/5', background: INK }}>
            <Image
              src="/ratnesh/portrait.jpg"
              alt="Adv. Ratnesh Kumar Jain (Shah)"
              fill
              sizes="(max-width: 1024px) 0px, 45vw"
              style={{ objectFit: 'cover', objectPosition: '47% 22%', filter: 'saturate(0.62) contrast(1.04) brightness(0.97)' }}
              priority
            />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(27,42,58,0) 42%, rgba(27,42,58,0.62) 100%)' }} />
          </div>
        </div>

        {/* Mobile photo */}
        <div className="relative lg:hidden -mx-[6vw]">
          <div className="relative w-full" style={{ aspectRatio: '4/3', background: INK }}>
            <Image
              src="/ratnesh/portrait.jpg"
              alt="Adv. Ratnesh Kumar Jain (Shah)"
              fill
              sizes="100vw"
              style={{ objectFit: 'cover', objectPosition: '47% 22%', filter: 'saturate(0.62) contrast(1.04) brightness(0.97)' }}
            />
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="px-[6vw] py-[9vh]" style={{ background: CREAM_DARK, borderTop: '1px solid rgba(27,42,58,0.1)', borderBottom: '1px solid rgba(27,42,58,0.1)' }}>
        <div className="grid grid-cols-1 lg:grid-cols-[0.75fr_1.25fr] gap-[6vw] max-w-[1400px] mx-auto">
          <h2
            className="font-medium leading-[1.12] m-0"
            style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 'clamp(30px,3vw,46px)' }}
          >
            Thirty-four years in the same courtyard.
          </h2>
          <div>
            <p className="mb-[22px] max-w-[44em]" style={{ fontSize: 17, lineHeight: 1.85, color: 'rgba(27,42,58,0.82)' }}>
              Adv. Ratnesh Kumar Jain (Shah) has practised at Udaipur District Court since 1992. The work is ordinary in the best sense — title and possession, contracts and recovery, workplace claims, consumer and insurance disputes — and it is done the same way each time: read the file completely, advise plainly, and appear personally.
            </p>
            <p className="max-w-[44em]" style={{ fontSize: 17, lineHeight: 1.85, color: 'rgba(27,42,58,0.82)' }}>
              He is empanelled with more than eighteen insurance companies, which has made motor-accident, property and liability claims a steady part of the practice. Alongside it he has held recognition within the Jain community of Udaipur for social and community service.
            </p>
          </div>
        </div>
      </section>

      {/* Practice areas */}
      <section id="practice" className="px-[6vw] py-[9vh]">
        <div className="max-w-[1400px] mx-auto">
          <div className="text-[11.5px] tracking-[0.28em] uppercase mb-11" style={{ color: GOLD }}>Areas of Practice</div>
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {PRACTICE.map((p) => (
              <div
                key={p.num}
                className="px-8 pt-[38px] pb-11 hover:!bg-[#eeeae1] hover:!border-[#8a6a34]/50 transition-colors"
                style={{ background: CREAM, border: '1px solid rgba(27,42,58,0.16)' }}
              >
                <div className="mb-[22px]" style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 14, color: GOLD }}>{p.num}</div>
                <div className="mb-3.5" style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 26, lineHeight: 1.2 }}>{p.title}</div>
                <div style={{ fontSize: 14.5, lineHeight: 1.7, color: 'rgba(27,42,58,0.7)' }}>{p.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Milestones */}
      <section id="milestones" className="px-[6vw] pt-[9vh] pb-[10vh]" style={{ background: INK, color: '#f2ece1' }}>
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[0.75fr_1.25fr] gap-[6vw] mb-16">
            <div className="text-[11.5px] tracking-[0.28em] uppercase" style={{ color: '#c9a961' }}>The Record</div>
            <h2
              className="font-medium leading-[1.1] m-0 max-w-[22em]"
              style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 'clamp(30px,3.2vw,50px)' }}
            >
              Work that insurers, employers and families keep coming back for.
            </h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[0.75fr_1.25fr] gap-[6vw]">
            <div />
            <div>
              {MILESTONES.map((m) => (
                <div key={m.title} className="grid gap-9 py-[30px]" style={{ gridTemplateColumns: '150px 1fr', borderTop: '1px solid rgba(242,236,225,0.18)' }}>
                  <div style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 18, lineHeight: 1.4, color: '#c9a961' }}>{m.year}</div>
                  <div>
                    <div className="mb-2.5" style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 24, lineHeight: 1.3 }}>{m.title}</div>
                    <div className="max-w-[40em]" style={{ fontSize: 14.5, lineHeight: 1.75, color: 'rgba(242,236,225,0.66)' }}>{m.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Recognition */}
      <section className="px-[6vw] py-[9vh]">
        <div className="max-w-[1400px] mx-auto">
          <div className="text-[11.5px] tracking-[0.28em] uppercase mb-11" style={{ color: GOLD }}>Recognition</div>
          <div className="grid gap-9" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {AWARDS.map((a) => (
              <div key={a.title} className="pt-[22px]" style={{ borderTop: '1px solid rgba(27,42,58,0.2)' }}>
                <div className="mb-2.5" style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 21, lineHeight: 1.3 }}>{a.title}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'rgba(27,42,58,0.62)' }}>{a.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quote */}
      <section className="px-[6vw] pb-[9vh]">
        <blockquote className="max-w-[1400px] mx-auto py-14" style={{ borderTop: '1px solid rgba(27,42,58,0.14)', borderBottom: '1px solid rgba(27,42,58,0.14)' }}>
          <p
            className="italic mb-[26px] max-w-[34em]"
            style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 'clamp(24px,2.6vw,40px)', lineHeight: 1.35 }}
          >
            &ldquo;A case is won in the reading, long before it is argued.&rdquo;
          </p>
          <footer className="text-[11.5px] tracking-[0.2em] uppercase" style={{ color: 'rgba(27,42,58,0.6)' }}>
            — Adv. Ratnesh Kumar Jain (Shah)
          </footer>
        </blockquote>
      </section>

      {/* Contact */}
      <section id="contact" className="px-[6vw] pt-[9vh] pb-[10vh]" style={{ background: CREAM_DARK, borderTop: '1px solid rgba(27,42,58,0.1)' }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[6vw] max-w-[1400px] mx-auto">
          <div>
            <h2
              className="font-medium leading-[1.1] mb-6"
              style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 'clamp(30px,3.2vw,48px)' }}
            >
              Chambers are open by appointment.
            </h2>
            <p className="max-w-[32em]" style={{ fontSize: 16.5, lineHeight: 1.8, color: 'rgba(27,42,58,0.75)' }}>
              Call first and describe the matter briefly. Bring whatever you already hold — notices, orders, policy papers, agreements — to the first meeting.
            </p>
          </div>
          <div className="grid gap-6 content-start">
            <div className="pt-4" style={{ borderTop: '1px solid rgba(27,42,58,0.2)' }}>
              <div className="text-[11px] tracking-[0.18em] uppercase mb-2" style={{ color: 'rgba(27,42,58,0.55)' }}>Telephone</div>
              <div style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 22, lineHeight: 1.5 }}>
                <a href="tel:+919414164590" className="hover:!text-[#8a6a34]">94141 64590</a> &nbsp;·&nbsp; <a href="tel:+918290345901" className="hover:!text-[#8a6a34]">82903 45901</a>
              </div>
            </div>
            <div className="pt-4" style={{ borderTop: '1px solid rgba(27,42,58,0.2)' }}>
              <div className="text-[11px] tracking-[0.18em] uppercase mb-2" style={{ color: 'rgba(27,42,58,0.55)' }}>Email</div>
              <div style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 22, lineHeight: 1.5 }}>
                <a href="mailto:ratneshshah67@gmail.com" className="hover:!text-[#8a6a34]">ratneshshah67@gmail.com</a>
              </div>
            </div>
            <div className="pt-4" style={{ borderTop: '1px solid rgba(27,42,58,0.2)' }}>
              <div className="text-[11px] tracking-[0.18em] uppercase mb-2" style={{ color: 'rgba(27,42,58,0.55)' }}>Court Chamber</div>
              <div style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 22, lineHeight: 1.5 }}>Chamber No. 39, Court Campus, Udaipur</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-[6vw] py-[30px] flex flex-wrap gap-4 items-center justify-between text-[11.5px] tracking-[0.14em] uppercase" style={{ color: 'rgba(27,42,58,0.5)', borderTop: '1px solid rgba(27,42,58,0.12)' }}>
        <div>© {new Date().getFullYear()} Adv. Ratnesh Kumar Jain (Shah)</div>
        <div className="flex items-center gap-4">
          <span>Udaipur, Rajasthan</span>
          <EnterAppButton variant="light" />
        </div>
      </footer>
    </div>
  )
}
