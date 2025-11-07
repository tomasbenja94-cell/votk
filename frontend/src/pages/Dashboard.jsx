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

  const dailyVolume = stats?.dailyVolume || [];
  const typeBreakdown = stats?.typeBreakdown || [];
  const statusBreakdown = stats?.statusBreakdown || [];
  const alerts = stats?.alerts || {};
  const maxDailyUSDT = dailyVolume.length > 0 ? Math.max(...dailyVolume.map(item => item.total_usdt)) : 1;
  const totalStatus = statusBreakdown.reduce((sum, item) => sum + item.count, 0);

  if (loading) {
    return <div className="text-center">Cargando...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">Dashboard</h1>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow dark:shadow-none">
          <h2 className="text-gray-600 dark:text-gray-300 text-xs md:text-sm font-semibold mb-2">Total Usuarios</h2>
          <p className="text-2xl md:text-3xl font-bold text-blue-600">{stats?.totalUsers || 0}</p>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow dark:shadow-none">
          <h2 className="text-gray-600 dark:text-gray-300 text-xs md:text-sm font-semibold mb-2">Total USDT</h2>
          <p className="text-2xl md:text-3xl font-bold text-green-600">
            {parseFloat(stats?.totalUSDT || 0).toFixed(2)} USDT
          </p>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow dark:shadow-none sm:col-span-2 lg:col-span-1">
          <h2 className="text-gray-600 dark:text-gray-300 text-xs md:text-sm font-semibold mb-2">Total Transacciones</h2>
          <p className="text-2xl md:text-3xl font-bold text-purple-600">{stats?.totalTransactions || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow dark:shadow-none">
          <h2 className="text-lg md:text-xl font-bold mb-4">Actividad diaria (7 días)</h2>
          {dailyVolume.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-300">Sin datos recientes</div>
          ) : (
            <div className="space-y-3">
              {dailyVolume.map((item) => {
                const percentage = maxDailyUSDT > 0 ? (item.total_usdt / maxDailyUSDT) * 100 : 0;
                return (
                  <div key={item.date} className="text-xs">
                    <div className="flex justify-between text-gray-600 mb-1">
                      <span>{new Date(item.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}</span>
                      <span>{parseFloat(item.total_usdt).toFixed(2)} USDT</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded">
                      <div
                        className="h-2 bg-blue-500 rounded"
                        style={{ width: `${Math.max(8, percentage)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow dark:shadow-none">
          <h2 className="text-lg md:text-xl font-bold mb-4">Alertas rápidas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border border-yellow-200 dark:border-yellow-500 rounded-lg p-3">
              <div className="text-xs text-yellow-600 font-semibold">Pendientes +2 h</div>
              <div className="text-2xl font-bold text-yellow-600">{alerts.pendingOverdue || 0}</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-300">Órdenes que necesitan revisión.</div>
            </div>
            <div className="border border-red-200 dark:border-red-500 rounded-lg p-3">
              <div className="text-xs text-red-600 font-semibold">Pagos altos (&gt;= 100 USDT)</div>
              <div className="text-2xl font-bold text-red-600">{alerts.highValue || 0}</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-300">Revisar manualmente por posible fraude.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow dark:shadow-none">
          <h2 className="text-lg md:text-xl font-bold mb-4">Distribución por estado</h2>
          {statusBreakdown.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-300">Sin datos</div>
          ) : (
            <div className="space-y-2 text-sm">
              {statusBreakdown.map((item) => {
                const percentage = totalStatus ? Math.round((item.count / totalStatus) * 100) : 0;
                return (
                  <div key={item.status} className="flex items-center justify-between">
                    <span className="capitalize">{item.status}</span>
                    <span className="text-gray-600">{item.count} ({percentage}%)</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow dark:shadow-none">
          <h2 className="text-lg md:text-xl font-bold mb-4">Top servicios</h2>
          {typeBreakdown.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-300">Sin datos</div>
          ) : (
            <div className="space-y-2 text-sm">
              {typeBreakdown.map((item) => (
                <div key={item.type} className="flex items-center justify-between">
                  <span className="uppercase">{item.type}</span>
                  <span className="text-gray-600">{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-none">
        <div className="p-4 md:p-6 border-b dark:border-gray-700">
          <h2 className="text-lg md:text-xl font-bold">Transacciones Recientes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-100">ID</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-100">Usuario</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-100">Tipo</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-100">Monto USDT</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-100">Estado</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-100">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {stats?.recentTransactions?.map((tx) => (
                <tr key={tx.id} className="dark:text-gray-100">
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

