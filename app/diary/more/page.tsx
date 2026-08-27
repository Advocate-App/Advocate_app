'use client'

import Link from 'next/link'
import { User, Send, Users, Building2, Briefcase, ChevronRight } from 'lucide-react'

const MORE_ITEMS = [
  { href: '/diary/profile', label: 'Profile', description: 'Your name, enrollment, chamber details.', icon: User },
  { href: '/diary/empanelment', label: 'Empanelment', description: 'Outreach to organisations for empanelment.', icon: Send },
  { href: '/diary/clients', label: 'My Clients', description: 'Everyone you represent, in one list.', icon: Users },
  { href: '/diary/courts', label: 'My Courts', description: 'Courts you appear in, and their short names.', icon: Building2 },
  { href: '/diary/more/companies', label: 'Company Cases', description: 'Pick a company, see its cases — filter, print, export.', icon: Briefcase },
]

export default function MorePage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>
        More
      </h1>
      <p className="text-sm text-gray-400 mb-6">Profile, empanelment, clients and courts.</p>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {MORE_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#eef2f6' }}>
                <Icon className="w-5 h-5" style={{ color: '#1e3a5f' }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                <p className="text-xs text-gray-400 truncate">{item.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
