import React, { useEffect, useState } from 'react';
import { transactionsAPI } from '../services/api';

function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => {
    fetchTransactions();
  }, [filter]);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const params = filter !== 'all' ? { status: filter } : {};
      const response = await transactionsAPI.getAll(params);
      setTransactions(response.data.transactions || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      alert('Error al cargar transacciones');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('¿Estás seguro de cancelar esta transacción? Se reembolsará el saldo al usuario.')) {
      return;
    }

    const motivo = prompt('Ingresa el motivo de cancelación (opcional):') || 'Cancelado desde panel de administración';

    try {
      setCancellingId(id);
      await transactionsAPI.updateStatus(id, 'cancelado', motivo);
      alert('✅ Transacción cancelada exitosamente');
      await fetchTransactions();
    } catch (error) {
      console.error('Error cancelling transaction:', error);
      alert('❌ Error al cancelar transacción: ' + (error.response?.data?.error || error.message));
    } finally {
      setCancellingId(null);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('⚠️ ¿Estás seguro de limpiar TODAS las transacciones?\n\nEsto moverá todas las transacciones a "GUARDADO ELIMINADO" y dejará la lista en 0.\n\nEsta acción NO se puede deshacer.')) {
      return;
    }

    const confirmText = prompt('Escribe "LIMPIAR" para confirmar:');
    if (confirmText !== 'LIMPIAR') {
      alert('❌ Confirmación incorrecta. Operación cancelada.');
      return;
    }

    try {
      const response = await transactionsAPI.clearAll();
      alert(`✅ ${response.data.message || 'Transacciones limpiadas exitosamente'}`);
      await fetchTransactions();
    } catch (error) {
      console.error('Error clearing transactions:', error);
      alert('❌ Error al limpiar transacciones: ' + (error.response?.data?.error || error.message));
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pagado':
        return 'bg-green-100 text-green-800';
      case 'pendiente':
      case 'procesando':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelado':
        return 'bg-red-100 text-red-800';
      case 'admitido':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return <div className="text-center">Cargando...</div>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-3">
        <h1 className="text-2xl md:text-3xl font-bold">Transacciones</h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={fetchTransactions}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm md:text-base flex-1 sm:flex-none"
          >
            🔄 Actualizar
          </button>
          <button
            onClick={handleClearAll}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm md:text-base flex-1 sm:flex-none"
          >
            🗑️ Limpiar Todo
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4 md:mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 md:px-4 py-1.5 md:py-2 rounded text-xs md:text-sm ${
            filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Todas
        </button>
        <button
          onClick={() => setFilter('pendiente')}
          className={`px-3 md:px-4 py-1.5 md:py-2 rounded text-xs md:text-sm ${
            filter === 'pendiente' ? 'bg-yellow-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Pendientes
        </button>
        <button
          onClick={() => setFilter('pagado')}
          className={`px-3 md:px-4 py-1.5 md:py-2 rounded text-xs md:text-sm ${
            filter === 'pagado' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Pagadas
        </button>
        <button
          onClick={() => setFilter('cancelado')}
          className={`px-3 md:px-4 py-1.5 md:py-2 rounded text-xs md:text-sm ${
            filter === 'cancelado' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Canceladas
        </button>
      </div>

      {/* Tabla de transacciones */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Monto ARS</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Monto USDT</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-3 md:px-6 py-4 text-center text-gray-500 text-sm">
                    No hay transacciones
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm font-medium">{tx.id}</td>
                    <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">
                      {tx.username || `ID: ${tx.telegram_id || 'N/A'}`}
                    </td>
                    <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">{tx.type || 'N/A'}</td>
                    <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">
                      {tx.amount_ars ? `$${parseFloat(tx.amount_ars).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'}
                    </td>
                    <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">
                      {tx.amount_usdt ? `${parseFloat(tx.amount_usdt).toFixed(2)} USDT` : 'N/A'}
                    </td>
                    <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded ${getStatusColor(tx.status)}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">
                      {formatDate(tx.created_at)}
                    </td>
                    <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">
                      {tx.status !== 'cancelado' && tx.status !== 'pagado' && (
                        <button
                          onClick={() => handleCancel(tx.id)}
                          disabled={cancellingId === tx.id}
                          className={`px-2 md:px-3 py-1 rounded text-xs md:text-sm ${
                            cancellingId === tx.id
                              ? 'bg-gray-400 text-white cursor-not-allowed'
                              : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                        >
                          {cancellingId === tx.id ? 'Cancelando...' : 'Cancelar'}
                        </button>
                      )}
                      {tx.motivo && (
                        <div className="mt-1 text-xs text-gray-500">
                          Motivo: {tx.motivo}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen */}
      <div className="mt-4 md:mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Total</div>
          <div className="text-2xl font-bold">{transactions.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Pendientes</div>
          <div className="text-2xl font-bold text-yellow-600">
            {transactions.filter(t => t.status === 'pendiente' || t.status === 'procesando').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Pagadas</div>
          <div className="text-2xl font-bold text-green-600">
            {transactions.filter(t => t.status === 'pagado').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Canceladas</div>
          <div className="text-2xl font-bold text-red-600">
            {transactions.filter(t => t.status === 'cancelado').length}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Transactions;

