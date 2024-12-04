FROM node:18-bookworm-slim@sha256:781204f001403b0d27db2c49ab74ab1a5e867bd5e5c96ed5fcad6888e3b09f4a as build-stage
ARG NODE_ENV=production
ARG SPECKLE_SERVER_VERSION=custom

WORKDIR /speckle-server

COPY .yarnrc.yml .
COPY .yarn ./.yarn
COPY package.json yarn.lock ./
COPY utils/ensure-tailwind-deps.mjs ./utils/

COPY packages/viewer/package.json ./packages/viewer/
COPY packages/objectloader/package.json ./packages/objectloader/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui-components/package.json ./packages/ui-components/
COPY packages/ui-components-nuxt/package.json ./packages/ui-components-nuxt/
COPY packages/tailwind-theme/package.json ./packages/tailwind-theme/
COPY packages/frontend-2/package.json ./packages/frontend-2/
COPY packages/frontend-2/type-augmentations ./packages/frontend-2/ 

COPY packages/objectloader ./packages/objectloader/
COPY packages/viewer ./packages/viewer/
COPY packages/shared ./packages/shared/
COPY packages/ui-components ./packages/ui-components/
COPY packages/ui-components-nuxt ./packages/ui-components-nuxt/
COPY packages/tailwind-theme ./packages/tailwind-theme/
COPY packages/frontend-2 ./packages/frontend-2/

# hadolint ignore=DL3059
RUN yarn workspaces focus -A
# hadolint ignore=DL3059
RUN yarn workspaces foreach -W run build
# hadolint ignore=DL3059
RUN find ./packages/frontend-2/.output/ -type f \( -name "*.js.map" -o -name "*.mjs.map" -o -name "*.cjs.map" \) -exec rm -f {} \;

ENV TINI_VERSION v0.19.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

FROM gcr.io/distroless/nodejs18-debian12:nonroot@sha256:115b56ec50713691ea1749d7a3036393a241324caf129d85e78d012819645cc5 as production-stage
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

COPY --from=build-stage /tini /tini

ENTRYPOINT ["/tini", "--"]

USER nonroot

ENV PORT=8080

ENV NUXT_PUBLIC_MIXPANEL_TOKEN_ID=acd87c5a50b56df91a795e999812a3a4
ENV NUXT_PUBLIC_MIXPANEL_API_HOST=https://analytics.speckle.systems

WORKDIR /speckle-server
COPY --from=build-stage  /speckle-server/packages/frontend-2/.output .

EXPOSE ${PORT}

CMD ["/nodejs/bin/node", "./server/index.mjs"]
