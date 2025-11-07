import React, { useEffect, useState } from 'react';
import { transactionsAPI } from '../services/api';

function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [cancellingId, setCancellingId] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchTransactions({ status: filter });
  }, [filter]);

  const fetchTransactions = async (overrides = {}) => {
    try {
      setLoading(true);
      const statusParam = overrides.status !== undefined ? overrides.status : filter;
      const typeParam = overrides.type !== undefined ? overrides.type : typeFilter;
      const fromParam = overrides.from !== undefined ? overrides.from : dateFrom;
      const toParam = overrides.to !== undefined ? overrides.to : dateTo;
      const searchParam = overrides.search !== undefined ? overrides.search : searchTerm;

      const params = {};

      if (statusParam && statusParam !== 'all') {
        params.status = statusParam;
      }

      if (typeParam && typeParam !== 'all') {
        params.type = typeParam;
      }

      if (fromParam) {
        params.from = `${fromParam}T00:00:00`;
      }

      if (toParam) {
        params.to = `${toParam}T23:59:59`;
      }

      if (searchParam) {
        params.search = searchParam;
      }

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

  const handleTypeChange = (value) => {
    setTypeFilter(value);
    fetchTransactions({ type: value });
  };

  const handleDateFromChange = (value) => {
    if (dateTo && value && value > dateTo) {
      alert('La fecha "Desde" no puede ser posterior a la fecha "Hasta".');
      return;
    }
    setDateFrom(value);
    fetchTransactions({ from: value });
  };

  const handleDateToChange = (value) => {
    if (dateFrom && value && value < dateFrom) {
      alert('La fecha "Hasta" no puede ser anterior a la fecha "Desde".');
      return;
    }
    setDateTo(value);
    fetchTransactions({ to: value });
  };

  const handleSearch = () => {
    setSearchTerm(searchInput);
    fetchTransactions({ search: searchInput });
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSearch();
    }
  };

  const handleResetFilters = () => {
    setFilter('all');
    setTypeFilter('all');
    setDateFrom('');
    setDateTo('');
    setSearchInput('');
    setSearchTerm('');
    fetchTransactions({ status: 'all', type: 'all', from: '', to: '', search: '' });
  };

  const buildExportParams = () => {
    const params = {};
    if (filter !== 'all') params.status = filter;
    if (typeFilter !== 'all') params.type = typeFilter;
    if (dateFrom) params.from = `${dateFrom}T00:00:00`;
    if (dateTo) params.to = `${dateTo}T23:59:59`;
    if (searchTerm) params.search = searchTerm;
    return params;
  };

  const handleExport = async (format) => {
    try {
      setIsExporting(true);
      const params = buildExportParams();
      const response = await transactionsAPI.export(format, params);
      const blob = new Blob([response.data], { type: format === 'csv' ? 'text/csv' : 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = format === 'csv' ? 'transacciones.csv' : 'transacciones.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting transactions:', error);
      alert('❌ Error al exportar transacciones: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsExporting(false);
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

  const totalPendientes = transactions.filter(t => t.status === 'pendiente' || t.status === 'procesando').length;
  const totalPagadas = transactions.filter(t => t.status === 'pagado').length;
  const totalCanceladas = transactions.filter(t => t.status === 'cancelado').length;
  const totalPagos = transactions.filter(t => t.type === 'pago').length;
  const totalCargas = transactions.filter(t => t.type === 'carga').length;
  const totalReembolsos = transactions.filter(t => t.type === 'reembolso').length;
  const totalUSDT = transactions.reduce((sum, tx) => sum + (parseFloat(tx.amount_usdt) || 0), 0);

  const renderProgress = (tx) => {
    if (tx.status === 'cancelado') {
      const receivedAt = tx.created_at ? formatDate(tx.created_at) : null;
      const cancelledAt = tx.cancelled_at ? formatDate(tx.cancelled_at) : tx.updated_at ? formatDate(tx.updated_at) : null;
      return (
        <div className="flex flex-col gap-1 text-xs text-red-600">
          <div className="flex items-center gap-1">
            <span>✅</span>
            <span>Recibido</span>
          </div>
          {receivedAt && <span className="pl-5 text-[10px] text-gray-400">{receivedAt}</span>}
          <div className="flex items-center gap-1">
            <span>❌</span>
            <span>Cancelado</span>
          </div>
          {cancelledAt && <span className="pl-5 text-[10px] text-gray-400">{cancelledAt}</span>}
        </div>
      );
    }

    const steps = [
      { label: 'Recibido', done: true, timestamp: tx.created_at },
      {
        label: 'En revisión',
        done: Boolean(tx.review_started_at) || ['procesando', 'admitido', 'pagado'].includes(tx.status),
        timestamp: tx.review_started_at
      },
      {
        label: 'Admitido',
        done: ['admitido', 'pagado'].includes(tx.status),
        timestamp: tx.admitted_at
      },
      { label: 'Pagado', done: tx.status === 'pagado', timestamp: tx.paid_at }
    ];

    return (
      <div className="flex flex-col gap-1 text-xs">
        {steps.map((step) => {
          const formatted = step.done && step.timestamp ? formatDate(step.timestamp) : null;
          return (
            <div
              key={step.label}
              className={`flex flex-col ${step.done ? 'text-green-600' : 'text-gray-500'}`}
            >
              <div className="flex items-center gap-1">
                <span>{step.done ? '✅' : '⏳'}</span>
                <span>{step.label}</span>
              </div>
              {formatted && <span className="pl-5 text-[10px] text-gray-400">{formatted}</span>}
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return <div className="text-center">Cargando...</div>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-3">
        <h1 className="text-2xl md:text-3xl font-bold">Transacciones</h1>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button
            onClick={() => fetchTransactions()}
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
          <button
            onClick={() => handleExport('csv')}
            disabled={isExporting}
            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 text-sm md:text-base flex-1 sm:flex-none disabled:opacity-60"
          >
            📄 Exportar CSV
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={isExporting}
            className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-black text-sm md:text-base flex-1 sm:flex-none disabled:opacity-60"
          >
            📄 Exportar PDF
          </button>
        </div>
      </div>

      {/* Controles avanzados */}
      <div className="mb-4 md:mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Tipo</label>
          <select
            value={typeFilter}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="px-3 py-2 border rounded text-sm"
          >
            <option value="all">Todos</option>
            <option value="pago">Pagos</option>
            <option value="carga">Cargas</option>
            <option value="reembolso">Reembolsos</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Desde</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => handleDateFromChange(e.target.value)}
            className="px-3 py-2 border rounded text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleDateToChange(e.target.value)}
            className="px-3 py-2 border rounded text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Buscar (usuario o identificador)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="flex-1 px-3 py-2 border rounded text-sm"
              placeholder="Ej: @usuario o código"
            />
            <button
              onClick={handleSearch}
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              Buscar
            </button>
          </div>
        </div>
      </div>

      {/* Filtros por estado */}
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
        <button
          onClick={handleResetFilters}
          className="px-3 md:px-4 py-1.5 md:py-2 rounded text-xs md:text-sm bg-gray-200 text-gray-700 hover:bg-gray-300"
        >
          Limpiar filtros
        </button>
      </div>

      {/* Tabla de transacciones */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-100">ID</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-100">Usuario</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-100">Tipo</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-100">Monto ARS</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-100">Monto USDT</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-100">Estado</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-100">Fecha</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-100">Progreso</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-100">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-3 md:px-6 py-4 text-center text-gray-500 dark:text-gray-300 text-sm">
                    No hay transacciones
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="dark:text-gray-100">
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
                    <td className="px-3 md:px-6 py-3 md:py-4 text-xs md:text-sm">
                      {renderProgress(tx)}
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
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow dark:shadow-none">
          <div className="text-sm text-gray-600 dark:text-gray-300">Total</div>
          <div className="text-2xl font-bold">{transactions.length}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow dark:shadow-none">
          <div className="text-sm text-gray-600 dark:text-gray-300">Pendientes</div>
          <div className="text-2xl font-bold text-yellow-600">{totalPendientes}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow dark:shadow-none">
          <div className="text-sm text-gray-600 dark:text-gray-300">Pagadas</div>
          <div className="text-2xl font-bold text-green-600">{totalPagadas}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow dark:shadow-none">
          <div className="text-sm text-gray-600 dark:text-gray-300">Canceladas</div>
          <div className="text-2xl font-bold text-red-600">{totalCanceladas}</div>
        </div>
      </div>

      <div className="mt-4 md:mt-6 grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow dark:shadow-none">
          <div className="text-sm text-gray-600 dark:text-gray-300">Pagos</div>
          <div className="text-xl font-semibold text-blue-600">{totalPagos}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow dark:shadow-none">
          <div className="text-sm text-gray-600 dark:text-gray-300">Cargas</div>
          <div className="text-xl font-semibold text-emerald-600">{totalCargas}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow dark:shadow-none">
          <div className="text-sm text-gray-600 dark:text-gray-300">Reembolsos</div>
          <div className="text-xl font-semibold text-purple-600">{totalReembolsos}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow dark:shadow-none">
          <div className="text-sm text-gray-600 dark:text-gray-300">Total USDT (muestra)</div>
          <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">{totalUSDT.toFixed(2)} USDT</div>
        </div>
      </div>
    </div>
  );
}

export default Transactions;

