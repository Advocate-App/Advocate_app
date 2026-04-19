'use client'

import DiaryView from './components/DiaryView'

export default function DiaryPage() {
  return <DiaryView initialDate={new Date()} />
}
