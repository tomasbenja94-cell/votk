FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy backend code
COPY backend ./backend

# Create uploads directory
RUN mkdir -p backend/uploads

# Expose port
EXPOSE 3001

# Start application
CMD ["node", "backend/src/index.js"]

