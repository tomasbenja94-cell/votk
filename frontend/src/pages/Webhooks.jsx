import React, { useEffect, useState } from 'react';
import { webhooksAPI } from '../services/api';

const initialFormState = {
  name: '',
  url: '',
  event: '',
  secret: '',
  headers: '',
  active: true
};

function Webhooks() {
  const [webhooks, setWebhooks] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialFormState);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [webhooksRes, eventsRes] = await Promise.all([
        webhooksAPI.getAll(),
        webhooksAPI.getEvents()
      ]);

      setWebhooks(webhooksRes.data || []);
      const eventList = eventsRes.data || [];
      setEvents(eventList);

      if (!editingId) {
        setForm((prev) => ({
          ...prev,
          event: prev.event || eventList[0] || ''
        }));
      }
    } catch (err) {
      console.error('Error cargando webhooks:', err);
      setError('No fue posible cargar los webhooks. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      ...initialFormState,
      event: events[0] || ''
    });
    setEditingId(null);
    setError(null);
  };

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleEdit = (webhook) => {
    setEditingId(webhook.id);
    setForm({
      name: webhook.name,
      url: webhook.url,
      event: webhook.event,
      secret: '',
      headers: webhook.headers && Object.keys(webhook.headers || {}).length > 0
        ? JSON.stringify(webhook.headers, null, 2)
        : '',
      active: webhook.active
    });
    setMessage(null);
    setError(null);
  };

  const handleDelete = async (id) => {
    const confirm = window.confirm('¿Deseas eliminar este webhook? Esta acción no se puede deshacer.');
    if (!confirm) {
      return;
    }

    try {
      await webhooksAPI.delete(id);
      setMessage('Webhook eliminado correctamente.');
      await fetchData();
    } catch (err) {
      console.error('Error eliminando webhook:', err);
      setError(err.response?.data?.error || 'No se pudo eliminar el webhook.');
    }
  };

  const parseHeaders = () => {
    if (!form.headers || form.headers.trim().length === 0) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(form.headers);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      throw new Error('Headers debe ser un objeto JSON (clave: valor).');
    } catch (err) {
      throw new Error('Formato de headers inválido. Utiliza JSON válido.');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    if (!form.name.trim()) {
      setError('El nombre es obligatorio.');
      setSaving(false);
      return;
    }

    if (!form.url.trim()) {
      setError('La URL es obligatoria.');
      setSaving(false);
      return;
    }

    if (!form.event) {
      setError('Selecciona un evento.');
      setSaving(false);
      return;
    }

    let headersPayload;
    try {
      headersPayload = parseHeaders();
    } catch (err) {
      setError(err.message);
      setSaving(false);
      return;
    }

    const payload = {
      name: form.name.trim(),
      url: form.url.trim(),
      event: form.event,
      active: form.active
    };

    if (headersPayload !== undefined) {
      payload.headers = headersPayload;
    }

    const secretTrimmed = form.secret.trim();
    if (editingId) {
      if (secretTrimmed.length > 0) {
        payload.secret = secretTrimmed;
      }
      try {
        await webhooksAPI.update(editingId, payload);
        setMessage('Webhook actualizado correctamente.');
        resetForm();
        await fetchData();
      } catch (err) {
        console.error('Error actualizando webhook:', err);
        setError(err.response?.data?.error || 'No se pudo actualizar el webhook.');
      } finally {
        setSaving(false);
      }
      return;
    }

    if (secretTrimmed.length > 0) {
      payload.secret = secretTrimmed;
    }

    try {
      await webhooksAPI.create(payload);
      setMessage('Webhook creado correctamente.');
      resetForm();
      await fetchData();
    } catch (err) {
      console.error('Error creando webhook:', err);
      setError(err.response?.data?.error || 'No se pudo crear el webhook.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2">🔔 Webhooks</h1>
        <p className="text-gray-600 dark:text-gray-300 text-sm md:text-base">
          Administra integraciones externas para recibir eventos del sistema en tiempo real.
        </p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {message && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          {message}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 md:p-6">
        <h2 className="text-lg md:text-xl font-semibold mb-4">
          {editingId ? 'Editar webhook' : 'Crear nuevo webhook'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Nombre
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring focus:ring-blue-300 dark:bg-gray-900 dark:border-gray-700"
                placeholder="Ej: ERP Corporativo"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                URL destino
              </label>
              <input
                type="url"
                name="url"
                value={form.url}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring focus:ring-blue-300 dark:bg-gray-900 dark:border-gray-700"
                placeholder="https://tu-dominio.com/webhooks/binopolis"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Evento
              </label>
              <select
                name="event"
                value={form.event}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring focus:ring-blue-300 dark:bg-gray-900 dark:border-gray-700"
              >
                {events.map((eventKey) => (
                  <option key={eventKey} value={eventKey}>
                    {eventKey}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Secreto (HMAC)
              </label>
              <input
                type="text"
                name="secret"
                value={form.secret}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring focus:ring-blue-300 dark:bg-gray-900 dark:border-gray-700"
                placeholder={editingId ? 'Deja vacío para conservar el actual' : 'Opcional'}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Headers personalizados (JSON)
            </label>
            <textarea
              name="headers"
              rows={4}
              value={form.headers}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring focus:ring-blue-300 dark:bg-gray-900 dark:border-gray-700 font-mono text-sm"
              placeholder='Ejemplo: {"Authorization": "Bearer token"}'
            />
            <p className="text-xs text-gray-500 mt-1">
              Ingresa un objeto JSON con encabezados adicionales necesarios para la solicitud.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                name="active"
                checked={form.active}
                onChange={handleInputChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              Webhook activo
            </label>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm md:text-base transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear webhook'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="border border-gray-300 px-4 py-2 rounded-md text-sm md:text-base hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Cancelar edición
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg md:text-xl font-semibold">Webhooks configurados</h2>
          {loading && <span className="text-sm text-gray-500">Cargando...</span>}
        </div>

        {webhooks.length === 0 && !loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-300">
            No hay webhooks configurados. Utiliza el formulario superior para crear uno nuevo.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Nombre</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Evento</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">URL</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Activo</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Headers</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {webhooks.map((webhook) => (
                  <tr key={webhook.id} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                    <td className="px-4 py-2 whitespace-nowrap text-gray-800 dark:text-gray-200">
                      <div className="font-medium">{webhook.name}</div>
                      <div className="text-xs text-gray-500">
                        {webhook.has_secret ? '🔐 Con secreto' : 'Sin secreto'}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-gray-800 dark:text-gray-200">
                      {webhook.event}
                    </td>
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-200">
                      <span className="block truncate max-w-xs md:max-w-sm lg:max-w-md" title={webhook.url}>
                        {webhook.url}
                      </span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          webhook.active
                            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200'
                            : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                        }`}
                      >
                        {webhook.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-200">
                      {webhook.headers && Object.keys(webhook.headers || {}).length > 0 ? (
                        <ul className="text-xs space-y-1">
                          {Object.entries(webhook.headers).map(([key, value]) => (
                            <li key={key}>
                              <span className="font-medium">{key}:</span> {value}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-gray-500">Sin headers</span>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(webhook)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(webhook.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Webhooks;

