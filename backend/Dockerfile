# Cambia la imagen base a una versión más reciente de Node.js
FROM node:18

# Crear y establecer el directorio de la app
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar las dependencias
RUN npm install

# Copiar el resto de los archivos
COPY . .

# Exponer el puerto 5000
EXPOSE 5000

# Comando por defecto
CMD ["node", "server.js"]