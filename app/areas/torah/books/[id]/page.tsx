import { BookPage } from "@/components/features/torah/book/BookPage";

// A book's own page — a real URL, so the Book ⇄ Rabbi investigation loop has
// working back/forward navigation, deep links and open-in-new-tab.
export default async function TorahBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BookPage bookId={id} />;
}
