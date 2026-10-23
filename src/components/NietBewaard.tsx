'use client'
import { useEffect } from 'react'

// Waarschuwt bij weggaan als er in het formulier is getypt dat nog niet is bewaard.
export function NietBewaard({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId)
    if (!form) return
    let dirty = false
    const onInput = () => (dirty = true)
    const onSubmit = () => (dirty = false)
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    form.addEventListener('input', onInput)
    form.addEventListener('submit', onSubmit)
    window.addEventListener('beforeunload', onLeave)
    return () => {
      form.removeEventListener('input', onInput)
      form.removeEventListener('submit', onSubmit)
      window.removeEventListener('beforeunload', onLeave)
    }
  }, [formId])
  return null
}
