ARG NODE_ENV=production

FROM node:18-bookworm-slim@sha256:781204f001403b0d27db2c49ab74ab1a5e867bd5e5c96ed5fcad6888e3b09f4a as build-stage

ARG NODE_ENV
ENV NODE_ENV=${NODE_ENV}

WORKDIR /speckle-server

# install tini
ARG TINI_VERSION=v0.19.0
ENV TINI_VERSION=${TINI_VERSION}
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini ./tini
RUN chmod +x ./tini

# install wait
ARG WAIT_VERSION=2.8.0
ENV WAIT_VERSION=${WAIT_VERSION}
ADD https://github.com/ufoscout/docker-compose-wait/releases/download/${WAIT_VERSION}/wait ./wait
RUN chmod +x ./wait

# download yarn dependencies for building shared libraries
COPY .yarnrc.yml .
COPY .yarn ./.yarn
COPY package.json yarn.lock ./

COPY packages/frontend-2/type-augmentations/stubs ./packages/frontend-2/type-augmentations/stubs/
COPY packages/shared/package.json ./packages/shared/
COPY packages/fileimport-service/package.json ./packages/fileimport-service/

RUN yarn workspaces focus --all

# build shared libraries
COPY packages/shared ./packages/shared/
COPY packages/fileimport-service ./packages/fileimport-service/
RUN yarn workspaces foreach -W run build

# Install python virtual env and python dependencies
RUN apt-get update && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
  --no-install-recommends \
  python3-venv=3.11.2-1+b1 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m venv /venv

COPY packages/fileimport-service/requirements.txt /speckle-server/
RUN /venv/bin/pip install --disable-pip-version-check --no-cache-dir --requirement /speckle-server/requirements.txt

FROM node:18-bookworm-slim@sha256:781204f001403b0d27db2c49ab74ab1a5e867bd5e5c96ed5fcad6888e3b09f4a as dependency-stage
# installing just the production dependencies
# separate stage to avoid including development dependencies
ARG NODE_ENV
ENV NODE_ENV=${NODE_ENV}

WORKDIR /speckle-server
COPY .yarnrc.yml .
COPY .yarn ./.yarn
COPY package.json yarn.lock ./

COPY packages/frontend-2/type-augmentations/stubs ./packages/frontend-2/type-augmentations/stubs/
COPY packages/shared/package.json ./packages/shared/
COPY packages/fileimport-service/package.json ./packages/fileimport-service/

WORKDIR /speckle-server/packages/fileimport-service
RUN yarn workspaces focus --production

FROM gcr.io/distroless/python3-debian12:nonroot@sha256:6f47357efced3b45f91d0e951811b6a7b99fa9a9ab8691badef07bbde815c6cc as python-image

FROM gcr.io/distroless/nodejs18-debian12:nonroot@sha256:115b56ec50713691ea1749d7a3036393a241324caf129d85e78d012819645cc5 as distributable-stage

ARG NODE_ENV
ENV NODE_ENV=${NODE_ENV}
ARG NODE_BINARY_PATH=/nodejs/bin/node
ENV NODE_BINARY_PATH=${NODE_BINARY_PATH}
ARG PYTHON_BINARY_PATH=/venv/bin/python3
ENV PYTHON_BINARY_PATH=${PYTHON_BINARY_PATH}

WORKDIR /speckle-server

COPY --from=python-image / /
COPY --from=build-stage /speckle-server/tini /usr/bin/tini
COPY --from=build-stage /speckle-server/wait /usr/bin/wait
COPY --from=build-stage /speckle-server/packages/shared ./packages/shared
COPY --from=build-stage /speckle-server/packages/fileimport-service ./packages/fileimport-service
COPY --from=build-stage /venv /venv
COPY --from=dependency-stage /speckle-server/node_modules ./node_modules

WORKDIR /speckle-server/packages/fileimport-service

# Prefixing PATH with our virtual environment should seek required binaries
# from virtual environment first.
# Unsetting python home
ENV PATH=/venv/bin:${PATH} \
    PYTHONHOME=

ENTRYPOINT [ "tini", "--", "/nodejs/bin/node", "--no-experimental-fetch", "src/daemon.js"]
