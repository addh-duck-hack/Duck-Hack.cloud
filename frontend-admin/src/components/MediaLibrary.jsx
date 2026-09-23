// Biblioteca de medios: cuadrícula de todo lo que hay en uploads/ (ver
// packages/core-api/modules/media.js). Al pulsar un medio se abre en pantalla
// completa con el formulario de título / texto alternativo y el botón de
// eliminar — si el medio está en uso, se muestran los usos y se pide
// confirmación antes de reintentar con ?force=true.
import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "../utils/apiBaseUrl";
import { formatBytes } from "../utils/formatBytes";
import {
  MEDIA_KIND_LABELS as KIND_LABELS,
  acceptForKinds,
  fetchMediaItems,
  getMediaAuthHeaders as getAuthHeaders,
  getMediaErrorMessage as getErrorMessage,
  mediaSrc,
  uploadMediaFile,
} from "../utils/mediaApi";
import MediaPreview from "./MediaPreview";
import "./MediaLibrary.css";

const ACCEPTED_TYPES = acceptForKinds(["image", "gif", "video"]);

const MediaViewer = ({ item, src, onClose, onPrev, onNext, onSaved, onDeleted }) => {
  const [title, setTitle] = useState(item.title);
  const [altText, setAltText] = useState(item.altText);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [usages, setUsages] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const baseUrl = getApiBaseUrl();
  const fileUrl = `${baseUrl}/api/media/${encodeURIComponent(item.fileName)}`;

  useEffect(() => {
    setTitle(item.title);
    setAltText(item.altText);
    setConfirmingDelete(false);
    setError("");
    setSuccess("");
    setUsages(null);

    let cancelled = false;
    axios
      .get(`${fileUrl}/usage`, { headers: getAuthHeaders() })
      .then((response) => {
        if (!cancelled) setUsages(response.data?.items || []);
      })
      .catch(() => {
        if (!cancelled) setUsages([]);
      });
    return () => {
      cancelled = true;
    };
    // Solo al cambiar de medio — tras guardar, `item` se reemplaza por la
    // versión actualizada y no debe borrar el mensaje de éxito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.target.closest?.("input, textarea")) return;
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onPrev();
      if (event.key === "ArrowRight") onNext();
    };
    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, onPrev, onNext]);

  const isDirty = title.trim() !== item.title || altText.trim() !== item.altText;

  const handleSave = async (event) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("El nombre no puede quedar vacío.");
      return;
    }
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await axios.put(fileUrl, { title, altText }, { headers: getAuthHeaders() });
      onSaved(response.data.item);
      setSuccess("Cambios guardados.");
    } catch (err) {
      setError(getErrorMessage(err, "No fue posible guardar los cambios."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (force) => {
    setIsDeleting(true);
    setError("");
    try {
      await axios.delete(fileUrl, { headers: getAuthHeaders(), params: force ? { force: true } : undefined });
      onDeleted(item.fileName);
    } catch (err) {
      if (err.response?.data?.error?.code === "MEDIA_IN_USE") {
        setUsages(err.response.data.error.details || []);
        setConfirmingDelete(true);
      } else {
        setError(getErrorMessage(err, "No fue posible eliminar el medio."));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="media-viewer" role="dialog" aria-modal="true" aria-label={item.title}>
      <div className="media-viewer-stage" onClick={onClose}>
        <button type="button" className="media-viewer-nav prev" onClick={(e) => { e.stopPropagation(); onPrev(); }} aria-label="Anterior">
          <i className="fas fa-chevron-left" aria-hidden="true" />
        </button>
        <div className="media-viewer-media" onClick={(e) => e.stopPropagation()}>
          <MediaPreview item={item} src={src} controls />
        </div>
        <button type="button" className="media-viewer-nav next" onClick={(e) => { e.stopPropagation(); onNext(); }} aria-label="Siguiente">
          <i className="fas fa-chevron-right" aria-hidden="true" />
        </button>
      </div>

      <aside className="media-viewer-panel">
        <div className="media-viewer-panel-head">
          <span className="badge badge-blue">{KIND_LABELS[item.kind] || item.kind}</span>
          <button type="button" className="media-viewer-close" onClick={onClose} aria-label="Cerrar">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <dl className="media-viewer-meta">
          <dt>Archivo</dt>
          <dd>
            <a href={src} target="_blank" rel="noopener noreferrer">{item.fileName}</a>
          </dd>
          <dt>Tamaño</dt>
          <dd>{formatBytes(item.size)}</dd>
          <dt>Subido</dt>
          <dd>{new Date(item.uploadedAt).toLocaleString()}</dd>
        </dl>

        <form className="media-viewer-form" onSubmit={handleSave}>
          <label htmlFor="media-title">Nombre</label>
          <input id="media-title" type="text" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />

          <label htmlFor="media-alt">Texto alternativo</label>
          <textarea
            id="media-alt"
            rows={3}
            maxLength={500}
            placeholder="Se muestra cuando la imagen o el video no se pueden cargar"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
          />

          <button type="submit" disabled={!isDirty || isSaving}>
            {isSaving ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>

        {success ? <div className="auth-success">{success}</div> : null}
        {error ? <div className="auth-error">{error}</div> : null}

        <div className="media-viewer-usage">
          <h4>Dónde se usa</h4>
          {usages === null ? <p>Revisando...</p> : null}
          {usages?.length === 0 ? <p>No está en uso.</p> : null}
          {usages?.length ? (
            <ul>
              {usages.map((usage, index) => (
                <li key={`${usage.type}-${usage.id || usage.field}-${index}`}>{usage.label}</li>
              ))}
            </ul>
          ) : null}
        </div>

        {confirmingDelete ? (
          <div className="client-alert client-alert-danger media-viewer-confirm">
            <p>
              Este medio se usa en {usages?.length || 0} lugar(es). Si lo eliminas, esos lugares se quedarán sin imagen.
            </p>
            <div className="media-viewer-actions">
              <button type="button" className="btn-danger" disabled={isDeleting} onClick={() => handleDelete(true)}>
                {isDeleting ? "Eliminando..." : "Eliminar de todas formas"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setConfirmingDelete(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn-danger media-viewer-delete"
            disabled={isDeleting}
            onClick={() => (usages?.length ? setConfirmingDelete(true) : handleDelete(false))}
          >
            <i className="fas fa-trash" aria-hidden="true" /> {isDeleting ? "Eliminando..." : "Eliminar medio"}
          </button>
        )}
      </aside>
    </div>
  );
};

const MediaLibrary = () => {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [selectedFileName, setSelectedFileName] = useState(null);
  const fileInputRef = useRef(null);

  const srcFor = (item) => mediaSrc(item.path);

  const loadMedia = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setItems(await fetchMediaItems());
    } catch (err) {
      setError(getErrorMessage(err, "No fue posible cargar los medios."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  // Varios archivos se suben uno por uno: si uno falla, los demás siguen y
  // se reportan todos los errores juntos.
  const handleFilesSelected = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    setIsUploading(true);
    setError("");
    const uploaded = [];
    const failures = [];
    for (const file of files) {
      try {
        uploaded.push(await uploadMediaFile(file));
      } catch (err) {
        failures.push(`${file.name}: ${getErrorMessage(err, "no se pudo subir.")}`);
      }
    }
    setItems((current) => [...uploaded.reverse(), ...current]);
    if (failures.length) setError(failures.join(" · "));
    setIsUploading(false);
  };

  const visibleItems = kindFilter === "all" ? items : items.filter((item) => item.kind === kindFilter);
  const selectedIndex = visibleItems.findIndex((item) => item.fileName === selectedFileName);
  const selectedItem = selectedIndex >= 0 ? visibleItems[selectedIndex] : null;

  const closeViewer = useCallback(() => setSelectedFileName(null), []);
  const showSibling = useCallback(
    (offset) => {
      if (selectedIndex < 0 || visibleItems.length === 0) return;
      const nextIndex = (selectedIndex + offset + visibleItems.length) % visibleItems.length;
      setSelectedFileName(visibleItems[nextIndex].fileName);
    },
    [selectedIndex, visibleItems]
  );
  const showPrev = useCallback(() => showSibling(-1), [showSibling]);
  const showNext = useCallback(() => showSibling(1), [showSibling]);

  const handleSaved = (updated) => {
    setItems((current) => current.map((item) => (item.fileName === updated.fileName ? updated : item)));
  };

  const handleDeleted = (fileName) => {
    setItems((current) => current.filter((item) => item.fileName !== fileName));
    setSelectedFileName(null);
  };

  return (
    <section>
      <div className="media-toolbar">
        <h3 style={{ margin: 0 }}>Medios</h3>
        <div className="media-toolbar-actions">
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} aria-label="Filtrar por tipo">
            <option value="all">Todos</option>
            <option value="image">Imágenes</option>
            <option value="gif">GIF</option>
            <option value="video">Videos</option>
          </select>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            <i className="fas fa-upload" aria-hidden="true" /> {isUploading ? "Subiendo..." : "Subir medio"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            hidden
            onChange={handleFilesSelected}
          />
        </div>
      </div>
      <p>Archivos de la carpeta uploads/. JPG, PNG o GIF hasta 10 MB; MP4 o WebM hasta 50 MB.</p>

      {error ? <div className="auth-error">{error}</div> : null}

      {isLoading && items.length === 0 ? <p>Cargando medios...</p> : null}
      {!isLoading && visibleItems.length === 0 && !error ? <p>No hay medios todavía.</p> : null}

      <div className="media-grid">
        {visibleItems.map((item) => (
          <button
            key={item.fileName}
            type="button"
            className="media-card"
            onClick={() => setSelectedFileName(item.fileName)}
            title={item.title}
          >
            <div className="media-card-thumb">
              <MediaPreview item={item} src={srcFor(item)} />
              {item.kind !== "image" ? (
                <span className="media-card-kind">
                  {item.kind === "video" ? <i className="fas fa-play" aria-hidden="true" /> : null} {KIND_LABELS[item.kind]}
                </span>
              ) : null}
            </div>
            <span className="media-card-title">{item.title}</span>
            <span className="media-card-sub">{formatBytes(item.size)}</span>
          </button>
        ))}
      </div>

      {selectedItem ? (
        <MediaViewer
          item={selectedItem}
          src={srcFor(selectedItem)}
          onClose={closeViewer}
          onPrev={showPrev}
          onNext={showNext}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      ) : null}
    </section>
  );
};

export default MediaLibrary;
