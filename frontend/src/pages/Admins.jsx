import React, { useEffect, useState } from 'react';
import { adminsAPI } from '../services/api';

const ROLE_OPTIONS = [
  { value: 'superadmin', label: 'Superadministrador' },
  { value: 'operador', label: 'Operador' },
  { value: 'auditor', label: 'Auditor' }
];

function Admins() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    try {
      const response = await adminsAPI.getAll();
      setAdmins(response.data || []);
    } catch (error) {
      console.error('Error fetching admins:', error);
      alert('Error al cargar administradores');
    } finally {
      setLoading(false);
    }
  };

  const updateAdmin = async (id, payload) => {
    try {
      setUpdatingId(id);
      await adminsAPI.update(id, payload);
      setAdmins((prev) =>
        prev.map((admin) =>
          admin.id === id ? { ...admin, ...payload } : admin
        )
      );
    } catch (error) {
      console.error('Error updating admin:', error);
      alert('No se pudo actualizar el administrador');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRoleChange = (id, newRole) => {
    updateAdmin(id, { role: newRole });
  };

  const handleActiveToggle = (id, currentActive) => {
    updateAdmin(id, { active: !currentActive });
  };

  if (loading) {
    return <div className="text-center">Cargando administradores...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">Administradores</h1>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Telegram ID</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Rol</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Activo</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Creado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {admins.map((admin) => (
                <tr key={admin.id}>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">{admin.id}</td>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">{admin.username}</td>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">{admin.telegram_id || '—'}</td>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">
                    <select
                      value={admin.role || 'superadmin'}
                      onChange={(e) => handleRoleChange(admin.id, e.target.value)}
                      className="border rounded px-2 py-1 text-xs md:text-sm"
                      disabled={updatingId === admin.id}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">
                    <label className="inline-flex items-center">
                      <input
                        type="checkbox"
                        className="form-checkbox h-4 w-4 text-indigo-600"
                        checked={admin.active}
                        onChange={() => handleActiveToggle(admin.id, admin.active)}
                        disabled={updatingId === admin.id}
                      />
                      <span className="ml-2 text-xs md:text-sm">{admin.active ? 'Activo' : 'Inactivo'}</span>
                    </label>
                  </td>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">
                    {admin.created_at ? new Date(admin.created_at).toLocaleDateString('es-AR') : '—'}
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

export default Admins;


