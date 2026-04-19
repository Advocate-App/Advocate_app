export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Georgia, serif' }}>
        Case Detail
      </h2>
      <p className="text-gray-500 mt-2">Case {id} — details coming in Module 2.</p>
    </div>
  )
}
