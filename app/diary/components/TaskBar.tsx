'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { Plus } from 'lucide-react'

interface Task {
  id: string
  advocate_id: string
  title: string
  done: boolean
  task_date: string
  created_at: string
}

export default function TaskBar({ advocateId }: { advocateId: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [showInput, setShowInput] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    fetchTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advocateId])

  async function fetchTasks() {
    const supabase = createClient()
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('advocate_id', advocateId)
      .eq('task_date', today)
      .order('created_at', { ascending: true })
    if (data) setTasks(data as Task[])
  }

  async function toggleDone(taskId: string, currentDone: boolean) {
    const supabase = createClient()
    await supabase.from('tasks').update({ done: !currentDone }).eq('id', taskId)
    setTasks(prev =>
      prev.map(t => (t.id === taskId ? { ...t, done: !currentDone } : t))
    )
  }

  async function addTask() {
    const text = newTask.trim()
    if (!text) return
    setSaving(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('tasks')
      .insert({ advocate_id: advocateId, title: text, done: false, task_date: today })
      .select()
      .single()
    if (data) setTasks(prev => [...prev, data as Task])
    setNewTask('')
    setSaving(false)
    setShowInput(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTask()
    }
    if (e.key === 'Escape') {
      setShowInput(false)
      setNewTask('')
    }
  }

  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showInput])

  return (
    <div
      className="w-full px-3 py-1.5 rounded-lg mb-3 flex flex-wrap items-center gap-2"
      style={{ background: '#fef9e7', border: '1px solid #f5e6b8' }}
    >
      {/* Label */}
      <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide shrink-0">
        Tasks
      </span>

      {/* Task pills */}
      {tasks.map(task => (
        <label
          key={task.id}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] cursor-pointer transition-colors ${
            task.done
              ? 'bg-amber-100 text-amber-400 line-through'
              : 'bg-white text-gray-700 border border-gray-200'
          }`}
        >
          <input
            type="checkbox"
            checked={task.done}
            onChange={() => toggleDone(task.id, task.done)}
            className="w-3 h-3 rounded accent-amber-500"
          />
          <span>{task.title}</span>
        </label>
      ))}

      {/* Inline add input */}
      {showInput ? (
        <input
          ref={inputRef}
          type="text"
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (!newTask.trim()) {
              setShowInput(false)
              setNewTask('')
            }
          }}
          disabled={saving}
          placeholder="Type task, press Enter"
          className="px-2 py-0.5 text-[11px] border border-amber-300 rounded-full bg-white text-gray-800 outline-none focus:ring-1 focus:ring-amber-400 w-40"
        />
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-medium text-amber-700 hover:bg-amber-100 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      )}
    </div>
  )
}
