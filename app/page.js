'use client';

import Image from 'next/image';
import { useState } from 'react';

const PAGES = [
  { id: 'oFppF',    label: 'ภาพรวม',              emoji: '📊' },
  { id: 'p_a0iq0cb90d', label: 'รายงานคนรุ่นใหม่', emoji: '🌱' },
];

const BASE_EMBED = 'https://lookerstudio.google.com/embed/reporting/2aa095a7-030b-4725-8e46-b478d516ab58/page/';

export default function Dashboard() {
  const [activePage, setActivePage] = useState('p_a0iq0cb90d');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">

      {/* ──────────────── HEADER ──────────────── */}
      <header className="header-gradient text-white shadow-2xl relative overflow-hidden">

        {/* decorative circles */}
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white opacity-5 pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-64 h-64 rounded-full bg-white opacity-5 pointer-events-none" />

        <div className="relative z-10 max-w-screen-2xl mx-auto px-4 py-3">

          {/* ── TOP ROW: logos + title + characters ── */}
          <div className="flex items-center justify-between gap-4">

            {/* Left: logos */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="bg-white rounded-xl p-1.5 shadow-lg">
                <Image
                  src="/images/logo-codi.jpg"
                  alt="CODI Logo"
                  width={52}
                  height={52}
                  className="object-contain rounded-lg"
                />
              </div>
              <div className="bg-white rounded-xl p-1.5 shadow-lg">
                <Image
                  src="/images/logo-sss.png"
                  alt="สสส Logo"
                  width={52}
                  height={52}
                  className="object-contain rounded-lg"
                />
              </div>
              <div className="bg-white rounded-xl p-1.5 shadow-lg">
                <Image
                  src="/images/logo-sanuk6.png"
                  alt="สำนัก 6 Logo"
                  width={52}
                  height={52}
                  className="object-contain rounded-lg"
                />
              </div>
            </div>

            {/* Center: title */}
            <div className="flex-1 text-center px-4">
              <h1 className="text-xl md:text-2xl lg:text-3xl font-bold leading-tight drop-shadow-lg">
                รายงานคนรุ่นใหม่คืนถิ่น
              </h1>
              <p className="text-sm md:text-base font-medium opacity-90 mt-0.5">
                Movement คนรุ่นใหม่ 3 <span className="opacity-60">|</span> สำนัก 6 สสส.
              </p>
            </div>

            {/* Right: characters */}
            <div className="hidden md:flex items-end gap-2 shrink-0">
              <div className="float-anim">
                <Image
                  src="/images/char1.png"
                  alt=""
                  width={60}
                  height={70}
                  className="object-contain drop-shadow-xl"
                />
              </div>
              <div className="float-anim-2">
                <Image
                  src="/images/char2.png"
                  alt=""
                  width={60}
                  height={70}
                  className="object-contain drop-shadow-xl"
                />
              </div>
              <div className="float-anim" style={{ animationDelay: '1s' }}>
                <Image
                  src="/images/char3.png"
                  alt=""
                  width={56}
                  height={65}
                  className="object-contain drop-shadow-xl"
                />
              </div>
              <div className="float-anim-2" style={{ animationDelay: '2s' }}>
                <Image
                  src="/images/char4.png"
                  alt=""
                  width={60}
                  height={70}
                  className="object-contain drop-shadow-xl"
                />
              </div>
            </div>
          </div>

          {/* ── NAV TABS (desktop) ── */}
          <nav className="hidden md:flex mt-3 gap-2">
            {PAGES.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePage(p.id)}
                className={`flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200
                  ${activePage === p.id
                    ? 'bg-white text-codi-blue shadow-lg scale-105'
                    : 'bg-white/20 hover:bg-white/30 text-white'
                  }`}
              >
                <span>{p.emoji}</span>
                {p.label}
              </button>
            ))}
          </nav>

          {/* ── NAV TABS (mobile) ── */}
          <div className="md:hidden mt-2 flex items-center justify-between">
            <span className="text-sm font-medium opacity-80">
              {PAGES.find((p) => p.id === activePage)?.emoji}{' '}
              {PAGES.find((p) => p.id === activePage)?.label}
            </span>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="bg-white/20 hover:bg-white/30 rounded-full px-3 py-1.5 text-sm font-semibold"
            >
              ☰ เมนู
            </button>
          </div>
          {menuOpen && (
            <div className="md:hidden mt-2 flex flex-col gap-1 pb-1">
              {PAGES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setActivePage(p.id); setMenuOpen(false); }}
                  className={`text-left px-4 py-2 rounded-lg text-sm font-semibold transition-all
                    ${activePage === p.id
                      ? 'bg-white text-codi-blue'
                      : 'bg-white/20 hover:bg-white/30 text-white'
                    }`}
                >
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ──────────────── MAIN: IFRAME ──────────────── */}
      <main className="flex-1 flex flex-col">
        <div className="flex-1 relative" style={{ height: 'calc(100vh - 160px)', minHeight: '600px' }}>
          <iframe
            key={activePage}
            src={`${BASE_EMBED}${activePage}`}
            className="dashboard-iframe absolute inset-0 w-full h-full"
            title="Looker Studio Dashboard"
            allowFullScreen
            sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
      </main>

      {/* ──────────────── FOOTER ──────────────── */}
      <footer className="bg-codi-blue text-white py-3 text-center text-xs md:text-sm opacity-90">
        <p>
          © 2024 สถาบันพัฒนาองค์กรชุมชน (CODI) · สำนักงานกองทุนสนับสนุนการสร้างเสริมสุขภาพ (สสส.)
        </p>
        <p className="mt-0.5 opacity-70">
          โครงการ Movement คนรุ่นใหม่คืนถิ่น
        </p>
      </footer>
    </div>
  );
}
