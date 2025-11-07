import React, { useEffect, useState } from 'react';
import { configAPI } from '../services/api';

function Config() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await configAPI.get();
      setConfig(response.data);
    } catch (error) {
      console.error('Error fetching config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await configAPI.update(config);
      if (response.data.requiresRestart) {
        alert('✅ Configuración guardada exitosamente.\n\n⚠️ IMPORTANTE: El bot token ha sido actualizado. Debes reiniciar el bot para que los cambios surtan efecto.\n\nEn el servidor ejecuta: pm2 restart bot-backend');
      } else {
        alert('✅ Configuración guardada exitosamente');
      }
    } catch (error) {
      console.error('Error saving config:', error);
      alert('❌ Error al guardar configuración: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setConfig({ ...config, [key]: value });
  };

  if (loading) {
    return <div className="text-center">Cargando...</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Configuración</h1>
      
      <div className="bg-white rounded-lg shadow p-6">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bot Token
            </label>
            <input
              type="text"
              value={config.bot_token || ''}
              onChange={(e) => handleChange('bot_token', e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bot Username
            </label>
            <input
              type="text"
              value={config.bot_username || ''}
              onChange={(e) => handleChange('bot_username', e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Admin Groups (JSON array)
            </label>
            <textarea
              value={config.admin_groups || ''}
              onChange={(e) => handleChange('admin_groups', e.target.value)}
              className="w-full border rounded px-3 py-2"
              rows="3"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Admins (JSON array)
            </label>
            <textarea
              value={config.admins || ''}
              onChange={(e) => handleChange('admins', e.target.value)}
              className="w-full border rounded px-3 py-2"
              rows="3"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Usuario Web
            </label>
            <input
              type="text"
              value={config.web_user || ''}
              onChange={(e) => handleChange('web_user', e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña Web
            </label>
            <input
              type="password"
              value={config.web_pass || ''}
              onChange={(e) => handleChange('web_pass', e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña Admin Bot
            </label>
            <input
              type="password"
              value={config.admin_password_bot || ''}
              onChange={(e) => handleChange('admin_password_bot', e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fuente de Precio
            </label>
            <input
              type="text"
              value={config.price_source || ''}
              onChange={(e) => handleChange('price_source', e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cache de Precio (segundos)
            </label>
            <input
              type="number"
              value={config.price_cache_seconds || ''}
              onChange={(e) => handleChange('price_cache_seconds', e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Config;

