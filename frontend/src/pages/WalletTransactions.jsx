import React, { useEffect, useState } from 'react';
import { walletTransactionsAPI } from '../services/api';

function WalletTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(null);

  useEffect(() => {
    fetchTransactions();
    
    // Auto-refresh cada 30 segundos
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchTransactions();
      }, 30000);
      setRefreshInterval(interval);
      
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const fetchTransactions = async () => {
    try {
      setError('');
      setLoading(true);
      console.log('🔄 Solicitando transacciones de wallets...');
      const response = await walletTransactionsAPI.getTransactions();
      const allTransactions = response.data || [];
      console.log(`✅ Transacciones recibidas: ${allTransactions.length}`);
      
      // Separar por red
      const bep20Transactions = allTransactions.filter(tx => 
        tx.network === 'BEP20' || tx.network === 'BSC'
      );
      const trc20Transactions = allTransactions.filter(tx => 
        tx.network === 'TRC20' || tx.network === 'TRON'
      );
      
      console.log(`📊 BEP20: ${bep20Transactions.length}, TRC20: ${trc20Transactions.length}`);
      console.log('🔍 BEP20 transactions:', bep20Transactions);
      console.log('🔍 TRC20 transactions:', trc20Transactions);
      
      setTransactions(allTransactions);
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.response?.data?.details || err.message || 'Error al cargar transacciones';
      setError(`Error: ${errorMessage}`);
      console.error('❌ Error fetching wallet transactions:', err);
      console.error('Error response:', err.response?.data);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('es-AR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatAmount = (value, decimals = 18) => {
    if (!value) return '0';
    const amount = parseFloat(value) / Math.pow(10, decimals);
    return amount.toFixed(6);
  };

  const getExplorerLink = (tx) => {
    if (tx.network === 'BSC' || tx.network === 'BEP20') {
      return `https://bscscan.com/tx/${tx.hash}`;
    } else if (tx.network === 'TRON' || tx.network === 'TRC20') {
      return `https://tronscan.org/#/transaction/${tx.hash}`;
    }
    return '#';
  };

  const getWalletLink = (address, network) => {
    if (network === 'BSC' || network === 'BEP20') {
      return `https://bscscan.com/address/${address}`;
    } else if (network === 'TRON' || network === 'TRC20') {
      return `https://tronscan.org/#/address/${address}`;
    }
    return '#';
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-6">💳 Transacciones de Wallets</h1>
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Cargando transacciones...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">💳 Transacciones de Wallets</h1>
        <div className="flex gap-4 items-center">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-600">Auto-actualizar (30s)</span>
          </label>
          <button
            onClick={fetchTransactions}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
          >
            🔄 Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p className="font-bold">Error al cargar transacciones</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={fetchTransactions}
            className="mt-2 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Sección BEP20 con enlace a BSCScan */}
      <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
        <div className="px-6 py-4 bg-yellow-50 border-b">
          <h2 className="text-xl font-bold">
            🟡 BEP20 (Binance Smart Chain)
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Ver transacciones en BSCScan
          </p>
        </div>
        <div className="p-8">
          <div className="text-center">
            <div className="mb-6">
              <div className="inline-block bg-yellow-100 rounded-full p-4 mb-4">
                <svg className="w-16 h-16 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Transacciones BEP20</h3>
              <p className="text-gray-600 mb-4">
                Haz clic en el botón para ver todas las transacciones BEP20 en BSCScan
              </p>
              <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
                <p className="text-sm text-gray-700 mb-2">
                  <strong>Wallet:</strong>
                </p>
                <p className="text-xs font-mono text-gray-600 break-all">
                  0x009d4b9Aa21A320EEB130720FE4626b79671155E
                </p>
              </div>
            </div>
            <a
              href="https://bscscan.com/address/0x009d4b9Aa21A320EEB130720FE4626b79671155E#tokentxns"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg text-lg font-semibold transition-all transform hover:scale-105 shadow-lg hover:shadow-xl"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Abrir Transacciones BEP20 en BSCScan
            </a>
            <p className="text-xs text-gray-500 mt-4">
              Se abrirá en una nueva pestaña
            </p>
          </div>
        </div>
      </div>

      {/* Separar transacciones por red para TRC20 */}
      {(() => {
        const trc20Transactions = transactions.filter(tx => 
          tx.network === 'TRC20' || tx.network === 'TRON'
        );

        const renderTable = (txList, networkName, networkColor) => (
          <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
            <div className={`px-6 py-4 ${networkColor} border-b`}>
              <h2 className="text-xl font-bold">
                {networkName === 'BEP20' ? '🟡 BEP20 (Binance Smart Chain)' : '🟢 TRC20 (TRON)'}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Total: <strong>{txList.length}</strong> transacciones
              </p>
            </div>
            {txList.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No hay transacciones {networkName} disponibles</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Hash
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Desde
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Hacia
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Monto (USDT)
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fecha
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {txList.map((tx, index) => (
                      <tr key={`${networkName}-${index}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <a
                            href={getExplorerLink(tx)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-sm font-mono"
                          >
                            {tx.hash ? `${tx.hash.substring(0, 10)}...${tx.hash.substring(tx.hash.length - 8)}` : 'N/A'}
                          </a>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <a
                            href={getWalletLink(tx.from, tx.network)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-sm font-mono"
                          >
                            {tx.from ? `${tx.from.substring(0, 8)}...${tx.from.substring(tx.from.length - 6)}` : 'N/A'}
                          </a>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <a
                            href={getWalletLink(tx.to, tx.network)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-sm font-mono"
                          >
                            {tx.to ? `${tx.to.substring(0, 8)}...${tx.to.substring(tx.to.length - 6)}` : 'N/A'}
                          </a>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                          {formatAmount(tx.value, tx.tokenDecimal || 18)} USDT
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(tx.timeStamp)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            tx.status === '1' || tx.confirmed
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {tx.status === '1' || tx.confirmed ? '✅ Confirmado' : '⏳ Pendiente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );

        return (
          <>
            {renderTable(trc20Transactions, 'TRC20', 'bg-green-50')}
          </>
        );
      })()}

      <div className="mt-4 text-sm text-gray-500 bg-gray-50 p-4 rounded">
        <p>💡 Las transacciones se actualizan automáticamente cada 30 segundos cuando está activado el auto-actualizar.</p>
        <p className="mt-2">
          📊 Total de transacciones: <strong>{transactions.length}</strong>
          {' '}(BEP20: <strong>{transactions.filter(tx => tx.network === 'BEP20' || tx.network === 'BSC').length}</strong>, 
          TRC20: <strong>{transactions.filter(tx => tx.network === 'TRC20' || tx.network === 'TRON').length}</strong>)
        </p>
        <p className="mt-2">
          📊 Wallets monitoreadas:
          <a href="https://bscscan.com/address/0x009d4b9Aa21A320EEB130720FE4626b79671155E" target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 hover:underline">
            BEP20 (BSCScan)
          </a>
          {' | '}
          <a href="https://tronscan.org/#/address/TCFeWDZgCZQxuveQUDEEpdq9TA31itHkdM" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            TRC20 (Tronscan)
          </a>
        </p>
      </div>
    </div>
  );
}

export default WalletTransactions;

