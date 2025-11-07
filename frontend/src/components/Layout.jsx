import React, { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';

function Layout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className={`bg-gray-800 text-white w-64 flex-shrink-0 transition-all ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="p-6">
          <h1 className="text-2xl font-bold">Binopolis Pay</h1>
          <p className="text-gray-400 text-sm">Admin Panel</p>
        </div>
        <nav className="mt-6">
          <Link
            to="/"
            className="block px-6 py-3 hover:bg-gray-700 transition-colors"
          >
            📊 Dashboard
          </Link>
          <Link
            to="/users"
            className="block px-6 py-3 hover:bg-gray-700 transition-colors"
          >
            👥 Usuarios
          </Link>
          <Link
            to="/wallets"
            className="block px-6 py-3 hover:bg-gray-700 transition-colors"
          >
            💳 Wallets
          </Link>
          <Link
            to="/wallet-transactions"
            className="block px-6 py-3 hover:bg-gray-700 transition-colors"
          >
            💰 Transacciones Wallets
          </Link>
          <Link
            to="/config"
            className="block px-6 py-3 hover:bg-gray-700 transition-colors"
          >
            ⚙️ Configuración
          </Link>
          <Link
            to="/messages"
            className="block px-6 py-3 hover:bg-gray-700 transition-colors"
          >
            💬 Mensajes del Bot
          </Link>
          <Link
            to="/code"
            className="block px-6 py-3 hover:bg-gray-700 transition-colors"
          >
            💻 Código
          </Link>
        </nav>
        <div className="absolute bottom-0 w-64 p-6">
          <button
            onClick={handleLogout}
            className="w-full bg-red-600 hover:bg-red-700 px-4 py-2 rounded transition-colors"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-gray-600 hover:text-gray-900"
            >
              ☰
            </button>
            <div className="text-gray-600">
              {localStorage.getItem('username') || 'Admin'}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;

