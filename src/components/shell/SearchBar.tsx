'use client'

import { useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { useEffect, useRef, useState } from 'react'

interface Suggestion {
  id: string
  name: string
  slug: string
  category_name: string | null
}

/**
 * Search entry point. Supports the PRD's launch search modes: product name,
 * brand, category and barcode. A purely numeric term of 8+ digits is treated
 * as a GTIN and routed straight to the product, which is how a shopkeeper
 * scanning a pack expects it to behave.
 */
export function SearchBar({
  initial = '',
  placeholder = 'Search for products nearby…',
  autoFocus = false,
}: {
  initial?: string
  placeholder?: string
  autoFocus?: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState(initial)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const term = value.trim()

  // The effect only talks to the network. Clearing the list for a short term
  // is derived below instead of set here: calling setState synchronously in an
  // effect body triggers a second render pass on every keystroke.
  useEffect(() => {
    if (term.length < 2) return

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        })
        if (res.ok) setSuggestions(await res.json())
      } catch {
        // aborted or offline - suggestions are an enhancement, not required
      }
    }, 180)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [term])

  // Stale results must not linger under a term too short to have produced them.
  const visibleSuggestions = term.length < 2 ? [] : suggestions

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!term) return
    setOpen(false)
    if (/^\d{8,14}$/.test(term)) router.push(`/barcode/${term}`)
    else router.push(`/search?q=${encodeURIComponent(term)}`)
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <form onSubmit={submit} role="search">
        <label htmlFor="site-search" className="sr-only">
          Search products
        </label>
        {/* The shell carries the field surface and shadow; the input inside is
            bare, so the two do not stack into a double shadow. */}
        <div className="field-with-icon field-shell flex items-center focus-within:field-shell-focus">
          <span className="field-icon">
            <Icon name="search" size={18} />
          </span>
          <input
            id="site-search"
            name="q"
            value={value}
            autoFocus={autoFocus}
            autoComplete="off"
            onChange={(e) => {
              setValue(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="w-full bg-transparent py-2.5 pl-11 pr-2 text-sm text-field-ink shadow-none outline-none placeholder:text-field-muted"
          />
          <button
            type="submit"
            className="rounded-brand bg-accent-500 px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent-600"
          >
            Search
          </button>
        </div>
      </form>

      {open && visibleSuggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-brand border border-line-soft bg-surface shadow-lg">
          {visibleSuggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  router.push(`/product/${s.slug}`)
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-muted"
              >
                <span className="text-sm text-ink">{s.name}</span>
                {s.category_name && (
                  <span className="shrink-0 text-xs text-muted">{s.category_name}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
