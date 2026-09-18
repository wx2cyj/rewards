FROM node:24-slim

WORKDIR /usr/src/microsoft-rewards-script

# Set production environment variables
ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    PLAYWRIGHT_BROWSERS_PATH=0 \
    FORCE_HEADLESS=1

# Install minimal system libraries required for Chromium headless to run,
# plus jq (for config generation/patching) and gettext-base (for envsubst)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    cron \
    gettext-base \
    jq \
    tzdata \
    ca-certificates \
    libglib2.0-0 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libasound2 \
    libflac12 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libdav1d6 \
    libx11-6 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    libdouble-conversion3 \
    fonts-wqy-zenhei \
    && rm -rf /usr/share/icons/* /usr/share/doc/* /usr/share/man/* \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Copy package files and install runtime dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

# Install Patchright Chromium headless shell
RUN npx patchright install --with-deps --only-shell chromium \
    && rm -rf /usr/share/icons/* /usr/share/doc/* /usr/share/man/* \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Copy pre-compiled dist and scripts
COPY dist ./dist
COPY scripts ./scripts
COPY src/config.example.json ./src/config.example.json
COPY src/crontab.template /etc/cron.d/microsoft-rewards-cron.template
COPY scripts/docker/entrypoint.sh /usr/local/bin/entrypoint.sh

# Remove non-runtime files (.d.ts and .map) from dist to save space
RUN find ./dist -type f \( -name "*.d.ts" -o -name "*.d.ts.map" -o -name "*.js.map" \) -delete

# Create the config directory and symlink config.json and accounts.json into
# dist/ so the app finds them at its expected paths, while the entrypoint
# writes to dist/config/ which maps to the user-facing ./config/ volume mount
RUN mkdir -p ./dist/config \
    && ln -s /usr/src/microsoft-rewards-script/dist/config/config.json ./dist/config.json \
    && ln -s /usr/src/microsoft-rewards-script/dist/config/accounts.json ./dist/accounts.json \
    && chmod 755 /usr/local/bin/entrypoint.sh ./scripts/docker/*.sh

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["sh", "-c", "echo 'Container started; cron is running.'"]
