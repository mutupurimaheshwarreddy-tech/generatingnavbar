'use client';

import { useState, useTransition } from 'react';
import { seedJsonAction } from '@/actions/seedDatabase';

export default function PushJsonPage() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success?: boolean; message?: string } | null>(null);

  const handlePushData = () => {
    startTransition(async () => {
      const response = await seedJsonAction();
      setResult(response);
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Database Seeder</h1>
        <p className="text-gray-500 mb-8 text-sm">
          Push local data/test.json to the Neon Postgres database.
        </p>
        
        <button
          onClick={handlePushData}
          disabled={isPending}
          className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-all
            ${isPending 
              ? 'bg-blue-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
            }`}
        >
          {isPending ? 'Pushing to Neon DB...' : 'Push JSON to Database'}
        </button>

        {result && (
          <div className={`mt-6 p-4 rounded-lg text-sm ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {result.message}
          </div>
        )}
      </div>
    </main>
  );
}