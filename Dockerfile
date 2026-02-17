
FROM node:24-alpine AS base

ENV USER=ezd
ENV HOME=/home/$USER
ENV APP_DIR=app

RUN adduser -S ezd -G node
RUN mkdir -p ${HOME}/${APP_DIR}/node_modules
RUN chown -R ${USER}:node ${HOME}/${APP_DIR}
WORKDIR ${HOME}/${APP_DIR}

COPY package.json .
COPY package-lock.json .
COPY src/ src
COPY db/ db
COPY tsconfig.json .
COPY eslint.config.mjs .
RUN npm ci
# `|| true` allows build to continue even if tsc emits errors
RUN npm run build || true
RUN npm ci --omit=dev

CMD [ "npm", "start" ]

