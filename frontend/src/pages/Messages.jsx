import React, { useEffect, useState } from 'react';
import { messagesAPI } from '../services/api';

function Messages() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      const response = await messagesAPI.getAll();
      setMessages(response.data);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (message) => {
    setEditing(message.id);
    setEditContent(message.message);
  };

  const handleSave = async (id, key) => {
    try {
      await messagesAPI.update(key, editContent);
      await fetchMessages();
      setEditing(null);
      setEditContent('');
      alert('✅ Mensaje guardado exitosamente. Los cambios se aplicarán en el bot inmediatamente.');
    } catch (error) {
      console.error('Error saving message:', error);
      alert('❌ Error al guardar mensaje. Por favor intenta nuevamente.');
    }
  };

  const handleCancel = () => {
    setEditing(null);
    setEditContent('');
  };

  const filteredMessages = filter === 'all' 
    ? messages 
    : messages.filter(m => m.category === filter);

  const categories = [...new Set(messages.map(m => m.category))];

  if (loading) {
    return <div className="text-center">Cargando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Mensajes del Bot</h1>
        <div>
          <label className="mr-2">Filtrar por categoría:</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="all">Todas</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4 text-sm text-gray-600">
        Total de mensajes: <strong>{filteredMessages.length}</strong>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mensaje</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredMessages.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                    No hay mensajes disponibles
                  </td>
                </tr>
              ) : (
                filteredMessages.map((message) => (
                  <tr key={message.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono bg-gray-50">{message.key}</td>
                    <td className="px-6 py-4 text-sm">{message.description || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">
                        {message.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {editing === message.id ? (
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full border rounded px-3 py-2 font-mono text-sm"
                          rows="8"
                          style={{ minWidth: '500px', maxWidth: '800px' }}
                        />
                      ) : (
                        <div className="max-w-2xl">
                          <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded border">
                            {message.message}
                          </pre>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {editing === message.id ? (
                        <>
                          <button
                            onClick={() => handleSave(message.id, message.key)}
                            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 mr-2"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={handleCancel}
                            className="px-3 py-1 bg-gray-400 text-white rounded hover:bg-gray-500"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleEdit(message)}
                          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-bold mb-2">💡 Variables disponibles:</h3>
        <p className="text-sm text-gray-700">
          Puedes usar variables en los mensajes usando llaves: {'{variable}'}
        </p>
        <ul className="text-sm text-gray-600 mt-2 list-disc list-inside">
          <li>{'{first_name}'} - Nombre del usuario</li>
          <li>{'{saldo}'} - Saldo del usuario</li>
          <li>{'{amount}'} - Monto</li>
          <li>{'{identifier}'} - Identificador de transacción</li>
          <li>{'{wallets}'} - Lista de wallets</li>
          <li>{'{username}'} - Username del usuario</li>
          <li>{'{motivo}'} - Motivo (para cancelaciones)</li>
          <li>{'{needed}'} - Monto necesario</li>
          <li>{'{have}'} - Monto disponible</li>
        </ul>
      </div>
    </div>
  );
}

export default Messages;
