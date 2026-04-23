'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays,
  Briefcase,
  Copy,
  Send,
  User,
  Menu,
  X,
  LogOut,
  LayoutGrid,
  FolderOpen,
} from 'lucide-react'

const navItems = [
  { href: '/diary', label: "Today's Diary", icon: CalendarDays },
  { href: '/diary/file-list', label: 'File Pull List', icon: FolderOpen },
  { href: '/diary/search', label: 'All Cases', icon: Briefcase },
  { href: '/diary/copying', label: 'Copying', icon: Copy },
  { href: '/diary/empanelment', label: 'Empanelment', icon: Send },
  { href: '/diary/profile', label: 'Profile', icon: User },
]

const SSO_KEY = '94c1a5172f3a7c1c7e766d1970db46fa41d3dbeb32cdcab7'

const myApps = [
  { name: 'Advocate Hub', baseUrl: 'https://advocate-diary-hub-orpin.vercel.app', loginPath: '/auth/auto-login', defaultPath: '/diary', color: '#1e3a5f', icon: '&#9878;', current: true },
  { name: 'Udaipur Sports Club', baseUrl: 'https://advocate-diary-hub-orpin.vercel.app', loginPath: '/api/sso-usc', defaultPath: '/dashboard', color: '#f97316', icon: '&#9917;', current: false },
  { name: 'Metro ERP', baseUrl: 'https://metro-erp.vercel.app', loginPath: '/api/auth/auto-login', defaultPath: '/dashboard', color: '#059669', icon: '&#9879;', current: false },
  { name: 'Warehouse Hub', baseUrl: 'https://udaipur-warehouse-hub-sandy.vercel.app', loginPath: '/auth/auto-login', defaultPath: '/admin', color: '#7c3aed', icon: '&#9889;', current: false },
]

function getAppUrl(app: typeof myApps[0]): string {
  if (app.current) return app.baseUrl + app.defaultPath
  return `${app.baseUrl}${app.loginPath}?key=${SSO_KEY}&redirect=${app.defaultPath}`
}

export default function DiaryLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [advocateName, setAdvocateName] = useState('')
  const [appSwitcherOpen, setAppSwitcherOpen] = useState(false)
  const pathname = usePathname()
  const appSwitcherRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('advocates')
          .select('full_name')
          .eq('user_id', user.id)
          .limit(1)
          .single()
        if (data) setAdvocateName(data.full_name)
        else setAdvocateName(user.email || '')
      }
    }
    loadProfile()
  }, [])

  // Close app switcher on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (appSwitcherRef.current && !appSwitcherRef.current.contains(e.target as Node)) {
        setAppSwitcherOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
          {navItems.map((item) => {
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
            {/* App Switcher */}
            <div ref={appSwitcherRef} className="relative">
              <button
                onClick={() => setAppSwitcherOpen(!appSwitcherOpen)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                title="Switch App"
              >
                <LayoutGrid className="w-5 h-5 text-gray-500" />
              </button>

              {appSwitcherOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">My Apps</p>
                  </div>
                  <div className="p-2">
                    {myApps.map((app) => (
                      <a
                        key={app.name}
                        href={getAppUrl(app)}
                        target="_self"
                        rel="noopener noreferrer"
                        onClick={() => setAppSwitcherOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          app.current ? 'bg-gray-50 font-medium' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-lg"
                          style={{ background: app.color }}
                          dangerouslySetInnerHTML={{ __html: app.icon }}
                        />
                        <div>
                          <p className="text-gray-800">{app.name}</p>
                          {app.current && (
                            <p className="text-[10px] text-green-600 font-medium">Currently here</p>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

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
