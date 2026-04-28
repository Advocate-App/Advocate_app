'use client'

import { useParams } from 'next/navigation'
import { parseISO, isValid } from 'date-fns'
import DiaryView from '../../components/DiaryView'

export default function DiaryDatePage() {
  const { date } = useParams<{ date: string }>()

  // Parse YYYY-MM-DD from URL as local date (no UTC offset shift)
  let parsedDate: Date
  try {
    const [y, m, d] = date.split('-').map(Number)
    parsedDate = new Date(y, m - 1, d)
    if (!isValid(parsedDate)) parsedDate = new Date()
  } catch {
    parsedDate = new Date()
  }

  return <DiaryView initialDate={parsedDate} />
}
