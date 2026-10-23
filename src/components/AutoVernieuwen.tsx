'use client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// Haalt tijdens het overleg elke paar tellen de nieuwste stand op, zodat iedereen op zijn eigen scherm meekijkt.
export function AutoVernieuwen({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) router.refresh()
    }, seconds * 1000)
    return () => clearInterval(t)
  }, [router, seconds])
  return null
}
