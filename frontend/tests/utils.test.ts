import { describe, it, expect } from 'vitest'
import { cn, chunkArray } from '@/lib/utils'

describe('cn utility', () => {
  it('should merge class names', () => {
    const result = cn('text-red-500', 'bg-blue-500')
    expect(result).toBe('text-red-500 bg-blue-500')
  })

  it('should handle conditional classes', () => {
    const isActive = true
    const result = cn('base-class', isActive && 'active-class')
    expect(result).toBe('base-class active-class')
  })

  it('should handle undefined values', () => {
    const result = cn('base-class', undefined, 'another-class')
    expect(result).toBe('base-class another-class')
  })

  it('should merge conflicting Tailwind classes', () => {
    // tailwind-merge should handle conflicts
    const result = cn('p-4', 'p-8')
    expect(result).toBe('p-8')
  })

  it('should handle arrays of classes', () => {
    const result = cn(['class-1', 'class-2'], 'class-3')
    expect(result).toBe('class-1 class-2 class-3')
  })

  it('should handle empty inputs', () => {
    const result = cn()
    expect(result).toBe('')
  })

  it('should handle object notation', () => {
    const result = cn({
      'active': true,
      'disabled': false,
      'visible': true,
    })
    expect(result).toBe('active visible')
  })
})

describe('chunkArray utility', () => {
  it('should split items evenly across chunks', () => {
    const result = chunkArray([1, 2, 3, 4], 2)
    expect(result).toEqual([[1, 2], [3, 4]])
  })

  it('should put remainder items in a final smaller chunk', () => {
    const result = chunkArray([1, 2, 3, 4, 5], 2)
    expect(result).toEqual([[1, 2], [3, 4], [5]])
  })

  it('should return a single chunk when items fit within size', () => {
    const result = chunkArray([1, 2, 3], 20)
    expect(result).toEqual([[1, 2, 3]])
  })

  it('should return an empty array for empty input', () => {
    const result = chunkArray([], 20)
    expect(result).toEqual([])
  })

  it('should not lose or duplicate items across many chunks', () => {
    const items = Array.from({ length: 45 }, (_, i) => i)
    const result = chunkArray(items, 20)
    expect(result).toEqual([
      items.slice(0, 20),
      items.slice(20, 40),
      items.slice(40, 45),
    ])
    expect(result.flat()).toEqual(items)
  })
})
