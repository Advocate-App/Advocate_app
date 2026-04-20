'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Sparkles,
  Save,
  SendHorizonal,
  CheckCircle2,
  Loader2,
  Building2,
  Mail,
  Clock,
} from 'lucide-react'
import Link from 'next/link'

interface Organization {
  id: string
  name: string
  segment: string
  priority: string
  contact_role: string | null
  empanelment_process: string | null
  email: string | null
}

interface ApplicationRecord {
  id: string
  organization_id: string
  subject: string
  body: string
  status: string
  send_method: string | null
  sent_date: string | null
  created_at: string
  updated_at: string
}

interface StatusEntry {
  status: string
  timestamp: string
}

export default function DraftApplicationPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  const [org, setOrg] = useState<Organization | null>(null)
  const [application, setApplication] = useState<ApplicationRecord | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusHistory, setStatusHistory] = useState<StatusEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showSendForm, setShowSendForm] = useState(false)
  const [sendMethod, setSendMethod] = useState<'email' | 'physical' | 'online_portal'>('email')
  const [sentDate, setSentDate] = useState(new Date().toISOString().split('T')[0])
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadData = useCallback(async () => {
    const supabase = createClient()

    const { data: orgData } = await supabase
      .from('target_organizations')
      .select('*')
      .eq('id', orgId)
      .single()

    if (orgData) setOrg(orgData)

    const { data: appData } = await supabase
      .from('applications')
      .select('*')
      .eq('organization_id', orgId)
      .single()

    if (appData) {
      setApplication(appData)
      setSubject(appData.subject || '')
      setBody(appData.body || '')
      // Load status history
      const { data: history } = await supabase
        .from('application_status_history')
        .select('status, created_at')
        .eq('application_id', appData.id)
        .order('created_at', { ascending: true })

      if (history) {
        setStatusHistory(
          history.map((h: { status: string; created_at: string }) => ({
            status: h.status,
            timestamp: h.created_at,
          }))
        )
      }
    }

    setLoading(false)
  }, [orgId])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function generateDraft() {
    setGenerating(true)
    setMessage(null)
    try {
      const res = await fetch('/api/empanelment/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId }),
      })
      const data = await res.json()
      if (data.error) {
        setMessage({ type: 'error', text: data.error })
      } else {
        setSubject(data.subject)
        setBody(data.body)
        setMessage({ type: 'success', text: 'Draft generated successfully.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to generate draft.' })
    }
    setGenerating(false)
  }

  async function saveDraft() {
    if (!subject.trim() || !body.trim()) {
      setMessage({ type: 'error', text: 'Subject and body are required.' })
      return
    }
    setSaving(true)
    setMessage(null)
    const supabase = createClient()

    if (application) {
      // Update existing
      const { error } = await supabase
        .from('applications')
        .update({
          subject,
          body,
          status: 'drafted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', application.id)

      if (error) {
        setMessage({ type: 'error', text: 'Failed to save: ' + error.message })
      } else {
        // Add status history entry
        await supabase.from('application_status_history').insert({
          application_id: application.id,
          status: 'drafted',
        })
        setMessage({ type: 'success', text: 'Draft saved.' })
        await loadData()
      }
    } else {
      // Create new
      const { data: newApp, error } = await supabase
        .from('applications')
        .insert({
          organization_id: orgId,
          subject,
          body,
          status: 'drafted',
        })
        .select()
        .single()

      if (error) {
        setMessage({ type: 'error', text: 'Failed to save: ' + error.message })
      } else if (newApp) {
        await supabase.from('application_status_history').insert({
          application_id: newApp.id,
          status: 'drafted',
        })
        setMessage({ type: 'success', text: 'Draft created.' })
        await loadData()
      }
    }
    setSaving(false)
  }

  async function markReadyToSend() {
    if (!application) return
    setSaving(true)
    setMessage(null)
    const supabase = createClient()

    const { error } = await supabase
      .from('applications')
      .update({ status: 'ready_to_send', updated_at: new Date().toISOString() })
      .eq('id', application.id)

    if (error) {
      setMessage({ type: 'error', text: 'Failed to update status.' })
    } else {
      await supabase.from('application_status_history').insert({
        application_id: application.id,
        status: 'ready_to_send',
      })
      setMessage({ type: 'success', text: 'Marked as ready to send.' })
      await loadData()
    }
    setSaving(false)
  }

  async function markAsSent() {
    if (!application) return
    setSaving(true)
    setMessage(null)
    const supabase = createClient()

    const { error } = await supabase
      .from('applications')
      .update({
        status: 'sent',
        send_method: sendMethod,
        sent_date: sentDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', application.id)

    if (error) {
      setMessage({ type: 'error', text: 'Failed to mark as sent.' })
    } else {
      await supabase.from('application_status_history').insert({
        application_id: application.id,
        status: 'sent',
      })
      setMessage({ type: 'success', text: 'Marked as sent.' })
      setShowSendForm(false)
      await loadData()
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#1e3a5f' }} />
      </div>
    )
  }

  if (!org) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <p className="text-gray-500">Organization not found.</p>
        <Link href="/diary/empanelment" className="text-sm mt-4 inline-block" style={{ color: '#1e3a5f' }}>
          Back to Empanelment
        </Link>
      </div>
    )
  }

  const STATUS_LABELS: Record<string, string> = {
    drafted: 'Drafted',
    ready_to_send: 'Ready to Send',
    sent: 'Sent',
    under_review: 'Under Review',
    empanelled: 'Empanelled',
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back */}
      <Link
        href="/diary/empanelment"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Empanelment
      </Link>

      {/* Org info card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: '#e8eef5' }}
          >
            <Building2 className="w-6 h-6" style={{ color: '#1e3a5f' }} />
          </div>
          <div className="space-y-1 flex-1">
            <h1
              className="text-xl font-bold"
              style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}
            >
              {org.name}
            </h1>
            <div className="flex flex-wrap gap-2 text-sm text-gray-500">
              <span className="capitalize">{org.segment}</span>
              {org.contact_role && (
                <>
                  <span className="text-gray-300">|</span>
                  <span>Contact: {org.contact_role}</span>
                </>
              )}
              {org.email && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" />
                    {org.email}
                  </span>
                </>
              )}
            </div>
            {org.empanelment_process && (
              <p className="text-sm text-gray-400 mt-1">
                Process: {org.empanelment_process}
              </p>
            )}
            {application && (
              <div className="mt-2">
                <span
                  className="inline-block px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ background: '#dbeafe', color: '#1e40af' }}
                >
                  Status: {STATUS_LABELS[application.status] || application.status}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className="rounded-lg p-3 text-sm"
          style={{
            background: message.type === 'success' ? '#d1fae5' : '#fee2e2',
            color: message.type === 'success' ? '#065f46' : '#991b1b',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Draft editor */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2
            className="text-lg font-semibold"
            style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}
          >
            Application Draft
          </h2>
          <button
            onClick={generateDraft}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#1e3a5f' }}
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {generating ? 'Generating...' : 'Generate Draft'}
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Application subject line..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Application body..."
              rows={18}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f] leading-relaxed"
              style={{ fontFamily: 'Georgia, serif' }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            onClick={saveDraft}
            disabled={saving || (!subject.trim() && !body.trim())}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#1e3a5f' }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Draft
          </button>

          {application && application.status === 'drafted' && (
            <button
              onClick={markReadyToSend}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: '#7c3aed' }}
            >
              <SendHorizonal className="w-4 h-4" />
              Mark Ready to Send
            </button>
          )}

          {application &&
            (application.status === 'ready_to_send' || application.status === 'drafted') && (
              <button
                onClick={() => setShowSendForm(!showSendForm)}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: '#059669' }}
              >
                <CheckCircle2 className="w-4 h-4" />
                Mark as Sent
              </button>
            )}
        </div>

        {/* Send form */}
        {showSendForm && (
          <div className="border border-gray-200 rounded-lg p-4 mt-3 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Sending Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Method</label>
                <select
                  value={sendMethod}
                  onChange={(e) => setSendMethod(e.target.value as 'email' | 'physical' | 'online_portal')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                >
                  <option value="email">Email</option>
                  <option value="physical">Physical / Courier</option>
                  <option value="online_portal">Online Portal</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date Sent</label>
                <input
                  type="date"
                  value={sentDate}
                  onChange={(e) => setSentDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                />
              </div>
            </div>
            <button
              onClick={markAsSent}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: '#059669' }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Confirm Sent
            </button>
          </div>
        )}
      </div>

      {/* Status history */}
      {statusHistory.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}
          >
            Status History
          </h2>
          <div className="space-y-3">
            {statusHistory.map((entry, i) => (
              <div key={i} className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                <div>
                  <span className="text-sm font-medium text-gray-700">
                    {STATUS_LABELS[entry.status] || entry.status}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">
                    {new Date(entry.timestamp).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
