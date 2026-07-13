import React from 'react';


export default function Navbar({ logoUrl ,url}: any) {
  return (
    <a href={url} target='_tab' className="relative w-full px-6 pt-6 pb-4 font-sans ">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        {/* Logo */}
        <a href="#" aria-label="Petocare Logo">
          <img
            src={logoUrl} // <-- Update this to use logoUrl
            alt="Petocare Logo"
            className="h-11 w-40 object-contain  rounded p-1 brightness-0 dark:invert"
          />
        </a>

        {/* Desktop Navigation */}
        <nav
          className="hidden items-center gap-7 rounded-2xl border border-black/10 bg-white/60 px-6 py-3 backdrop-blur-md shadow-sm md:flex"
          aria-label="Main Navigation"
        >
          <a href="#" className="flex items-center gap-1.5 text-base font-medium text-[#1E0C05] transition-opacity hover:opacity-70">
            All Pages
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
          </a>
          <a href="#" className="text-base font-medium text-[#1E0C05] transition-opacity hover:opacity-70">About</a>
          <a href="#" className="text-base font-medium text-[#1E0C05] transition-opacity hover:opacity-70">Service</a>
          <a href="#" className="text-base font-medium text-[#1E0C05] transition-opacity hover:opacity-70">Blog</a>
        </nav>

        {/* Contact Button */}
        <div className="hidden sm:flex">
          <a href="tel:0843043950" className="flex items-center gap-2.5 rounded-2xl bg-[#1E0C05] px-6 py-3.5 text-[#FDFDFD] shadow-md transition-colors hover:bg-[#3b2015]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <span className="text-base font-medium tracking-wide">Call us: 084-304-3950</span>
          </a>
        </div>

        {/* Mobile Menu Button */}
        <button className="rounded-lg p-2 text-[#1E0C05] transition-colors hover:bg-black/5 md:hidden" aria-label="Toggle Menu">
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" />
          </svg>
        </button>
      </div>
    </a>
  );
}