'use client'
/**
 * LandingNav (landing.md §2.1): fixed, transparent over the cobalt hero, solid cobalt from scrollY ≥ 726.
 * Desktop rest height 96 (bar centred on y 48), 64 when solid; stacked layouts are 64 tall throughout.
 * Phones hide the three text links and keep "Open the app".
 */
import Link from 'next/link'
import { useEffect, useState, type MouseEvent } from 'react'
import { Button } from '../ui'
import { LogoMark } from './glyphs'
import { NAV_SOLID_AT, NAV_TRANSITION } from './motion'
import s from './landing.module.css'
import type { LandingLinks } from './types'

export interface LandingNavProps {
  links: Pick<LandingLinks, 'feed' | 'api' | 'mine'>
  /** ?state=scrolled forces the solid bar. */
  forceSolid?: boolean
}

const linkCls =
  'hidden min-[701px]:inline-flex items-center h-12 px-4 rounded-pill font-sans text-[15px] font-medium leading-none ' +
  'text-on-cobalt-muted transition-colors duration-150 hover:text-white ' +
  'focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white'

/** Smooth-scroll to #how (a jump under reduced motion) and keep the hash in the URL. */
export function scrollToHow(e: MouseEvent<HTMLAnchorElement>) {
  const el = document.getElementById('how')
  if (!el) return
  e.preventDefault()
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  history.replaceState(null, '', '#how')
}

export function LandingNav({ links, forceSolid = false }: LandingNavProps) {
  const [solid, setSolid] = useState(forceSolid)

  useEffect(() => {
    if (forceSolid) {
      setSolid(true)
      return
    }
    const onScroll = () => setSolid(window.scrollY >= NAV_SOLID_AT)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [forceSolid])

  return (
    <header
      data-surface="cobalt"
      data-nav={solid ? 'scrolled' : 'overHero'}
      className={
        'fixed inset-x-0 top-0 z-50 h-16 border-b text-on-cobalt ' +
        (solid
          ? 'border-white/14 bg-cobalt shadow-[0_8px_24px_-12px_rgb(0_26_70/.35)]'
          : 'border-transparent bg-transparent min-[1200px]:h-24')
      }
      style={{ transition: NAV_TRANSITION }}
    >
      <nav aria-label="Main" className={`${s.wrap} flex h-full items-center min-[1200px]:gap-1`}>
        <Link
          href="/"
          className="mr-auto flex items-center gap-2.5 rounded-sm font-display text-[20px] font-extrabold leading-none tracking-[-.03em] text-white min-[1200px]:text-[22px] focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white pointer-coarse:min-h-11"
        >
          <LogoMark size={30} />
          RecallIndia
        </Link>
        <a href="#how" onClick={scrollToHow} className={linkCls}>
          How it works
        </a>
        <Link href={links.feed} className={linkCls}>
          Live feed
        </Link>
        <Link href={links.api} className={linkCls}>
          API
        </Link>
        <Button
          variant="onBlue"
          href={links.mine}
          className="ml-3 px-[18px]! min-[1200px]:px-[22px]! focus-visible:outline-offset-3!"
        >
          Open the app
        </Button>
      </nav>
    </header>
  )
}
