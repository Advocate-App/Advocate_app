'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw, Loader2, Mail } from 'lucide-react'
import Link from 'next/link'

interface AccountStatus {
  ok: boolean
  error?: string
  loading: boolean
}

export default function GmailSettingsPage() {
  const [avi, setAvi] = useState<AccountStatus>({ ok: false, loading: true })
  const [ratnesh, setRatnesh] = useState<AccountStatus>({ ok: false, loading: true })

  useEffect(() => {
    checkStatus('avi')
    checkStatus('ratnesh')
  }, [])

  async function checkStatus(account: 'avi' | 'ratnesh') {
    const setter = account === 'avi' ? setAvi : setRatnesh
    setter(s => ({ ...s, loading: true }))
    try {
      const res = await fetch(`/api/gmail/status?account=${account}`)
      const data = await res.json()
      setter({ ok: data.ok, error: data.error, loading: false })
    } catch (e) {
      setter({ ok: false, error: 'Network error', loading: false })
    }
  }

  function reAuth(account: 'avi' | 'ratnesh') {
    window.location.href = `/api/gmail/authorize?account=${account}`
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href="/diary/empanelment"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Empanelment
      </Link>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-2">
        <div className="flex items-center gap-3">
          <Mail className="w-6 h-6" style={{ color: '#1e3a5f' }} />
          <h1 className="text-xl font-bold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>
            Gmail Settings
          </h1>
        </div>
        <p className="text-sm text-gray-500">
          Both Gmail accounts must be authorized for the app to send empanelment emails automatically.
          If an account shows "Not Connected", click Re-authorize to fix it.
        </p>
      </div>

      <AccountCard
        label="Avi Jain"
        email="jainavi.aj@gmail.com"
        status={avi}
        onRecheck={() => checkStatus('avi')}
        onReAuth={() => reAuth('avi')}
      />

      <AccountCard
        label="Ratnesh Kumar Jain Shah"
        email="ratneshshah67@gmail.com"
        status={ratnesh}
        onRecheck={() => checkStatus('ratnesh')}
        onReAuth={() => reAuth('ratnesh')}
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-1">
        <p className="font-semibold">If Re-authorize fails with "Error 400: redirect_uri_mismatch":</p>
        <p>The Google Cloud Console OAuth client for that account needs <code className="bg-amber-100 px-1 rounded">https://advocate-diary-hub.vercel.app/auth/google/callback</code> added as an authorized redirect URI.</p>
      </div>
    </div>
  )
}

function AccountCard({
  label,
  email,
  status,
  onRecheck,
  onReAuth,
}: {
  label: string
  email: string
  status: AccountStatus
  onRecheck: () => void
  onReAuth: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-gray-800">{label}</p>
          <p className="text-sm text-gray-500">{email}</p>
        </div>
        {status.loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-gray-400 mt-1 shrink-0" />
        ) : status.ok ? (
          <div className="flex items-center gap-1.5 text-green-600 text-sm font-medium shrink-0">
            <CheckCircle2 className="w-5 h-5" />
            Connected
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-red-600 text-sm font-medium shrink-0">
            <XCircle className="w-5 h-5" />
            Not Connected
          </div>
        )}
      </div>

      {!status.loading && !status.ok && status.error && (
        <p className="text-xs text-red-500 bg-red-50 rounded p-2">{status.error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onRecheck}
          disabled={status.loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${status.loading ? 'animate-spin' : ''}`} />
          Recheck
        </button>
        <button
          onClick={onReAuth}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white hover:opacity-90"
          style={{ background: '#1e3a5f' }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Re-authorize Gmail
        </button>
      </div>
    </div>
  )
}
