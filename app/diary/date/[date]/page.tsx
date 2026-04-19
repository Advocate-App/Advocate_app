'use client'

import { useParams } from 'next/navigation'
import { parseISO, isValid } from 'date-fns'
import DiaryView from '../../components/DiaryView'

export default function DiaryDatePage() {
  const { date } = useParams<{ date: string }>()

  // Parse the YYYY-MM-DD from URL
  let parsedDate: Date
  try {
    parsedDate = parseISO(date)
    if (!isValid(parsedDate)) {
      parsedDate = new Date()
    }
  } catch {
    parsedDate = new Date()
  }

  return <DiaryView initialDate={parsedDate} />
}
