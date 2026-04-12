import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ currentPage, totalPages, totalItems, onPageChange, itemLabel = 'items' }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4 px-1">
      <span className="text-sm text-gray-500">
        Page {currentPage} of {totalPages} ({totalItems} {itemLabel})
      </span>
      <div className="flex gap-2">
        <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
          <ChevronLeft className="h-4 w-4" /> Previous
        </button>
        <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
