# Dockerfile para el frontend (React)
FROM node:18

# Establecer el directorio de la app
WORKDIR /app

# Copiar package.json e instalar dependencias
COPY package*.json ./
RUN npm install

# Copiar los archivos de la app
COPY . .

# Construir la app para producción
RUN npm run build

# Exponer el puerto 3000
EXPOSE 3000

# Comando para ejecutar la app
CMD ["npm", "start"]