import {
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react'
import './OtpInput.css'

interface Props {
  /** current code value (length controlled by `length`) */
  value: string
  onChange: (next: string) => void
  /** fired when all cells are filled */
  onComplete?: (code: string) => void
  length?: number
  disabled?: boolean
  autoFocus?: boolean
  ariaLabel?: string
}

/**
 * Brand 6-digit OTP / TOTP input. Auto-advances, supports paste and backspace,
 * 44px targets, and announces itself as a single labelled group.
 */
export default function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  autoFocus,
  ariaLabel = 'One-time code',
}: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  function focusCell(i: number) {
    const el = refs.current[Math.max(0, Math.min(length - 1, i))]
    el?.focus()
    el?.select()
  }

  function emit(next: string) {
    onChange(next)
    if (next.length === length && !next.includes(' ')) onComplete?.(next)
  }

  function setAt(i: number, char: string) {
    const arr = digits.slice()
    arr[i] = char
    emit(arr.join('').replace(/\s+$/g, ''))
  }

  function onCellChange(i: number, raw: string) {
    const only = raw.replace(/\D/g, '')
    if (!only) {
      setAt(i, '')
      return
    }
    // typing into a cell may carry pasted overflow — distribute it.
    const arr = digits.slice()
    let cursor = i
    for (const ch of only) {
      if (cursor >= length) break
      arr[cursor] = ch
      cursor += 1
    }
    emit(arr.join('').replace(/\s+$/g, ''))
    focusCell(cursor)
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        setAt(i, '')
      } else if (i > 0) {
        e.preventDefault()
        setAt(i - 1, '')
        focusCell(i - 1)
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusCell(i - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusCell(i + 1)
    }
  }

  function onPaste(i: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length - i)
    if (!pasted) return
    const arr = digits.slice()
    let cursor = i
    for (const ch of pasted) {
      arr[cursor] = ch
      cursor += 1
    }
    emit(arr.join('').replace(/\s+$/g, ''))
    focusCell(cursor)
  }

  return (
    <div className="otp" role="group" aria-label={ariaLabel}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          className="otp-cell input"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={`${ariaLabel} digit ${i + 1}`}
          onChange={(e) => onCellChange(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => onPaste(i, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  )
}
