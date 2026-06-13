import React from 'react';
import Navbar from './Navbar';

/**
 * Common app layout page containing Navbar header and main section space.
 */
export default function Layout({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-color)' }}>
      <Navbar />
      <main className="container" style={{ flex: 1, padding: '40px 24px' }}>
        {children}
      </main>
    </div>
  );
}
