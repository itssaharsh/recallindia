/**
 * Brand and category glyphs shared with the app screens (same paths as the mockups' symbols:
 * logo, i-med / il-strip, i-car, i-plug, u-house, u-alert). Generic UI icons come from lucide-react.
 * All are decorative (aria-hidden); the text next to them carries the meaning.
 */
import * as React from 'react'
import type { ItemKind } from './types'

type G = { size?: number; className?: string; style?: React.CSSProperties }

/** Logo mark: a four-pocket strip, the bottom-right pocket red. `currentColor` is the tile. */
export function LogoMark({ size = 30, className, style }: G) {
  return (
    <svg width={size} height={size} viewBox="6 6 36 36" aria-hidden="true" className={className} style={style}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M14 6h20a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8V14a8 8 0 0 1 8-8zM16.5 11.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM31.5 11.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM16.5 26.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10z"
      />
      <circle fill="#B3121E" cx="31.5" cy="31.5" r="5" />
    </svg>
  )
}

export function MedicineGlyph({ size = 24, className }: G) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <circle cx="8.5" cy="10" r="1.8" />
        <circle cx="15.5" cy="10" r="1.8" />
        <circle cx="8.5" cy="15" r="1.8" fill="currentColor" />
        <circle cx="15.5" cy="15" r="1.8" />
      </g>
    </svg>
  )
}

export function VehicleGlyph({ size = 24, className }: G) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 16v-4l2-5h12l2 5v4z" />
        <path d="M4 12h16" />
        <circle cx="7.5" cy="16.5" r="1.8" fill="currentColor" />
        <circle cx="16.5" cy="16.5" r="1.8" fill="currentColor" />
      </g>
    </svg>
  )
}

export function ApplianceGlyph({ size = 24, className }: G) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** The app nav's household glyph (u-house). */
export function HouseGlyph({ size = 18, className }: G) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    </svg>
  )
}

/** Filled alert triangle with a white mark (u-alert), used on the "On a notice" badge. */
export function AlertGlyph({ size = 14, className }: G) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M12 3.5 22 20H2z" fill="currentColor" />
      <path d="M12 10v4.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="17.2" r="1.2" fill="#fff" />
    </svg>
  )
}

/** 20 px success disc with a white tick. */
export function TickDisc({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`mt-px grid size-5 shrink-0 place-items-center rounded-full bg-success ${className ?? ''}`}>
      <svg width="20" height="20" viewBox="0 0 20 20">
        <path d="M5.5 10.2l3 3 6-6.4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

const KIND_GLYPH: Record<ItemKind, (p: G) => React.JSX.Element> = {
  medicine: MedicineGlyph,
  vehicle: VehicleGlyph,
  appliance: ApplianceGlyph,
  other: ApplianceGlyph,
}
/** Category icon tile colours (glyph in the category ink on its soft tile). */
const KIND_TILE: Record<ItemKind, string> = {
  medicine: 'bg-cobalt-soft text-cat-medicine',
  vehicle: 'bg-cat-vehicle-soft text-cat-vehicle',
  appliance: 'bg-cat-appliance-soft text-cat-appliance',
  other: 'bg-cat-other-soft text-cat-other',
}

/** Square category tile: 44 px (radius 12) in the item card, 38 px (radius 10) in the household preview. */
export function KindTile({ kind, size = 44 }: { kind: ItemKind; size?: 38 | 44 }) {
  const Glyph = KIND_GLYPH[kind]
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center ${KIND_TILE[kind]} ${size === 44 ? 'size-11 rounded-[12px]' : 'size-[38px] rounded-[10px]'}`}
    >
      <Glyph size={size === 44 ? 24 : 20} />
    </span>
  )
}
