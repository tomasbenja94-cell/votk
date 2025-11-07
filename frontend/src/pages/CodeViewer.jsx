import React, { useEffect, useState } from 'react';
import { codeAPI } from '../services/api';

function CodeViewer() {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await codeAPI.getFiles();
      setFiles(response.data);
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (file) => {
    setSelectedFile(file);
    try {
      const response = await codeAPI.getFile(file.path);
      setContent(response.data.content);
    } catch (error) {
      console.error('Error fetching file:', error);
      alert('Error al cargar archivo');
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;

    setSaving(true);
    try {
      await codeAPI.updateFile(selectedFile.path, content);
      alert('Archivo guardado exitosamente. Se creó un backup automático.');
    } catch (error) {
      console.error('Error saving file:', error);
      alert('Error al guardar archivo');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center">Cargando...</div>;
  }

  return (
    <div className="flex h-full">
      <div className="w-64 bg-gray-100 p-4 overflow-y-auto">
        <h2 className="font-bold mb-4">Archivos</h2>
        <div className="space-y-1">
          {files.map((file) => (
            <button
              key={file.path}
              onClick={() => handleFileSelect(file)}
              className={`block w-full text-left px-3 py-2 rounded ${
                selectedFile?.path === file.path
                  ? 'bg-blue-600 text-white'
                  : 'bg-white hover:bg-gray-200'
              }`}
            >
              {file.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedFile ? (
          <>
            <div className="bg-gray-200 p-4 flex justify-between items-center">
              <h2 className="font-bold">{selectedFile.path}</h2>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1 p-4 font-mono text-sm border-t"
              style={{ minHeight: '400px' }}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Selecciona un archivo para ver su contenido
          </div>
        )}
      </div>
    </div>
  );
}

export default CodeViewer;

