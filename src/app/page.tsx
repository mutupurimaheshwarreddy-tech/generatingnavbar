'use client';

import { useState } from 'react';

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ remaining: '?', message: 'Ready to start' });

  const processAll = async () => {
    setIsRunning(true);
    setProgress(prev => ({ ...prev, message: 'Starting engine...' }));

    let isDone = false;
    
    while (!isDone) {
      try {
        // Calling the API route instead of a Server Action
        const res = await fetch('/api/logo-worker', { method: 'POST' });
        const result = await res.json();
        
        if (result.done) {
          setProgress({ remaining: '0', message: 'All websites processed successfully!' });
          isDone = true;
          setIsRunning(false);
          break;
        }

        if (!result.success) {
          setProgress(prev => ({ ...prev, message: `Error: ${result.message}. Stopping.` }));
          setIsRunning(false);
          break;
        }

        setProgress({ 
          remaining: result.remaining?.toString() || '?', 
          message: `Processing batch... ${result.remaining} remaining.` 
        });

      } catch (err) {
        setProgress(prev => ({ ...prev, message: 'Network error occurred. You can click start again to resume.' }));
        setIsRunning(false);
        break;
      }
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Logo Extractor</h1>
        <p className="text-gray-500 mb-8 text-sm">
          Extract logos, remove backgrounds (AI), and update the database via API.
        </p>
        
        <div className="mb-6 p-4 bg-gray-50 rounded-lg text-left">
          <p className="text-sm font-semibold text-gray-700">Status:</p>
          <p className="text-sm text-blue-600">{progress.message}</p>
          {progress.remaining !== '?' && (
            <p className="text-xl font-bold text-gray-900 mt-2">
              Remaining: {progress.remaining}
            </p>
          )}
        </div>

        <button
          onClick={processAll}
          disabled={isRunning}
          className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-all
            ${isRunning 
              ? 'bg-blue-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
            }`}
        >
          {isRunning ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner /> Running Batch...
            </span>
          ) : (
            'Start Auto-Extractor'
          )}
        </button>
      </div>
    </main>
  );
}

const Spinner = () => (
  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);