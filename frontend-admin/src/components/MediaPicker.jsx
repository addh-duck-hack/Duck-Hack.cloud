// Selector de medios: modal para elegir uno (o varios, con `multiple`) de la
// biblioteca de uploads/ o subir uno nuevo, que queda seleccionado al
// terminar. Lo usan MediaField.jsx (un solo valor) y ProductImageGallery.jsx
// (varias imágenes). Se monta en un portal sobre document.body: los campos
// que lo abren viven dentro de <form>s (producto, configuración de tienda) y
// así ni el Enter del buscador los envía ni heredan el estilo global de form.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatBytes } from "../utils/formatBytes";
import {
  MEDIA_KIND_LABELS,
  acceptForKinds,
  fetchMediaItems,
  getMediaErrorMessage,
  mediaSrc,
  uploadMediaFile,
} from "../utils/mediaApi";
import MediaPreview from "./MediaPreview";
import "./MediaLibrary.css";

const MediaPicker = ({
  kinds = ["image"],
  multiple = false,
  title = "Elegir medio",
  disabledPaths = [],
  onSelect,
  onClose,
}) => {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedPaths, setSelectedPaths] = useState([]);
  const fileInputRef = useRef(null);

  const kindsKey = kinds.join(",");

  useEffect(() => {
    let cancelled = false;
    fetchMediaItems()
      .then((all) => {
        if (!cancelled) setItems(all.filter((item) => kinds.includes(item.kind)));
      })
      .catch((err) => {
        if (!cancelled) setError(getMediaErrorMessage(err, "No fue posible cargar los medios."));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindsKey]);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (item) => item.title.toLowerCase().includes(term) || item.fileName.toLowerCase().includes(term)
    );
  }, [items, search]);

  const toggle = (path) => {
    if (disabledPaths.includes(path)) return;
    setSelectedPaths((current) => {
      if (!multiple) return current[0] === path ? [] : [path];
      return current.includes(path) ? current.filter((p) => p !== path) : [...current, path];
    });
  };

  const confirm = (paths = selectedPaths) => {
    const byPath = new Map(items.map((item) => [item.path, item]));
    const chosen = paths.map((path) => byPath.get(path)).filter(Boolean);
    if (chosen.length) onSelect(chosen);
  };

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
        const item = await uploadMediaFile(file);
        if (kinds.includes(item.kind)) {
          uploaded.push(item);
        } else {
          failures.push(`${file.name}: se subió a Medios, pero aquí solo se acepta ${kinds.map((k) => MEDIA_KIND_LABELS[k]).join(" / ")}.`);
        }
      } catch (err) {
        failures.push(`${file.name}: ${getMediaErrorMessage(err, "no se pudo subir.")}`);
      }
    }
    setIsUploading(false);
    if (failures.length) setError(failures.join(" · "));
    if (uploaded.length === 0) return;

    const newPaths = uploaded.map((item) => item.path);
    setItems((current) => [...uploaded.reverse(), ...current]);
    setSearch("");
    setSelectedPaths((current) => (multiple ? [...current, ...newPaths] : [newPaths[0]]));
  };

  const kindsLabel = kinds.map((kind) => MEDIA_KIND_LABELS[kind]).join(", ");

  return createPortal(
    // Los eventos sintéticos de React cruzan el portal hacia los padres (ej. el
    // encabezado plegable de StoreConfigListEditor): se cortan aquí.
    <div
      className="media-picker-backdrop"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        className="media-picker"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="media-picker-head">
          <h3>{title}</h3>
          <button type="button" className="media-viewer-close" onClick={onClose} aria-label="Cerrar">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </header>

        <div className="media-picker-toolbar">
          <input
            type="search"
            placeholder="Buscar por nombre"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Buscar medios"
          />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            <i className="fas fa-upload" aria-hidden="true" /> {isUploading ? "Subiendo..." : "Subir nuevo"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptForKinds(kinds)}
            multiple={multiple}
            hidden
            onChange={handleFilesSelected}
          />
        </div>
        <p className="media-picker-hint">
          Tipos permitidos: {kindsLabel}.{multiple ? " Puedes elegir varios." : ""}
        </p>

        {error ? <div className="auth-error">{error}</div> : null}

        <div className="media-picker-body">
          {isLoading ? <p>Cargando medios...</p> : null}
          {!isLoading && visibleItems.length === 0 ? (
            <p>{search ? "Ningún medio coincide con la búsqueda." : "Todavía no hay medios de este tipo. Sube uno nuevo."}</p>
          ) : null}

          <div className="media-grid">
            {visibleItems.map((item) => {
              const isDisabled = disabledPaths.includes(item.path);
              const selectedIndex = selectedPaths.indexOf(item.path);
              const isSelected = selectedIndex >= 0;
              return (
                <button
                  key={item.fileName}
                  type="button"
                  className={`media-card${isSelected ? " is-selected" : ""}${isDisabled ? " is-disabled" : ""}`}
                  onClick={() => toggle(item.path)}
                  onDoubleClick={() => !multiple && !isDisabled && confirm([item.path])}
                  aria-pressed={isSelected}
                  disabled={isDisabled}
                  title={isDisabled ? "Ya está agregado" : item.title}
                >
                  <div className="media-card-thumb">
                    <MediaPreview item={item} src={mediaSrc(item.path)} />
                    {isSelected ? (
                      <span className="media-card-check">{multiple ? selectedIndex + 1 : <i className="fas fa-check" aria-hidden="true" />}</span>
                    ) : null}
                    {item.kind !== "image" ? <span className="media-card-kind">{MEDIA_KIND_LABELS[item.kind]}</span> : null}
                  </div>
                  <span className="media-card-title">{item.title}</span>
                  <span className="media-card-sub">{isDisabled ? "Ya agregado" : formatBytes(item.size)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <footer className="media-picker-foot">
          <span>
            {selectedPaths.length === 0
              ? "Ningún medio seleccionado"
              : multiple
              ? `${selectedPaths.length} seleccionado(s)`
              : "1 seleccionado"}
          </span>
          <div className="media-viewer-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" disabled={selectedPaths.length === 0} onClick={() => confirm()}>
              {multiple ? "Agregar seleccionados" : "Usar este medio"}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
};

export default MediaPicker;
