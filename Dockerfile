FROM node:24-bookworm
WORKDIR /app
RUN npm install -g openclaw@latest
EXPOSE 18789
# Set environment to remote and force host 0.0.0.0
ENV OPENCLAW_CUSTOM_CONFIG=/app/openclaw.json
ENV GATEWAY_MODE=remote
CMD ["openclaw", "gateway", "start", "--host", "0.0.0.0", "--port", "18789"]