import React, { useState, useEffect } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';

function Layout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed md:static inset-y-0 left-0 z-30 bg-gray-800 text-white w-64 flex-shrink-0 transition-transform duration-300 ease-in-out transform ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Binopolis Pay</h1>
              <p className="text-gray-400 text-xs md:text-sm">Admin Panel</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
        <nav className="mt-4 md:mt-6 overflow-y-auto flex-1">
          <Link
            to="/"
            onClick={() => window.innerWidth < 768 && setSidebarOpen(false)}
            className="block px-4 md:px-6 py-2 md:py-3 hover:bg-gray-700 transition-colors text-sm md:text-base"
          >
            📊 Dashboard
          </Link>
          <Link
            to="/users"
            onClick={() => window.innerWidth < 768 && setSidebarOpen(false)}
            className="block px-4 md:px-6 py-2 md:py-3 hover:bg-gray-700 transition-colors text-sm md:text-base"
          >
            👥 Usuarios
          </Link>
          <Link
            to="/wallets"
            onClick={() => window.innerWidth < 768 && setSidebarOpen(false)}
            className="block px-4 md:px-6 py-2 md:py-3 hover:bg-gray-700 transition-colors text-sm md:text-base"
          >
            💳 Wallets
          </Link>
          <Link
            to="/wallet-transactions"
            onClick={() => window.innerWidth < 768 && setSidebarOpen(false)}
            className="block px-4 md:px-6 py-2 md:py-3 hover:bg-gray-700 transition-colors text-sm md:text-base"
          >
            💰 Transacciones Wallets
          </Link>
          <Link
            to="/transactions"
            onClick={() => window.innerWidth < 768 && setSidebarOpen(false)}
            className="block px-4 md:px-6 py-2 md:py-3 hover:bg-gray-700 transition-colors text-sm md:text-base"
          >
            📋 Transacciones (Acciones)
          </Link>
          <Link
            to="/config"
            onClick={() => window.innerWidth < 768 && setSidebarOpen(false)}
            className="block px-4 md:px-6 py-2 md:py-3 hover:bg-gray-700 transition-colors text-sm md:text-base"
          >
            ⚙️ Configuración
          </Link>
          <Link
            to="/messages"
            onClick={() => window.innerWidth < 768 && setSidebarOpen(false)}
            className="block px-4 md:px-6 py-2 md:py-3 hover:bg-gray-700 transition-colors text-sm md:text-base"
          >
            💬 Mensajes del Bot
          </Link>
          <Link
            to="/code"
            onClick={() => window.innerWidth < 768 && setSidebarOpen(false)}
            className="block px-4 md:px-6 py-2 md:py-3 hover:bg-gray-700 transition-colors text-sm md:text-base"
          >
            💻 Código
          </Link>
        </nav>
        <div className="absolute bottom-0 w-64 p-4 md:p-6">
          <button
            onClick={handleLogout}
            className="w-full bg-red-600 hover:bg-red-700 px-4 py-2 rounded transition-colors text-sm md:text-base"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full md:w-auto">
        <header className="bg-white shadow-sm p-3 md:p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-gray-600 hover:text-gray-900 text-2xl md:text-xl"
            >
              ☰
            </button>
            <div className="text-gray-600 text-sm md:text-base">
              {localStorage.getItem('username') || 'Admin'}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-3 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;

