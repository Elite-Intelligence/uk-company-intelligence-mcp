FROM apify/actor-node:24

# Copy package files first to leverage Docker layer cache
COPY --chown=myuser:myuser package*.json ./

# Install production dependencies only
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version \
    && rm -r ~/.npm

# Copy source after npm install so source changes don't bust the dependency cache
COPY --chown=myuser:myuser . ./

CMD ["node", "src/main.js"]
