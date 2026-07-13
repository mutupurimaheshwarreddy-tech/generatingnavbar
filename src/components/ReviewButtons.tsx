'use client';

import { useTransition } from 'react';
import { updateLogoStatus } from '@/actions/navbarActions';

interface ReviewButtonsProps {
  rowNumber: number;
  currentStatus: string;
}

export default function ReviewButtons({ rowNumber, currentStatus }: ReviewButtonsProps) {
  const [isPending, startTransition] = useTransition();

  const handleStatusUpdate = (status: string) => {
    startTransition(async () => {
      await updateLogoStatus(rowNumber, status);
    });
  };

  return (
    <div className="flex w-full items-center z-10 justify-between bg-white px-6 py-4 shadow-sm mb-12">
      <div className="text-sm font-medium text-gray-600">
        Current Status: <span className="font-bold text-black">{currentStatus}</span>
      </div>
      
      <div className="flex gap-4">
        <button
          onClick={() => handleStatusUpdate('approved')}
          disabled={isPending}
          className="px-5 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Updating...' : 'Approve'}
        </button>
        
        <button
          onClick={() => handleStatusUpdate('not_approved')}
          disabled={isPending}
          className="px-5 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Updating...' : 'Not Approve'}
        </button>
      </div>
    </div>
  );
}