'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ProfilePage() {
  const [profile, setProfile] = useState({
    full_name: '',
    bci_enrollment: '',
    chamber_address: 'Chamber No. 39, District Court, Udaipur',
    phone: '',
    advocate_id_ecourts: '',
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('advocates')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (data) {
        setProfile({
          full_name: data.full_name || '',
          bci_enrollment: data.bci_enrollment || '',
          chamber_address: data.chamber_address || '',
          phone: data.phone || '',
          advocate_id_ecourts: data.advocate_id_ecourts || '',
        })
      }
    }
    load()
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('advocates')
      .update(profile)
      .eq('user_id', user.id)

    if (error) {
      setMessage('Error saving: ' + error.message)
    } else {
      setMessage('Profile saved successfully')
    }
    setSaving(false)
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-800 mb-6" style={{ fontFamily: 'Georgia, serif' }}>
        Advocate Profile
      </h2>

      <form onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input
            type="text"
            value={profile.full_name}
            onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">BCI Enrollment Number</label>
          <input
            type="text"
            value={profile.bci_enrollment}
            onChange={(e) => setProfile({ ...profile, bci_enrollment: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
            placeholder="e.g., R/7238/2025"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Chamber Address</label>
          <input
            type="text"
            value={profile.chamber_address}
            onChange={(e) => setProfile({ ...profile, chamber_address: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            value={profile.phone}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">eCourts Advocate ID</label>
          <input
            type="text"
            value={profile.advocate_id_ecourts}
            onChange={(e) => setProfile({ ...profile, advocate_id_ecourts: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
          />
          <p className="text-xs text-gray-400 mt-1">
            Your eCourts AdvocateID will be used for deep-linking — not stored on any external server.
          </p>
        </div>

        {message && (
          <div className={`p-3 rounded-lg text-sm ${message.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2 rounded-lg text-white font-medium disabled:opacity-50"
          style={{ background: '#1e3a5f' }}
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>
    </div>
  )
}
