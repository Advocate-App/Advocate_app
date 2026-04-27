'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useSearchParams } from 'next/navigation'
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
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from 'lucide-react'
import Link from 'next/link'

interface Organization {
  id: string
  organization_name: string
  segment: string
  priority: string
  target_contact_role: string | null
  empanelment_process: string | null
  contact_email: string | null
}

interface ApplicationRecord {
  id: string
  organization_id: string
  draft_subject: string
  draft_body: string
  status: string
  application_method: string | null
  application_sent_at: string | null
  created_at: string
  updated_at: string
}

interface StatusEntry {
  status: string
  timestamp: string
}

interface EmailRecord {
  id: string
  application_id: string
  direction: 'sent' | 'received'
  email_type: string | null
  from_email: string
  to_email: string
  subject: string
  body: string
  gmail_message_id: string | null
  gmail_thread_id: string | null
  sent_at: string
  comment: string | null
}

export default function DraftApplicationPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const orgId = params.orgId as string
  const advocateId = searchParams.get('advocate') || ''

  const [org, setOrg] = useState<Organization | null>(null)
  const [application, setApplication] = useState<ApplicationRecord | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusHistory, setStatusHistory] = useState<StatusEntry[]>([])
  const [emailThread, setEmailThread] = useState<EmailRecord[]>([])
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set())
  const [emailComments, setEmailComments] = useState<Record<string, string>>({})
  const [savingComment, setSavingComment] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSendForm, setShowSendForm] = useState(false)
  const [sendMethod, setSendMethod] = useState<'email' | 'physical' | 'online_portal'>('email')
  const [sentDate, setSentDate] = useState(new Date().toISOString().split('T')[0])
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Run schema migration once so notes + comment columns exist
  useEffect(() => {
    fetch('/api/empanelment/setup', { method: 'POST' }).catch(() => {})
  }, [])

  const loadData = useCallback(async () => {
    const supabase = createClient()

    const { data: orgData } = await supabase
      .from('target_organizations')
      .select('*')
      .eq('id', orgId)
      .single()

    if (orgData) setOrg(orgData)

    let appQuery = supabase
      .from('applications')
      .select('*')
      .eq('organization_id', orgId)
    if (advocateId) appQuery = appQuery.eq('advocate_id', advocateId)
    const { data: appData } = await appQuery.single()

    if (appData) {
      setApplication(appData)
      setSubject(appData.draft_subject || '')
      setBody(appData.draft_body || '')
      setNotes((appData as unknown as { notes?: string }).notes || '')

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

      // Load email thread
      const { data: emails } = await supabase
        .from('application_emails')
        .select('*')
        .eq('application_id', appData.id)
        .order('sent_at', { ascending: true })

      if (emails) {
        setEmailThread(emails as EmailRecord[])
        // Pre-populate comments map
        const comments: Record<string, string> = {}
        for (const e of emails as EmailRecord[]) {
          comments[e.id] = e.comment || ''
        }
        setEmailComments(comments)
      }
    }

    setLoading(false)
  }, [orgId, advocateId])

  useEffect(() => {
    loadData()
  }, [loadData])

  function toggleEmail(id: string) {
    setExpandedEmails(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function saveEmailComment(emailId: string) {
    setSavingComment(emailId)
    const supabase = createClient()
    await supabase
      .from('application_emails')
      .update({ comment: emailComments[emailId] || '' })
      .eq('id', emailId)
    setSavingComment(null)
  }

  async function generateDraft() {
    setGenerating(true)
    setMessage(null)
    try {
      const res = await fetch('/api/empanelment/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId, advocateId }),
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
      const { error } = await supabase
        .from('applications')
        .update({
          draft_subject: subject,
          draft_body: body,
          status: 'drafted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', application.id)

      if (error) {
        setMessage({ type: 'error', text: 'Failed to save: ' + error.message })
      } else {
        await supabase.from('application_status_history').insert({
          application_id: application.id,
          status: 'drafted',
        })
        setMessage({ type: 'success', text: 'Draft saved.' })
        await loadData()
      }
    } else {
      const { data: newApp, error } = await supabase
        .from('applications')
        .insert({
          organization_id: orgId,
          advocate_id: advocateId || null,
          draft_subject: subject,
          draft_body: body,
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

    const sentAt = sentDate
      ? new Date(sentDate + 'T12:00:00').toISOString()
      : new Date().toISOString()

    const { error } = await supabase
      .from('applications')
      .update({
        status: 'sent',
        application_method: sendMethod,
        application_sent_at: sentAt,
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

      // Log the sent email into the thread so it appears immediately
      if (sendMethod === 'email' && org?.contact_email) {
        await supabase.from('application_emails').insert({
          application_id: application.id,
          direction: 'sent',
          email_type: 'initial',
          from_email: 'jainavi.aj@gmail.com',
          to_email: org.contact_email,
          subject: subject || application.draft_subject,
          body: body || application.draft_body,
          sent_at: sentAt,
        })
      }

      setMessage({ type: 'success', text: 'Marked as sent.' })
      setShowSendForm(false)
      await loadData()
    }
    setSaving(false)
  }

  async function saveNotes() {
    if (!application) return
    setSavingNotes(true)
    const supabase = createClient()
    await supabase
      .from('applications')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', application.id)
    setSavingNotes(false)
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
    followup_1_sent: 'Follow-up 1 Sent',
    followup_2_sent: 'Follow-up 2 Sent',
    under_review: 'Under Review',
    empanelled: 'Empanelled',
  }

  const EMAIL_TYPE_LABELS: Record<string, string> = {
    initial: 'Application',
    followup_1: 'Follow-up 1',
    followup_2: 'Follow-up 2',
    reply: 'Their Reply',
    acknowledgment: 'Our Acknowledgment',
  }

  // If no emails logged but application was sent, show a fallback card
  const showFallbackEmail =
    emailThread.length === 0 &&
    application &&
    application.application_sent_at &&
    application.draft_body

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
              {org.organization_name}
            </h1>
            <div className="flex flex-wrap gap-2 text-sm text-gray-500">
              <span className="capitalize">{org.segment}</span>
              {org.target_contact_role && (
                <>
                  <span className="text-gray-300">|</span>
                  <span>Contact: {org.target_contact_role}</span>
                </>
              )}
              {org.contact_email && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" />
                    {org.contact_email}
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

      {/* Email Thread */}
      {(emailThread.length > 0 || showFallbackEmail) && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}
          >
            Email Thread
          </h2>

          <div className="space-y-3">
            {/* Actual logged emails */}
            {emailThread.map((email) => {
              const isSent = email.direction === 'sent'
              const isExpanded = expandedEmails.has(email.id)
              const typeLabel = EMAIL_TYPE_LABELS[email.email_type || ''] || email.email_type || (isSent ? 'Sent' : 'Received')
              const dateStr = new Date(email.sent_at).toLocaleString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })

              return (
                <div
                  key={email.id}
                  className="rounded-lg border overflow-hidden"
                  style={{
                    borderColor: isSent ? '#bfdbfe' : '#bbf7d0',
                    background: isSent ? '#f0f7ff' : '#f0fdf4',
                  }}
                >
                  {/* Header — always visible */}
                  <button
                    onClick={() => toggleEmail(email.id)}
                    className="w-full flex items-start gap-3 p-3 text-left hover:brightness-95 transition-all"
                  >
                    <span
                      className="shrink-0 mt-0.5 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide"
                      style={{
                        background: isSent ? '#1e3a5f' : '#16a34a',
                        color: '#fff',
                      }}
                    >
                      {isSent ? 'We Sent' : 'They Replied'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold" style={{ color: isSent ? '#1e3a5f' : '#166534' }}>
                          {typeLabel}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0">{dateStr}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {isSent ? `To: ${email.to_email}` : `From: ${email.from_email}`}
                      </p>
                      {!isExpanded && (
                        <p className="text-xs text-gray-400 truncate mt-0.5 italic">
                          {email.subject}
                        </p>
                      )}
                    </div>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
                      : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
                    }
                  </button>

                  {/* Body — shown when expanded */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3">
                      <div className="text-xs text-gray-500">
                        <span className="font-medium">Subject:</span> {email.subject}
                      </div>
                      <pre
                        className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed border-t pt-3"
                        style={{ borderColor: isSent ? '#bfdbfe' : '#bbf7d0', fontFamily: 'Georgia, serif' }}
                      >
                        {email.body}
                      </pre>

                      {/* Comment box */}
                      <div
                        className="mt-3 pt-3 border-t space-y-2"
                        style={{ borderColor: isSent ? '#bfdbfe' : '#bbf7d0' }}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                          <MessageSquare className="w-3.5 h-3.5" />
                          Your Comment / Note on this email
                        </div>
                        <textarea
                          value={emailComments[email.id] || ''}
                          onChange={e =>
                            setEmailComments(prev => ({ ...prev, [email.id]: e.target.value }))
                          }
                          rows={2}
                          placeholder="e.g. They asked for additional docs. Called on 20 Apr — positive response."
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] text-gray-700 bg-white"
                        />
                        <button
                          onClick={() => saveEmailComment(email.id)}
                          disabled={savingComment === email.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                          style={{ background: '#1e3a5f' }}
                        >
                          {savingComment === email.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Save className="w-3 h-3" />
                          }
                          {savingComment === email.id ? 'Saving...' : 'Save Comment'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Fallback: old application with no logged emails */}
            {showFallbackEmail && application && (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: '#bfdbfe', background: '#f0f7ff' }}>
                <button
                  onClick={() => toggleEmail('fallback')}
                  className="w-full flex items-start gap-3 p-3 text-left hover:brightness-95 transition-all"
                >
                  <span className="shrink-0 mt-0.5 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide" style={{ background: '#1e3a5f', color: '#fff' }}>
                    We Sent
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold" style={{ color: '#1e3a5f' }}>Application (Initial)</span>
                      <span className="text-xs text-gray-400">
                        {new Date(application.application_sent_at!).toLocaleString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5 italic">{application.draft_subject}</p>
                  </div>
                  {expandedEmails.has('fallback')
                    ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
                  }
                </button>
                {expandedEmails.has('fallback') && (
                  <div className="px-4 pb-4 space-y-2">
                    <div className="text-xs text-gray-500">
                      <span className="font-medium">Subject:</span> {application.draft_subject}
                    </div>
                    <pre
                      className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed border-t pt-3"
                      style={{ borderColor: '#bfdbfe', fontFamily: 'Georgia, serif' }}
                    >
                      {application.draft_body}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
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

      {/* Notes / call log */}
      {application && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
          <h2 className="text-lg font-semibold" style={{ color: '#1e3a5f', fontFamily: 'Georgia, serif' }}>
            Notes &amp; Call Log
          </h2>
          <p className="text-xs text-gray-400">Track phone calls, WhatsApp conversations, contacts, or anything useful about this organisation.</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={4}
            placeholder="e.g. Called on 12 Apr — spoke to Mr. Sharma, asked to resend on legal@company.com. WhatsApp also works."
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f] text-gray-800"
          />
          <button
            onClick={saveNotes}
            disabled={savingNotes}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#1e3a5f' }}
          >
            {savingNotes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {savingNotes ? 'Saving...' : 'Save Notes'}
          </button>
        </div>
      )}

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
