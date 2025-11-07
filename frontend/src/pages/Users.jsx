import React, { useEffect, useState } from 'react';
import { usersAPI } from '../services/api';

function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await usersAPI.getAll();
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user) => {
    setEditing(user.id);
    setEditForm({ saldo_usdt: parseFloat(user.saldo_usdt || 0), username: user.username });
  };

  const handleSave = async (id) => {
    try {
      await usersAPI.update(id, editForm);
      await fetchUsers();
      setEditing(null);
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Error al actualizar usuario');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este usuario?')) {
      return;
    }

    try {
      await usersAPI.delete(id);
      await fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Error al eliminar usuario');
    }
  };

  if (loading) {
    return <div className="text-center">Cargando...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">Usuarios</h1>
      
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Telegram ID</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Saldo USDT</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Creado</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">{user.id}</td>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">{user.telegram_id}</td>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">
                    {editing === user.id ? (
                      <input
                        type="text"
                        value={editForm.username || ''}
                        onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                        className="border rounded px-2 py-1 text-xs md:text-sm w-full max-w-[150px]"
                      />
                    ) : (
                    user.username || 'N/A'
                    )}
                  </td>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">
                    {editing === user.id ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.saldo_usdt || 0}
                        onChange={(e) => setEditForm({ ...editForm, saldo_usdt: parseFloat(e.target.value) })}
                        className="border rounded px-2 py-1 text-xs md:text-sm w-full max-w-[100px]"
                      />
                    ) : (
                      parseFloat(user.saldo_usdt || 0).toFixed(2)
                    )}
                  </td>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">
                    {new Date(user.created_at).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-xs md:text-sm">
                  {editing === user.id ? (
                    <>
                      <button
                        onClick={() => handleSave(user.id)}
                        className="text-green-600 hover:text-green-800 mr-2"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="text-gray-600 hover:text-gray-800"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEdit(user)}
                        className="text-blue-600 hover:text-blue-800 mr-2"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Eliminar
                      </button>
                    </>
                  )}
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

export default Users;

