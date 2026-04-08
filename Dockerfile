FROM node:24-bookworm
WORKDIR /app
RUN npm install -g pnpm openclaw@latest
EXPOSE 18789
CMD ["openclaw", "gateway", "start"]