'use client'
/**
 * The round VERIFIED evidence seal (landing.md §7.3), drawn as SVG on a 200 viewBox.
 * /case owns the INVALID variant; when both screens land, merge this into one shared Seal.
 */
import { useId, type CSSProperties } from 'react'

export function Seal({ size, className, style }: { size: number; className?: string; style?: CSSProperties }) {
  const arc = `seal-arc-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true" className={className} style={style}>
      <path id={arc} d="M100 100 m-74 0 a74 74 0 1 1 148 0 a74 74 0 1 1 -148 0" fill="none" />
      <circle cx="100" cy="100" r="96" fill="#fff" />
      <circle cx="100" cy="100" r="92" fill="none" className="stroke-success" strokeWidth="5" />
      <circle cx="100" cy="100" r="58" fill="none" className="stroke-success" strokeWidth="2.5" />
      <text className="fill-success font-sans" fontWeight="700" fontSize="14.5" letterSpacing="3.2">
        <textPath href={`#${arc}`} startOffset="0" textLength="458" lengthAdjust="spacing">
          EVIDENCE SEALED · KMS SIGNED · RECALLINDIA ·{' '}
        </textPath>
      </text>
      <circle cx="100" cy="100" r="54" className="fill-success" />
      <path d="M78 94l14 14 28-30" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <text x="100" y="134" textAnchor="middle" className="font-sans" fontWeight="700" fontSize="13" letterSpacing="1.6" fill="#fff">
        VERIFIED
      </text>
    </svg>
  )
}
