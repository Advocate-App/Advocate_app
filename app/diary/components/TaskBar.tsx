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

export default function TaskBar({ advocateId, selectedDate }: { advocateId: string; selectedDate?: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [showInput, setShowInput] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const taskDate = selectedDate || format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    fetchTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advocateId, taskDate])

  async function fetchTasks() {
    const supabase = createClient()
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('advocate_id', advocateId)
      .eq('task_date', taskDate)
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
      .insert({ advocate_id: advocateId, title: text, done: false, task_date: taskDate })
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
    <div className="w-full">
      {/* Task list */}
      <ul className="space-y-0.5 mb-1">
        {tasks.map((task, i) => (
          <li key={task.id} className="flex items-start gap-1.5">
            <input
              type="checkbox"
              checked={task.done}
              onChange={() => toggleDone(task.id, task.done)}
              className="mt-0.5 w-3 h-3 rounded accent-amber-500 shrink-0"
            />
            <span className={`text-[11px] leading-tight ${task.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>
              {i + 1}. {task.title}
            </span>
          </li>
        ))}
        {tasks.length === 0 && (
          <li className="text-[11px] text-gray-300 italic">No tasks</li>
        )}
      </ul>

      {/* Add input */}
      {showInput ? (
        <input
          ref={inputRef}
          type="text"
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (!newTask.trim()) { setShowInput(false); setNewTask('') } }}
          disabled={saving}
          placeholder="Type task, press Enter"
          className="px-2 py-0.5 text-[11px] border border-gray-300 rounded bg-white text-gray-800 outline-none focus:ring-1 focus:ring-blue-400 w-full mt-1"
        />
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="inline-flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors mt-0.5"
        >
          <Plus className="w-3 h-3" />
          Add task
        </button>
      )}
    </div>
  )
}
