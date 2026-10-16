import type { Metadata } from 'next'
import { Fraunces, Nunito_Sans } from 'next/font/google'
import './globals.css'

const kop = Fraunces({ subsets: ['latin'], variable: '--font-kop', weight: ['500', '600'] })
const tekst = Nunito_Sans({ subsets: ['latin'], variable: '--font-tekst' })

export const metadata: Metadata = {
  title: 'Samen Groeien',
  description: 'Voorbereiden op je functioneringsgesprek',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${kop.variable} ${tekst.variable}`}>
      <body>{children}</body>
    </html>
  )
}
