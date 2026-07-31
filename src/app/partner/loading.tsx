import { PageSkeleton } from '@/components/Feedback'

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <PageSkeleton rows={6} />
    </div>
  )
}
