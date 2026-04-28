'use client'

import DiaryView from './components/DiaryView'

function getTodayIST(): Date {
  const now = new Date()
  const istMs = now.getTime() + (now.getTimezoneOffset() + 330) * 60 * 1000
  const ist = new Date(istMs)
  return new Date(ist.getFullYear(), ist.getMonth(), ist.getDate())
}

export default function DiaryPage() {
  return <DiaryView initialDate={getTodayIST()} />
}
