'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  CalendarDays,
  Briefcase,
  Copy,
  Send,
  User,
  Menu,
  X,
  LogOut,
  FolderOpen,
  Building2,
  Users,
  Clock,
  CheckSquare,
  Search,
} from 'lucide-react'

const navItems = [
  { href: '/diary', label: "Today's Diary", icon: CalendarDays },
  { href: '/diary/find', label: 'Find Case', icon: Search },
  { href: '/diary/pending', label: 'Pending Dates', icon: Clock },
  { href: '/diary/file-list', label: 'File Pull List', icon: FolderOpen },
  { href: '/diary/closed', label: 'Closed Cases', icon: CheckSquare },
  { href: '/diary/search', label: 'All Cases', icon: Briefcase },
  { href: '/diary/courts', label: 'My Courts', icon: Building2 },
  { href: '/diary/clients', label: 'My Clients', icon: Users },
  { href: '/diary/copying', label: 'Copying', icon: Copy },
  { href: '/diary/empanelment', label: 'Empanelment', icon: Send },
  { href: '/diary/profile', label: 'Profile', icon: User },
]

// Junior advocates only get the diary + case lookup — everything else
// (client lists, courts, empanelment, filters/reports, editing) is off
// limits. They can still open a case (to set a hearing date) via a link
// from either of those, just not the bare case list or edit form.
const JUNIOR_ALLOWED_PREFIXES = ['/diary/find']
function isAllowedForJunior(pathname: string): boolean {
  if (pathname === '/diary') return true
  if (pathname.startsWith('/diary/date/')) return true
  if (/^\/diary\/cases\/[^/]+$/.test(pathname)) return true // case detail only
  return JUNIOR_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export default function DiaryLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [advocateName, setAdvocateName] = useState('')
  const [role, setRole] = useState<'advocate' | 'junior' | null>(null)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('advocates')
          .select('full_name, role')
          .eq('user_id', user.id)
          .limit(1)
          .single()
        if (data) {
          setAdvocateName(data.full_name)
          setRole((data.role as 'advocate' | 'junior') || 'advocate')
        } else {
          setAdvocateName(user.email || '')
          setRole('advocate')
        }
      }
    }
    loadProfile()
  }, [])

  // Bounce juniors out of anything outside their allowed pages
  useEffect(() => {
    if (role === 'junior' && !isAllowedForJunior(pathname)) {
      router.replace('/diary')
    }
  }, [role, pathname, router])

  const visibleNavItems = role === 'junior'
    ? navItems.filter((item) => item.href === '/diary' || item.href === '/diary/find')
    : navItems

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <h1 className="text-xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>
            Advocate Diary
          </h1>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <nav className="p-4 space-y-1">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/diary' && pathname.startsWith(item.href))
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                style={isActive ? { background: '#1e3a5f' } : undefined}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-6 h-6 text-gray-600" />
          </button>

          <div className="lg:flex-1" />

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 hidden sm:block">{advocateName}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6" style={{ background: '#fafaf7' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
