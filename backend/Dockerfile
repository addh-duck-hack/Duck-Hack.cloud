# Cambia la imagen base a una versión estable de Node.js
FROM node:20

# Crear y establecer el directorio de la app
WORKDIR /app

# Copiar package.json y package-lock.json primero para aprovechar el caché de Docker
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm install --only=production

# Copiar el resto de los archivos
COPY . .

# Crear un usuario no root para ejecutar la aplicación
RUN useradd -m appuser

# Directorio de subidas (logos, fotos de equipo/clientes, imágenes de
# producto) — se crea y se deja con permisos de appuser aquí, en la imagen,
# para que quede correcto desde el primer arranque del volumen que lo monta
# en docker-compose.yml (sin ese volumen, este directorio vive solo en la
# capa escribible del contenedor y se pierde en cada `docker compose up
# --build`, que descarta el contenedor viejo y arranca uno nuevo desde cero).
RUN mkdir -p /app/uploads && chown -R appuser:appuser /app/uploads

USER appuser

# Exponer el puerto 5000
EXPOSE 5000

# Comando por defecto para iniciar la aplicación
CMD ["node", "server.js"]
