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
#   PRODUCT_ID=... \
#   CUSTOMER_EMAIL=... CUSTOMER_PASSWORD=... \
#   ALLOW_WRITES=1 \
#   ./backend/scripts/bl014-smoke-tests.sh
#
# El bloque "Flujo app móvil" (tests M*) requiere jq. Todas sus peticiones van
# sin header Origin, como las manda una app nativa. Es de solo lectura salvo
# M9, que crea un pedido real y solo corre con ALLOW_WRITES=1 — no lo actives
# contra producción.

BASE_URL="${BASE_URL:-http://localhost:5000}"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-http://localhost:3000}"
BLOCKED_ORIGIN="${BLOCKED_ORIGIN:-https://blocked.example}"
CUSTOMER_TOKEN="${CUSTOMER_TOKEN:-}"
STAFF_TOKEN="${STAFF_TOKEN:-}"
CUSTOMER_ID="${CUSTOMER_ID:-}"
# Producto activo existente — habilita el test 13 (checkout público real).
PRODUCT_ID="${PRODUCT_ID:-}"
# Cuenta customer verificada — habilita el login real del flujo app móvil.
CUSTOMER_EMAIL="${CUSTOMER_EMAIL:-}"
CUSTOMER_PASSWORD="${CUSTOMER_PASSWORD:-}"
# 1 = permite M9 (pedido real autenticado). Por default no escribe nada.
ALLOW_WRITES="${ALLOW_WRITES:-0}"

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

# Payload de checkout válido para la config actual de la tienda (igual que el
# storefront/app): recoger en el primer punto de venta activo (o envío si no
# hay puntos) y el primer método de pago que aplique. Sin jq o sin config,
# cae al formato viejo ("pickup" como método de pago).
# Uso: checkout_payload <nombre> <correo> <productId>
checkout_payload() {
  local name="$1" email="$2" product="$3"
  if command -v jq >/dev/null 2>&1; then
    curl -s "$BASE_URL/api/store-config/public" 2>/dev/null | jq -c \
      --arg name "$name" --arg email "$email" --arg product "$product" '
      (.pickupPoints // []) as $points
      | (if ($points | length) > 0 then "pickup" else "shipping" end) as $delivery
      | ((.paymentMethods // [])
          | map(select(if $delivery == "pickup" then .forPickup != false else .forShipping != false end))
          | first | (._id // .id // null)) as $payment
      | {customerName: $name, customerEmail: $email, deliveryMethod: $delivery,
         paymentMethod: ($payment // (if $delivery == "pickup" then "pickup" else "transfer" end)),
         items: [{product: $product, quantity: 1}]}
      + (if $delivery == "pickup" and ($points | length) > 0 then {pickupPointId: ($points[0]._id // $points[0].id)} else {} end)
      + (if $delivery == "shipping" then {shippingAddress: {recipientName: $name, street: "Calle Smoke", exteriorNumber: "1", zipCode: "42000", city: "Pachuca", state: "Hidalgo"}} else {} end)
      ' 2>/dev/null && return
  fi
  printf '{"customerName":"%s","customerEmail":"%s","paymentMethod":"pickup","items":[{"product":"%s","quantity":1}]}' "$name" "$email" "$product"
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
  "Upload de medio sin token retorna 401" \
  "401" \
  -F "media=@/etc/hosts" \
  "$BASE_URL/api/media"

# 8) Upload con token customer debe negar (403)
if [[ -n "$CUSTOMER_TOKEN" ]]; then
  run_status_test \
    "Upload de medio con customer retorna 403" \
    "403" \
    -H "Authorization: Bearer $CUSTOMER_TOKEN" \
    -F "media=@/etc/hosts" \
    "$BASE_URL/api/media"
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

# 11) Catálogo público sin token (esperado 200)
run_status_test \
  "GET /api/products/public sin token retorna 200" \
  "200" \
  "$BASE_URL/api/products/public"

# 12) Checkout público con body vacío (esperado 400, no debe tocar Mongo)
run_status_test \
  "POST /api/orders/public con body vacío retorna 400" \
  "400" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "$BASE_URL/api/orders/public"

# 13) Checkout público válido -> 201 con folio (orderNumber)
if [[ -n "$PRODUCT_ID" ]]; then
  run_status_test \
    "POST /api/orders/public válido retorna 201" \
    "201" \
    -H "Content-Type: application/json" \
    -d "$(checkout_payload "BL014 Smoke" "bl014-smoke@example.com" "$PRODUCT_ID")" \
    "$BASE_URL/api/orders/public"
  if grep -q '"orderNumber"' /tmp/bl014-body.txt 2>/dev/null; then
    pass "POST /api/orders/public válido incluye orderNumber"
  else
    fail "POST /api/orders/public válido -> sin orderNumber en la respuesta"
  fi
else
  echo "[SKIP] Checkout público válido (PRODUCT_ID no definido)"
fi

echo
echo "== Flujo app móvil (sin Origin) =="

if ! command -v jq >/dev/null 2>&1; then
  echo "[SKIP] Flujo app móvil (jq no instalado)"
else
  # M1) Branding/config de la tienda que usa la app para su theming
  run_status_test \
    "M1 GET /api/store-config/public retorna 200" \
    "200" \
    "$BASE_URL/api/store-config/public"

  # M2) Catálogo; toma un producto para el detalle (M3) y el pedido (M9)
  run_status_test \
    "M2 GET /api/products/public retorna 200" \
    "200" \
    "$BASE_URL/api/products/public"
  mobile_product_id="${PRODUCT_ID:-$(jq -r '(.items // .)[0] | (._id // .id // empty)' /tmp/bl014-body.txt 2>/dev/null || true)}"

  # M3) Detalle de producto
  if [[ -n "$mobile_product_id" ]]; then
    run_status_test \
      "M3 GET /api/products/public/:id retorna 200" \
      "200" \
      "$BASE_URL/api/products/public/$mobile_product_id"
  else
    echo "[SKIP] M3 detalle de producto (catálogo vacío)"
  fi

  # M4) Mis pedidos sin token
  run_status_test \
    "M4 GET /api/orders/mine sin token retorna 401" \
    "401" \
    "$BASE_URL/api/orders/mine"

  # M5) Token mal formado
  run_status_test \
    "M5 GET /api/orders/mine con token inválido retorna 401" \
    "401" \
    -H "Authorization: Bearer not-a-jwt" \
    "$BASE_URL/api/orders/mine"

  if [[ -n "$CUSTOMER_EMAIL" && -n "$CUSTOMER_PASSWORD" ]]; then
    # M6) Login real -> token + user
    login_body=$(jq -n --arg e "$CUSTOMER_EMAIL" --arg p "$CUSTOMER_PASSWORD" '{email: $e, password: $p}')
    run_status_test \
      "M6 POST /api/users/login retorna 200" \
      "200" \
      -H "Content-Type: application/json" \
      -d "$login_body" \
      "$BASE_URL/api/users/login"
    mobile_token=$(jq -r '.token // empty' /tmp/bl014-body.txt 2>/dev/null || true)
    mobile_user_id=$(jq -r '.user | (._id // .id // empty)' /tmp/bl014-body.txt 2>/dev/null || true)

    if [[ -n "$mobile_token" && -n "$mobile_user_id" ]]; then
      pass "M6 login devuelve token y user.id"

      # M7) Perfil propio (Mi cuenta)
      run_status_test \
        "M7 GET /api/users/:id propio retorna 200" \
        "200" \
        -H "Authorization: Bearer $mobile_token" \
        "$BASE_URL/api/users/$mobile_user_id"

      # M8) Mis pedidos
      run_status_test \
        "M8 GET /api/orders/mine con token retorna 200" \
        "200" \
        -H "Authorization: Bearer $mobile_token" \
        "$BASE_URL/api/orders/mine"

      # M9) Pedido autenticado (escribe en la BD) y aparece en Mis pedidos
      if [[ "$ALLOW_WRITES" == "1" && -n "$mobile_product_id" ]]; then
        run_status_test \
          "M9 POST /api/orders/public autenticado retorna 201" \
          "201" \
          -H "Authorization: Bearer $mobile_token" \
          -H "Content-Type: application/json" \
          -d "$(checkout_payload "BL014 Mobile Smoke" "$CUSTOMER_EMAIL" "$mobile_product_id")" \
          "$BASE_URL/api/orders/public"
        mobile_order_number=$(jq -r '.orderNumber // empty' /tmp/bl014-body.txt 2>/dev/null || true)
        curl -s -o /tmp/bl014-body.txt -H "Authorization: Bearer $mobile_token" "$BASE_URL/api/orders/mine" || true
        if [[ -n "$mobile_order_number" ]] && jq -e --arg n "$mobile_order_number" '.items | any((.orderNumber | tostring) == $n)' /tmp/bl014-body.txt >/dev/null 2>&1; then
          pass "M9 el pedido $mobile_order_number aparece en /api/orders/mine"
        else
          fail "M9 el pedido creado no aparece en /api/orders/mine"
        fi
      else
        echo "[SKIP] M9 pedido autenticado (requiere ALLOW_WRITES=1 y un producto)"
      fi
    else
      fail "M6 login sin token o sin user.id en la respuesta"
    fi
  else
    echo "[SKIP] M6-M9 login real (CUSTOMER_EMAIL/CUSTOMER_PASSWORD no definidos)"
  fi
fi

echo
echo "== Resumen =="
echo "PASS: $pass_count"
echo "FAIL: $fail_count"

if [[ "$fail_count" -gt 0 ]]; then
  exit 1
fi

