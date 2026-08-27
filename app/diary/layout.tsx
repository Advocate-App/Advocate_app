'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import UpdateBanner from './UpdateBanner'
import {
  CalendarDays,
  Briefcase,
  Copy,
  Menu,
  X,
  LogOut,
  FolderOpen,
  Clock,
  CheckSquare,
  Search,
  MoreHorizontal,
  Building2,
} from 'lucide-react'

const navItems = [
  { href: '/diary', label: "Today's Diary", icon: CalendarDays },
  { href: '/diary/find', label: 'Find Case', icon: Search },
  { href: '/diary/pending', label: 'Pending Dates', icon: Clock },
  { href: '/diary/copying', label: 'Copying', icon: Copy },
  { href: '/diary/closed', label: 'Closed Cases', icon: CheckSquare },
  { href: '/diary/search', label: 'All Cases', icon: Briefcase },
  { href: '/diary/file-list', label: 'File Pull List', icon: FolderOpen },
  { href: '/diary/more/companies', label: 'Company Cases', icon: Building2 },
  { href: '/diary/more', label: 'More', icon: MoreHorizontal },
]

// Profile, Empanelment, My Clients, My Courts all now live inside the
// single "More" hub page, so the sidebar highlights that entry while
// you're on any of them, not just on /diary/more itself. Company Cases
// has its own direct nav entry now, so it's excluded here — otherwise
// both it and "More" would light up at once.
const MORE_PREFIXES = ['/diary/more', '/diary/profile', '/diary/empanelment', '/diary/clients', '/diary/courts']
const MORE_EXCLUDE_PREFIX = '/diary/more/companies'

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
      } else {
        // No session (expired/invalid) — used to just sit here silently
        // with nothing loaded, which is exactly the "app doesn't load,
        // have to log out and back in manually" complaint. Send straight
        // to login instead of leaving a blank shell.
        router.replace('/login')
      }
    }
    loadProfile()

    // A session that goes bad *while* the app is open (expired refresh
    // token, signed out in another tab) used to leave everything quietly
    // broken too — this catches that live instead of only checking once
    // on load.
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
        router.replace('/login')
      }
    })
    return () => subscription.unsubscribe()
  }, [router])

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
            const isActive = item.href === '/diary/more'
              ? !pathname.startsWith(MORE_EXCLUDE_PREFIX) && MORE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
              : pathname === item.href || (item.href !== '/diary' && pathname.startsWith(item.href))
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
      <UpdateBanner />
    </div>
  )
}
