import React, { useEffect, useState } from 'react';
import { walletsAPI } from '../services/api';

function Wallets() {
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({
    label: '',
    network: 'bep20',
    address: '',
    active: true
  });

  useEffect(() => {
    fetchWallets();
  }, []);

  const fetchWallets = async () => {
    try {
      const response = await walletsAPI.getAll();
      setWallets(response.data);
    } catch (error) {
      console.error('Error fetching wallets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await walletsAPI.update(editing, formData);
      } else {
        await walletsAPI.create(formData);
      }
      await fetchWallets();
      setShowForm(false);
      setEditing(null);
      setFormData({ label: '', network: 'bep20', address: '', active: true });
    } catch (error) {
      console.error('Error saving wallet:', error);
      alert('Error al guardar wallet');
    }
  };

  const handleEdit = (wallet) => {
    setEditing(wallet.id);
    setFormData({
      label: wallet.label,
      network: wallet.network,
      address: wallet.address,
      active: wallet.active
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar esta wallet?')) {
      return;
    }

    try {
      await walletsAPI.delete(id);
      await fetchWallets();
    } catch (error) {
      console.error('Error deleting wallet:', error);
      alert('Error al eliminar wallet');
    }
  };

  if (loading) {
    return <div className="text-center">Cargando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Wallets</h1>
        <button
          onClick={() => {
            setShowForm(true);
            setEditing(null);
            setFormData({ label: '', network: 'bep20', address: '', active: true });
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          + Nueva Wallet
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-bold mb-4">
            {editing ? 'Editar Wallet' : 'Nueva Wallet'}
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Etiqueta
                </label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Red
                </label>
                <select
                  value={formData.network}
                  onChange={(e) => setFormData({ ...formData, network: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  required
                >
                  <option value="bep20">BEP20</option>
                  <option value="trc20">TRC20</option>
                  <option value="erc20">ERC20</option>
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dirección
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>
            <div className="mb-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="mr-2"
                />
                Activa
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Etiqueta</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Red</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dirección</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {wallets.map((wallet) => (
              <tr key={wallet.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{wallet.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{wallet.label}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm uppercase">{wallet.network}</td>
                <td className="px-6 py-4 text-sm font-mono">{wallet.address}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded ${
                    wallet.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {wallet.active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => handleEdit(wallet)}
                    className="text-blue-600 hover:text-blue-800 mr-2"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(wallet.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Wallets;

