'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import type { NavbarData } from '@/components/Navbar';
import {
  Check,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';

interface WebsiteEntry {
  row_number: number;
  Website: string;
  logourl?: string;
  logoShape?: 'square' | 'wide';
  status?: 'pending' | 'approved' | 'not-approved';
}

const ITEMS_PER_PAGE = 10;

function buildNavbarData(entry: WebsiteEntry): NavbarData {
  return {
    logo: {
      src: entry.logourl || '/placeholder-logo.svg',
      alt: `Logo for ${entry.Website}`,
      href: '#',
      shape: entry.logoShape || 'wide',
    },
    links: [
      { id: 'about', label: 'About', href: '#' },
      { id: 'service', label: 'Service', href: '#' },
      { id: 'blog', label: 'Blog', href: '#' },
    ],
    contact: {
      phone: '084-304-3950',
      href: 'tel:0843043950',
    },
  };
}

export default function TestNavbarsPage() {
  const [entries, setEntries] = useState<WebsiteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/generate-logos', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch data');
      const data = await res.json();
      setEntries(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Only show entries that are pending (no status yet) or have a logo but haven't been reviewed
  const queue = entries.filter(
    (e) => e.status !== 'approved' && e.status !== 'not-approved'
  );

  const totalPages = Math.max(1, Math.ceil(queue.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const pageItems = queue.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleAction = async (rowNumber: number, status: 'approved' | 'not-approved') => {
    setActionLoading(rowNumber);
    try {
      const res = await fetch('/api/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row_number: rowNumber, status }),
      });

      if (!res.ok) throw new Error('Failed to update status');

      // Remove the entry from the queue locally
      setEntries((prev) =>
        prev.map((e) =>
          e.row_number === rowNumber ? { ...e, status } : e
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setActionLoading(null);
    }
  };

  const approvedCount = entries.filter((e) => e.status === 'approved').length;
  const rejectedCount = entries.filter((e) => e.status === 'not-approved').length;
  const pendingCount = queue.length;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Top Bar */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Home
            </Link>
            <div className="h-5 w-px bg-slate-300" />
            <h1 className="text-lg font-bold text-slate-900">Navbar Review Queue</h1>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="text-slate-600">
                Pending: <span className="font-semibold text-slate-900">{pendingCount}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span className="text-slate-600">
                Approved: <span className="font-semibold text-slate-900">{approvedCount}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <span className="text-slate-600">
                Rejected: <span className="font-semibold text-slate-900">{rejectedCount}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400 mb-3" />
            <p className="text-slate-500">Loading navbar data...</p>
          </div>
        ) : queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">All done!</h2>
            <p className="text-slate-500 max-w-md">
              All navbars have been reviewed. Go back home to generate logos or check your approved/rejected counts above.
            </p>
            <Link
              href="/"
              className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </div>
        ) : (
          <>
            {/* Page Info */}
            <div className="mb-6 flex items-center justify-between">
              <p className="text-sm text-slate-600">
                Showing{' '}
                <span className="font-semibold text-slate-900">{startIndex + 1}</span>–
                <span className="font-semibold text-slate-900">
                  {Math.min(startIndex + ITEMS_PER_PAGE, queue.length)}
                </span>{' '}
                of <span className="font-semibold text-slate-900">{queue.length}</span> pending
              </p>
              <p className="text-sm text-slate-500">Page {safePage} of {totalPages}</p>
            </div>

            {/* Navbar Cards */}
            <div className="space-y-6">
              {pageItems.map((entry) => {
                const navbarData = buildNavbarData(entry);
                return (
                  <div
                    key={entry.row_number}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                  >
                    {/* Navbar Preview */}
                    <div
                      className="relative h-32 overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                      }}
                    >
                      <Navbar data={navbarData} />
                      {/* Website URL overlay */}
                      <div className="absolute bottom-2 right-3 flex items-center gap-1.5 text-xs text-slate-400">
                        <ExternalLink className="w-3 h-3" />
                        <span className="truncate max-w-xs">{entry.Website}</span>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="px-6 py-4 flex items-center justify-between border-t border-slate-100">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-400">
                          Row #{entry.row_number}
                        </span>
                        {entry.logoShape && (
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                            {entry.logoShape === 'square' ? 'Square logo' : 'Wide logo'}
                          </span>
                        )}
                        {!entry.logourl && (
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">
                            No logo extracted
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleAction(entry.row_number, 'not-approved')}
                          disabled={actionLoading === entry.row_number}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-red-200 text-red-600 font-medium text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === entry.row_number ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                          Not Approve
                        </button>
                        <button
                          onClick={() => handleAction(entry.row_number, 'approved')}
                          disabled={actionLoading === entry.row_number}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-600 text-white font-medium text-sm hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === entry.row_number ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          Approve
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="flex items-center gap-1 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                    page === safePage
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 text-slate-700 hover:bg-white'
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="flex items-center gap-1 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
