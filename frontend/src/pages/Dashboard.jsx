import React, { useEffect, useState } from 'react';
import { dashboardAPI } from '../services/api';

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await dashboardAPI.getStats();
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center">Cargando...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">Dashboard</h1>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
        <div className="bg-white p-4 md:p-6 rounded-lg shadow">
          <h2 className="text-gray-600 text-xs md:text-sm font-semibold mb-2">Total Usuarios</h2>
          <p className="text-2xl md:text-3xl font-bold text-blue-600">{stats?.totalUsers || 0}</p>
        </div>
        
        <div className="bg-white p-4 md:p-6 rounded-lg shadow">
          <h2 className="text-gray-600 text-xs md:text-sm font-semibold mb-2">Total USDT</h2>
          <p className="text-2xl md:text-3xl font-bold text-green-600">
            {parseFloat(stats?.totalUSDT || 0).toFixed(2)} USDT
          </p>
        </div>
        
        <div className="bg-white p-4 md:p-6 rounded-lg shadow sm:col-span-2 lg:col-span-1">
          <h2 className="text-gray-600 text-xs md:text-sm font-semibold mb-2">Total Transacciones</h2>
          <p className="text-2xl md:text-3xl font-bold text-purple-600">{stats?.totalTransactions || 0}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 md:p-6 border-b">
          <h2 className="text-lg md:text-xl font-bold">Transacciones Recientes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Monto USDT</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {stats?.recentTransactions?.map((tx) => (
                <tr key={tx.id}>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">{tx.id}</td>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">{tx.username || 'N/A'}</td>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">{tx.type}</td>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">{parseFloat(tx.amount_usdt || 0).toFixed(2)}</td>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded ${
                      tx.status === 'pagado' ? 'bg-green-100 text-green-800' :
                      tx.status === 'pendiente' ? 'bg-yellow-100 text-yellow-800' :
                      tx.status === 'cancelado' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">
                    {new Date(tx.created_at).toLocaleString('es-AR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

