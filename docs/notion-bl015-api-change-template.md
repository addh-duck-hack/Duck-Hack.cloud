# Plantilla Notion - Cambio de API (BL-015)

## 1) Resumen del cambio

- Folio: `BL-015-XXX`
- Módulo: `backend`
- Endpoint(s): `...`
- Tipo: `Nuevo / Ajuste / Deprecado / Bugfix`
- Responsable: `...`
- Fecha: `YYYY-MM-DD`

## 2) Motivo y alcance

- Problema que resuelve:
- Alcance funcional:
- Fuera de alcance:

## 3) Impacto técnico

- Archivos backend tocados:
- Cambio en esquema de datos:
- Dependencias nuevas:
- Riesgos:

## 4) Contrato API

- OpenAPI actualizado en:
  - `/Users/jacobo/Documents/Desarrollo Duck-Hack/Duck-Hack.cloud/backend/openapi.yaml`
- Request:
```json
{}
```
- Response éxito:
```json
{}
```
- Response error:
```json
{
  "ok": false,
  "error": {
    "status": 400,
    "code": "CODE",
    "message": "Mensaje"
  }
}
```

## 5) Seguridad

- Auth requerida: `Sí/No`
- Roles permitidos:
- Rate limit:
- Validación de payload:
- CORS (si aplica):

## 6) Pruebas

- Smoke test BL-014 ejecutado: `Sí/No`
- Casos probados:
  - Caso 1:
  - Caso 2:
  - Caso 3:
- Resultado final: `PASS/FAIL`

## 7) Evidencia

- Logs relevantes:
- Capturas:
- Payloads de ejemplo:

## 8) Estado para cierre

- OpenAPI: `Actualizado`
- Contratos Notion: `Actualizado`
- QA/Smoke: `Aprobado`
- Listo para deploy: `Sí/No`
