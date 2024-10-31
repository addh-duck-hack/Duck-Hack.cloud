# Cambia la imagen base a una versión estable de Node.js
FROM node:18

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
USER appuser

# Exponer el puerto 5000
EXPOSE 5000

# Comando por defecto para iniciar la aplicación
CMD ["node", "server.js"]
