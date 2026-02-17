#!/usr/bin/env bash
set -euo pipefail

# BL-014 Smoke Tests
# Uso:
#   BASE_URL=https://api.tu-dominio.com \
#   ALLOWED_ORIGIN=https://admin.tu-dominio.com \
#   BLOCKED_ORIGIN=https://evil.example \
#   CUSTOMER_TOKEN=... \
#   STAFF_TOKEN=... \
#   CUSTOMER_ID=... \
#   ./backend/scripts/bl014-smoke-tests.sh

BASE_URL="${BASE_URL:-http://localhost:5000}"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-http://localhost:3000}"
BLOCKED_ORIGIN="${BLOCKED_ORIGIN:-https://blocked.example}"
CUSTOMER_TOKEN="${CUSTOMER_TOKEN:-}"
STAFF_TOKEN="${STAFF_TOKEN:-}"
CUSTOMER_ID="${CUSTOMER_ID:-}"

pass_count=0
fail_count=0

pass() {
  pass_count=$((pass_count + 1))
  printf "[PASS] %s\n" "$1"
}

fail() {
  fail_count=$((fail_count + 1))
  printf "[FAIL] %s\n" "$1"
}

run_status_test() {
  local name="$1"
  local expected="$2"
  shift 2

  local got
  got=$(curl -s -o /tmp/bl014-body.txt -w "%{http_code}" "$@" || true)
  if [[ "$got" == "$expected" ]]; then
    pass "$name -> HTTP $got"
  else
    fail "$name -> esperado $expected, recibido $got"
    printf "       URL/args: %s\n" "$*"
    printf "       body: %s\n" "$(cat /tmp/bl014-body.txt 2>/dev/null || true)"
  fi
}

echo "== BL-014 smoke tests =="
echo "BASE_URL=$BASE_URL"

# 1) Ruta inexistente
run_status_test \
  "Ruta inexistente retorna 404" \
  "404" \
  "$BASE_URL/api/does-not-exist"

# 2) Endpoint protegido sin token
run_status_test \
  "GET /api/users sin token retorna 401" \
  "401" \
  "$BASE_URL/api/users"

# 3) CORS bloqueado para origen no permitido
run_status_test \
  "CORS bloquea origen no permitido" \
  "403" \
  -H "Origin: $BLOCKED_ORIGIN" \
  "$BASE_URL/api/users"

# 4) CORS permite origen permitido (al menos no debe devolver 403 por CORS)
allowed_status=$(curl -s -o /tmp/bl014-allowed.txt -w "%{http_code}" -H "Origin: $ALLOWED_ORIGIN" "$BASE_URL/api/users" || true)
if [[ "$allowed_status" == "403" ]] && grep -q "CORS_ORIGIN_NOT_ALLOWED" /tmp/bl014-allowed.txt; then
  fail "CORS permite origen permitido -> recibido bloqueo CORS"
else
  pass "CORS permite origen permitido (status recibido: $allowed_status)"
fi

# 5) Login con payload inválido
run_status_test \
  "Login inválido retorna 400" \
  "400" \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","password":""}' \
  "$BASE_URL/api/users/login"

# 6) Register con payload inválido
run_status_test \
  "Register inválido retorna 400" \
  "400" \
  -H "Content-Type: application/json" \
  -d '{"name":"","email":"bad","password":"123"}' \
  "$BASE_URL/api/users/register"

# 7) Upload sin token
run_status_test \
  "Upload producto sin token retorna 401" \
  "401" \
  -F "productImage=@/etc/hosts" \
  "$BASE_URL/api/uploads/products-image"

# 8) Upload con token customer debe negar (403)
if [[ -n "$CUSTOMER_TOKEN" ]]; then
  run_status_test \
    "Upload producto con customer retorna 403" \
    "403" \
    -H "Authorization: Bearer $CUSTOMER_TOKEN" \
    -F "productImage=@/etc/hosts" \
    "$BASE_URL/api/uploads/products-image"
else
  echo "[SKIP] Upload con customer token (CUSTOMER_TOKEN no definido)"
fi

# 9) Listado de usuarios con token staff (esperado 200)
if [[ -n "$STAFF_TOKEN" ]]; then
  run_status_test \
    "GET /api/users con staff retorna 200" \
    "200" \
    -H "Authorization: Bearer $STAFF_TOKEN" \
    "$BASE_URL/api/users"
else
  echo "[SKIP] GET /api/users con staff token (STAFF_TOKEN no definido)"
fi

# 10) Cambio de contraseña: proteger endpoint de self
if [[ -n "$CUSTOMER_TOKEN" && -n "$CUSTOMER_ID" ]]; then
  run_status_test \
    "Password endpoint requiere payload válido (400 esperado)" \
    "400" \
    -H "Authorization: Bearer $CUSTOMER_TOKEN" \
    -H "Content-Type: application/json" \
    -X PATCH \
    -d '{"currentPassword":"","newPassword":""}' \
    "$BASE_URL/api/users/$CUSTOMER_ID/password"
else
  echo "[SKIP] Password endpoint self (CUSTOMER_TOKEN/CUSTOMER_ID faltante)"
fi

echo
echo "== Resumen =="
echo "PASS: $pass_count"
echo "FAIL: $fail_count"

if [[ "$fail_count" -gt 0 ]]; then
  exit 1
fi

