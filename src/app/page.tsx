'use client';

import { useState } from 'react';

export default function Home() {
  const [status, setStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [message, setMessage] = useState('');

  const handleGenerate = async () => {
    setStatus('running');
    setMessage('Starting background processor...');

    try {
      const res = await fetch('/api/logo-worker', { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        setMessage('Background process started! You can safely close this tab or leave the page. The server will handle the rest.');
        setStatus('done');
      } else {
        setMessage(`Error: ${data.error}`);
        setStatus('idle');
      }
    } catch (error) {
      setMessage('Network error occurred while starting the process.');
      setStatus('idle');
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Logo Extractor Engine</h1>
        <p className="text-gray-500 mb-8 text-sm">
          Fires a background worker on Vercel to extract, remove backgrounds, and compress logos seamlessly.
        </p>
        
        <button
          onClick={handleGenerate}
          disabled={status === 'running'}
          className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-all
            ${status === 'running' 
              ? 'bg-blue-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
            }`}
        >
          {status === 'running' ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner /> Initiating Engine...
            </span>
          ) : (
            'Start Background Extraction'
          )}
        </button>

        <div className="mt-6 min-h-[60px]">
          {message && (
            <p className={`text-sm font-medium ${status === 'done' ? 'text-green-600' : 'text-gray-700'}`}>
              {message}
            </p>
          )}
        </div>
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