{{/*
Expand the name of the chart.
*/}}
{{- define "speckle.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "speckle.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "speckle.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
All labels
*/}}
{{- define "speckle.labels" -}}
{{ include "speckle.commonLabels" . }}
{{ include "speckle.selectorLabels" . }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "speckle.commonLabels" -}}
{{ include "speckle.labels.chart" . }}
{{ include "speckle.labels.app-version" . }}
{{ include "speckle.labels.managed-by" . }}
{{ include "speckle.labels.part-of" . }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "speckle.selectorLabels" -}}
app.kubernetes.io/name: {{ include "speckle.name" . }}
{{ include "speckle.commonSelectorLabels" . }}
{{- end }}

{{/*
Common selector labels
*/}}
{{- define "speckle.commonSelectorLabels" -}}
app.kubernetes.io/instance: {{ .Release.Name }}
project: speckle-server
{{- end }}

{{/*
Chart label
*/}}
{{- define "speckle.labels.chart" -}}
helm.sh/chart: {{ include "speckle.chart" . }}
{{- end }}

{{/*
Managed-by label
*/}}
{{- define "speckle.labels.managed-by" -}}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
App Version label
*/}}
{{- define "speckle.labels.app-version" -}}
{{- if .Chart.AppVersion -}}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
{{- end }}

{{/*
Part-of label
*/}}
{{- define "speckle.labels.part-of" -}}
app.kubernetes.io/part-of: {{ include "speckle.name" . }}
{{- end }}

{{/*
Creates a network policy egress definition for connecting to Redis

Expects the global context "$" to be passed as the parameter
*/}}
{{- define "speckle.networkpolicy.egress.redis" -}}
{{- if .Values.redis.networkPolicy.inCluster.enabled -}}
  {{- $port := (default "6379" .Values.redis.networkPolicy.inCluster.port ) -}}
{{ include "speckle.networkpolicy.egress.internal" (dict "podSelector" .Values.redis.networkPolicy.inCluster.kubernetes.podSelector "namespaceSelector" .Values.redis.networkPolicy.inCluster.kubernetes.namespaceSelector "port" $port) }}
{{- else if .Values.redis.networkPolicy.externalToCluster.enabled -}}
  {{- $secret := ( include "speckle.getSecret" (dict "secret_name" (default .Values.secretName .Values.redis.connectionString.secretName) "secret_key" (default "redis_url" .Values.redis.connectionString.secretKey) "context" . ) ) -}}
  {{- $domain := ( include "speckle.networkPolicy.domainFromUrl" $secret ) -}}
  {{- $port := ( default "6379" ( include "speckle.networkPolicy.portFromUrl" $secret ) ) -}}
{{ include "speckle.networkpolicy.egress.external" (dict "ip" $domain "port" $port) }}
{{- end -}}
{{- end }}

{{/*
Creates a Cilium Network Policy egress definition for connecting to Redis

Expects the global context "$" to be passed as the parameter
*/}}
{{- define "speckle.networkpolicy.egress.redis.cilium" -}}
{{- if .Values.redis.networkPolicy.inCluster.enabled -}}
  {{- $port := (default "6379" .Values.redis.networkPolicy.inCluster.port ) -}}
{{ include "speckle.networkpolicy.egress.internal.cilium" (dict "endpointSelector" .Values.redis.networkPolicy.inCluster.cilium.endpointSelector "serviceSelector" .Values.redis.networkPolicy.inCluster.cilium.serviceSelector "port" $port) }}
{{- else if .Values.redis.networkPolicy.externalToCluster.enabled -}}
  {{- $secret := ( include "speckle.getSecret" (dict "secret_name" (default .Values.secretName .Values.redis.connectionString.secretName) "secret_key" (default "redis_url" .Values.redis.connectionString.secretKey) "context" . ) ) -}}
  {{- $domain := ( include "speckle.networkPolicy.domainFromUrl" $secret ) -}}
  {{- $port := ( default "6379" ( include "speckle.networkPolicy.portFromUrl" $secret ) ) -}}
{{ include "speckle.networkpolicy.egress.external.cilium" (dict "ip" $domain "port" $port) }}
{{- end -}}
{{- end }}

{{/*
Creates a Kubernetes Network Policy egress definition for connecting to Postgres
*/}}
{{- define "speckle.networkpolicy.egress.postgres" -}}
{{- if .Values.db.networkPolicy.inCluster.enabled -}}
  {{- $port := (default "5432" .Values.db.networkPolicy.inCluster.port ) -}}
{{ include "speckle.networkpolicy.egress.internal" (dict "podSelector" .Values.db.networkPolicy.inCluster.kubernetes.podSelector "namespaceSelector" .Values.db.networkPolicy.inCluster.kubernetes.namespaceSelector "port" $port) }}
{{- else if .Values.db.networkPolicy.externalToCluster.enabled -}}
  {{- $secret := ( include "speckle.getSecret" (dict "secret_name" (default .Values.secretName .Values.db.connectionString.secretName) "secret_key" (default "postgres_url" .Values.db.connectionString.secretKey) "context" . ) ) -}}
  {{- $domain := ( include "speckle.networkPolicy.domainFromUrl" $secret ) -}}
  {{- $port := ( default "5432" ( include "speckle.networkPolicy.portFromUrl" $secret ) ) -}}
{{ include "speckle.networkpolicy.egress.external" (dict "ip" $domain "port" $port) }}
{{- end -}}
{{- end }}

{{/*
Creates a Cilium network policy egress definition for connecting to Postgres
*/}}
{{- define "speckle.networkpolicy.egress.postgres.cilium" -}}
{{- if .Values.db.networkPolicy.inCluster.enabled -}}
  {{- $port := (default "5432" .Values.db.networkPolicy.inCluster.port ) -}}
{{ include "speckle.networkpolicy.egress.internal.cilium" (dict "endpointSelector" .Values.db.networkPolicy.inCluster.cilium.endpointSelector "serviceSelector" .Values.db.networkPolicy.inCluster.cilium.serviceSelector "port" $port) }}
{{- else if .Values.db.networkPolicy.externalToCluster.enabled -}}
  {{- $secret := ( include "speckle.getSecret" (dict "secret_name" (default .Values.secretName .Values.db.connectionString.secretName) "secret_key" (default "postgres_url" .Values.db.connectionString.secretKey) "context" . ) ) -}}
  {{- $domain := ( include "speckle.networkPolicy.domainFromUrl" $secret ) -}}
  {{- $port := ( default "5432" ( include "speckle.networkPolicy.portFromUrl" $secret ) ) -}}
{{ include "speckle.networkpolicy.egress.external.cilium" (dict "ip" $domain "port" $port) }}
{{- end -}}
{{- end }}

{{/*
Creates a Kubernetes network policy egress definition for connecting to S3 compatible storage
*/}}
{{- define "speckle.networkpolicy.egress.blob_storage" -}}
  {{- $port := (default "443" .Values.s3.networkPolicy.port ) -}}
  {{- if .Values.s3.networkPolicy.inCluster.enabled -}}
{{ include "speckle.networkpolicy.egress.internal" (dict "podSelector" .Values.s3.networkPolicy.inCluster.kubernetes.podSelector "namespaceSelector" .Values.s3.networkPolicy.inCluster.kubernetes.namespaceSelector "port" $port) }}
  {{- else if .Values.s3.networkPolicy.externalToCluster.enabled -}}
    {{- $s3Values := ( include "server.s3Values" . | fromJson ) -}}
    {{- $ip := ( include "speckle.networkPolicy.domainFromUrl" $s3Values.endpoint ) -}}
{{ include "speckle.networkpolicy.egress.external" (dict "ip" $ip "port" $port) }}
  {{- end -}}
{{- end }}

{{/*
Creates a Cilium Network Policy egress definition for connecting to S3 compatible storage
*/}}
{{- define "speckle.networkpolicy.egress.blob_storage.cilium" -}}
  {{- $port := (default "443" .Values.s3.networkPolicy.port ) -}}
  {{- if .Values.s3.networkPolicy.inCluster.enabled -}}
{{ include "speckle.networkpolicy.egress.internal.cilium" (dict "endpointSelector" .Values.s3.networkPolicy.inCluster.cilium.endpointSelector "serviceSelector" .Values.s3.networkPolicy.inCluster.cilium.serviceSelector "port" $port) }}
  {{- else if .Values.s3.networkPolicy.externalToCluster.enabled -}}
    {{- $s3Values := ( include "server.s3Values" . | fromJson ) -}}
    {{- $host := ( include "speckle.networkPolicy.domainFromUrl" $s3Values.endpoint ) -}}
{{ include "speckle.networkpolicy.egress.external.cilium" (dict "ip" $host "port" $port) }}
  {{- end -}}
{{- end }}

{{/*
Creates a Kubernetes Network Policy egress definition for connecting to the email server

Params:
  - context - Required, global context should be provided
*/}}
{{- define "speckle.networkpolicy.egress.email" -}}
  {{- $port := (default "443" .Values.server.email.port ) -}}
  {{- if .Values.server.email.networkPolicy.inCluster.enabled -}}
{{ include "speckle.networkpolicy.egress.internal" (dict "podSelector" .Values.server.email.networkPolicy.inCluster.kubernetes.podSelector "namespaceSelector" .Values.server.email.networkPolicy.inCluster.kubernetes.namespaceSelector "port" $port) }}
  {{- else if .Values.server.email.networkPolicy.externalToCluster.enabled -}}
{{ include "speckle.networkpolicy.egress.external" (dict "ip" .Values.server.email.host "port" $port) }}
  {{- end -}}
{{- end }}

{{/*
Creates a Cilium Network Policy egress definition for connecting to an email server

Expects the global context "$" to be passed as the parameter
*/}}
{{- define "speckle.networkpolicy.egress.email.cilium" -}}
  {{- $port := (default "443" .Values.server.email.port ) -}}
  {{- if .Values.server.email.networkPolicy.inCluster.enabled -}}
{{ include "speckle.networkpolicy.egress.internal.cilium" (dict "endpointSelector" .Values.server.email.networkPolicy.inCluster.cilium.endpointSelector "serviceSelector" .Values.server.email.networkPolicy.inCluster.cilium.serviceSelector "port" $port) }}
  {{- else if .Values.server.email.networkPolicy.externalToCluster.enabled -}}
{{ include "speckle.networkpolicy.egress.external.cilium" (dict "ip" .Values.server.email.host "port" $port) }}
  {{- end -}}
{{- end }}

{{/*
Creates a DNS match pattern for discovering the postgres IP

Usage:
{{ include "speckle.networkpolicy.dns.postgres.cilium" $ }}

Params:
  - context - Required, global context should be provided.
*/}}
{{- define "speckle.networkpolicy.dns.postgres.cilium" -}}
{{- $secret := ( include "speckle.getSecret" (dict "secret_name" (default .Values.secretName .Values.db.connectionString.secretName) "secret_key" (default "postgres_url" .Values.db.connectionString.secretKey) "context" . ) ) -}}
{{- $domain := ( include "speckle.networkPolicy.domainFromUrl" $secret ) -}}
  {{- if (and .Values.db.networkPolicy.externalToCluster.enabled ( ne ( include "speckle.isIPv4" $domain ) "true" ) ) -}}
{{ include "speckle.networkpolicy.matchNameOrPattern" $domain }}
  {{- end }}
{{- end }}

{{/*
Creates a DNS match pattern for discovering redis store IP

Usage:
{{ include "speckle.networkpolicy.dns.redis.cilium" $ }}

Params:
  - context - Required, global context should be provided.
*/}}
{{- define "speckle.networkpolicy.dns.redis.cilium" -}}
{{- $secret := ( include "speckle.getSecret" (dict "secret_name" (default .Values.secretName .Values.redis.connectionString.secretName) "secret_key" (default "redis_url" .Values.redis.connectionString.secretKey) "context" . ) ) -}}
{{- $domain := ( include "speckle.networkPolicy.domainFromUrl" $secret ) -}}
  {{- if (and .Values.redis.networkPolicy.externalToCluster.enabled ( ne ( include "speckle.isIPv4" $domain ) "true" ) ) -}}
{{ include "speckle.networkpolicy.matchNameOrPattern" $domain }}
  {{- end }}
{{- end }}

{{/*
Creates a DNS match pattern for discovering blob storage IP
*/}}
{{- define "speckle.networkpolicy.dns.blob_storage.cilium" -}}
{{- $s3Values := ( include "server.s3Values" . | fromJson ) -}}
{{- $domain := ( include  "speckle.networkPolicy.domainFromUrl" $s3Values.endpoint ) -}}
  {{- if ne (include "speckle.isIPv4" $domain ) "true" -}}
{{ include "speckle.networkpolicy.matchNameOrPattern" $domain }}
  {{- end }}
{{- end }}

{{/*
Creates a DNS match pattern for discovering email server IP

Usage:
{{ include "speckle.networkpolicy.dns.email.cilium" $ }}

Params:
  - context - Required, global context should be provided.
*/}}
{{- define "speckle.networkpolicy.dns.email.cilium" -}}
{{- $domain := .Values.server.email.host -}}
  {{- if (and .Values.server.email.networkPolicy.externalToCluster.enabled ( ne ( include "speckle.isIPv4" $domain ) "true" ) ) -}}
{{ include "speckle.networkpolicy.matchNameOrPattern" $domain }}
  {{- end }}
{{- end }}

{{/*
Creates a network policy egress definition for connecting to an external url:port or ip:port

Usage:
{{ include "speckle.networkpolicy.egress.external" (dict "ip" "" "port" "6379") }}

Params:
  - ip - String - Optional - IP or Domain of the endpoint to allow egress to. Can provide either ip, fqdn or neither. If neither fqdn or ip is provided then egress is allowed to 0.0.0.0/0 (i.e. everywhere!)
  - port - String - Required

Limitations:
    - IP is limited to IPv4 due to Kubernetes use of IPv4 CIDR
    - Kubernetes network policies do not support FQDN, hence if IP is not known egress is allowed to 0.0.0.0/0

*/}}
{{- define "speckle.networkpolicy.egress.external" -}}
{{- if not .port -}}
    {{- printf "\nNETWORKPOLICY ERROR: The port was not provided \"%s\"\n" .port | fail -}}
{{- end -}}
- to:
    - ipBlock:
    {{- if ( eq ( include "speckle.isIPv4" .ip ) "true" ) }}
        cidr: {{ printf "%s/32" .ip }}
    {{- else }}
        # Kubernetes network policy does not support fqdn, so we have to allow egress anywhere
        cidr: 0.0.0.0/0
        # except to kubernetes pods or services
        except: []
          # unfortunately cannot limit to typical kubernetes pod CIDR,
          # as some cloud vendor private IPs (e.g. for hosted databases) are also in this range
          # - 10.0.0.0/8
    {{- end }}
  ports:
    - port: {{ printf "%s" .port }}
{{- end }}

{{/*
Creates a Cilium network policy egress definition for connecting to an external Layer 3/Layer 4 endpoint i.e. ip:port

Usage:
{{ include "speckle.networkpolicy.egress.external.cilium" (dict "ip" "" "port" "6379") }}

Params:
  - ip - String - Optional - IP or Domain of the endpoint to allow egress to. Can provide either ip, fqdn or neither. If neither fqdn or ip is provided then egress is allowed to 0.0.0.0/0 (i.e. everywhere!)
  - port - String - Required

Limitations:
    - IP is limited to IPv4 due to Kubernetes use of IPv4 CIDR
*/}}
{{- define "speckle.networkpolicy.egress.external.cilium" -}}
{{- if not .port -}}
    {{- printf "\nNETWORKPOLICY ERROR: The port was not provided \"%s\"\n" .port | fail -}}
{{- end -}}
{{- if ( eq ( include "speckle.isIPv4" .ip ) "true" ) }}
- toCIDR:
    - {{ printf "%s/32" .ip }}
{{- else if .ip }}
- toFQDNs:
{{ include "speckle.networkpolicy.matchNameOrPattern" .ip | indent 4 }}
{{- else }}
- toCIDRSet:
      # Kubernetes network policy does not support fqdn, so we have to allow egress anywhere
    - cidr: 0.0.0.0/0
      # ideally would like to prevent access to kubernetes pods or services
      # but some cloud provider private IPs (e.g. for hosted services) are in this range
      except: []
        # - 10.0.0.0/8
{{- end }}
  toPorts:
    - ports:
      - port: {{ printf "%s" .port | quote }}
        protocol: TCP
{{- end }}

{{- define "speckle.networkpolicy.matchNameOrPattern" -}}
{{- if not . -}}
    {{- printf "\nNETWORKPOLICY ERROR: The name or glob pattern was not provided \"%s\"\n" . | fail -}}
{{- end -}}
  {{- if ( contains "*" . ) }}
- matchPattern: {{ printf "%s" . }}
  {{- else }}
- matchName: {{ printf "%s" . }}
  {{- end }}
{{- end }}

{{/*
Creates a network policy egress definition for connecting to a pod within the cluster

Usage:
{{ include "speckle.networkpolicy.egress.internal" (dict "podSelector" {matchLabels.name=redis} "namespaceSelector" {matchLabels.name=redis} "port" "6379") }}

Params:
  - podSelector - Object - Required
  - namespaceSelector - Object - Required
  - port - String - Required

*/}}
{{- define "speckle.networkpolicy.egress.internal" -}}
{{- if not .podSelector -}}
    {{- printf "\nNETWORKPOLICY ERROR: The pod selector was not provided\n" | fail -}}
{{- end -}}
{{- if not .namespaceSelector -}}
    {{- printf "\nNETWORKPOLICY ERROR: The namespace selector was not provided\n" | fail -}}
{{- end -}}
{{- if not .port -}}
    {{- printf "\nNETWORKPOLICY ERROR: The port was not provided \"%s\"\n" .port | fail -}}
{{- end -}}
- to:
    - namespaceSelector:
{{ .namespaceSelector | toYaml | indent 8 }}
      podSelector:
{{ .podSelector | toYaml | indent 8 }}
  ports:
    - port: {{ printf "%s" .port }}
{{- end }}

{{/*
Creates a cilium network policy egress definition for connecting to an endpoint (pod or kubernetes endpoint) or service within the cluster

Usage:
{{ include "speckle.networkpolicy.egress.internal.cilium" (dict "endpointSelector" {matchLabels.name=redis matchLabels."io.kubernetes.pod.namespace.labels.name"=speckle} "serviceSelector" "" "port" "6379") }}

Params:
  - endpointSelector - Object - One of endpointSelector or serviceSelector is required.
  - serviceSelector - Object - One of endpointSelector or serviceSelector is required.
  - port - String - Required

*/}}
{{- define "speckle.networkpolicy.egress.internal.cilium" -}}
{{- if not .endpointSelector -}}
    {{- printf "\nNETWORKPOLICY ERROR: The Endpoint selector was not provided\n" | fail -}}
{{- end -}}
{{- if not .port -}}
    {{- printf "\nNETWORKPOLICY ERROR: The port was not provided \"%s\"\n" .port | fail -}}
{{- end -}}
{{- if .endpointSelector }}
- toEndpoints:
{{ .endpointSelector | toYaml | indent 4 }}
  toPorts:
    - ports:
      - port: {{ printf "%s" .port | quote }}
        protocol: TCP
{{- end }}
{{- if .serviceSelector }}
- toServices:
{{ .serviceSelector | toYaml | indent 4 }}
  toPorts:
    - ports:
      - port: {{ printf "%s" .port | quote }}
        protocol: TCP
{{- end }}
{{- end }}

{{/*
Tries to determine if a given string is a valid IP address
Usage:
{{ include "speckle.isIPv4" "123.45.67.89" }}

Params:
  - ip - String - Required - The string which we will try to determine is a valid IP address
*/}}
{{- define "speckle.isIPv4" -}}
{{- if regexMatch "^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$" . -}}
{{- printf "true" -}}
{{- else -}}
{{- printf "false" -}}
{{- end -}}
{{- end -}}

{{/*
Extracts the domain name from a url
*/}}
{{- define "speckle.networkPolicy.domainFromUrl" -}}
  {{- if not . -}}
      {{- printf "\nERROR: The url was not provided as the context \"%s\"\n" . | fail -}}
  {{- end -}}
  {{- $host := ( urlParse . ).host -}}
  {{- if (contains ":" $host) -}}
    {{- $host = first (mustRegexSplit ":" $host -1) -}}
  {{- end -}}
{{ printf "%s" $host }}
{{- end }}

{{/*
Extracts the port from a url
*/}}
{{- define "speckle.networkPolicy.portFromUrl" -}}
  {{- if not . -}}
      {{- printf "\nERROR: The url was not provided as the context \"%s\"\n" . | fail -}}
  {{- end -}}
  {{- $host := ( urlParse . ).host -}}
  {{- if (contains ":" $host) -}}
{{ printf "%s" ( index (mustRegexSplit ":" $host -1) 1 ) }}
  {{- end -}}
{{- end }}
{{/*
Renders a value that contains template.
Usage:
{{ include "speckle.renderTpl" ( dict "value" .Values.path.to.value "context" $) }}
*/}}
{{- define "speckle.renderTpl" -}}
    {{- if typeIs "string" .value }}
        {{- tpl .value .context }}
    {{- else }}
        {{- tpl (.value | toYaml) .context }}
    {{- end }}
{{- end -}}

{{/*
Ingress pod selector
*/}}
{{- define "speckle.ingress.selector.pod" -}}
app.kubernetes.io/name: {{ .Values.ingress.controllerName }}
{{- end }}

{{/*
Retrieves an existing secret

Usage:
{{ include "speckle.getSecret" (dict  "secret_name" "server-vars" "secret_key" "postgres_url" "context" $ )}}

Params:
  - secret_name - Required, the name of the secret.
  - secret_key - Required, the key within the secret.
  - context - Required, must be global context.  Values of global context must include 'namespace' and 'secretName' keys.
*/}}
{{- define "speckle.getSecret" -}}
{{- $secretResource := (lookup "v1" "Secret" .context.Values.namespace .secret_name ) -}}
{{- if not $secretResource -}}
    {{- printf "\nERROR: Could not discover a secret \"%s\" in namespace \"%s\".\n       Try `kubectl get secret --namespace %s` to view available secrets." .secret_name .context.Values.namespace .context.Values.namespace | fail -}}
{{- end -}}
{{- $secret := ( index $secretResource.data .secret_key ) -}}
{{- if not $secret -}}
    {{- printf "\nERROR: Could not find a secret key \"%s\" of secret \"%s\" in namespace \"%s\".\n       Try `kubectl describe secret --namespace %s %s` to view available keys in the secret." .secret_key .secret_name .context.Values.namespace .context.Values.namespace .secret_name | fail -}}
{{- end -}}
{{- $secretDecoded := (b64dec $secret) -}}
{{- printf "%s" $secretDecoded }}
{{- end }}

{{/*
Retrieve the s3 parameters from ConfigMap if enabled, or default to retrieving them from the provided values
*/}}
{{- define "server.s3Values" -}}
{{- if .Values.s3.configMap.enabled }}
  {{- $configMap := (lookup "v1" "ConfigMap" .Values.namespace .Values.s3.configMap.name ) -}}
  {{- printf "%s" ( $configMap.data | toJson ) }}
{{- else }}
  {{- $result := dict "endpoint" .Values.s3.endpoint "bucket" .Values.s3.bucket "access_key" .Values.s3.access_key "publicEndpoint" .Values.s3.publicEndpoint }}
  {{- $result | toJson  }}
{{- end }}
{{- end }}

{{/*
Generate the environment variables for Speckle server and Speckle objects deployments
*/}}
{{- define "server.env" -}}
- name: CANONICAL_URL
  {{- if .Values.ssl_canonical_url }}
  value: https://{{ .Values.domain }}
  {{- else }}
  value: http://{{ .Values.domain }}
  {{- end }}

- name: PORT
  value: {{ include "server.port" $ | quote }}

- name: PRIVATE_OBJECTS_SERVER_URL
  value: {{ printf "http://%s:%s" ( include "objects.service.fqdn" $ ) ( include "objects.port" $ ) }}

- name: LOG_LEVEL
  value: {{ .Values.server.logLevel }}
- name: LOG_PRETTY
  value: {{ .Values.server.logPretty | quote }}

- name: FRONTEND_ORIGIN
  {{- if .Values.ssl_canonical_url }}
  value: https://{{ .Values.domain }}
  {{- else }}
  value: http://{{ .Values.domain }}
  {{- end }}

- name: ENABLE_FE2_MESSAGING
  value: {{ .Values.server.enableFe2Messaging | quote }}

- name: FF_AUTOMATE_MODULE_ENABLED
  value: {{ .Values.featureFlags.automateModuleEnabled | quote }}

- name: FF_WORKSPACES_MODULE_ENABLED
  value: {{ .Values.featureFlags.workspacesModuleEnabled | quote }}

- name: FF_PERSONAL_PROJECTS_LIMITS_ENABLED
  value: {{ .Values.featureFlags.personalProjectLimitsEnabled | quote }}

- name: FF_WORKSPACES_SSO_ENABLED
  value: {{ .Values.featureFlags.workspacesSSOEnabled | quote }}

- name: FF_WORKSPACES_NEW_PLANS_ENABLED
  value: {{ .Values.featureFlags.workspacesNewPlanEnabled | quote }}

- name: FF_MOVE_PROJECT_REGION_ENABLED
  value: {{ .Values.featureFlags.moveProjectRegionEnabled | quote }}

- name: FF_BACKGROUND_JOBS_ENABLED
  value: {{ .Values.featureFlags.backgroundJobsEnabled | quote }}

{{- if .Values.featureFlags.gatekeeperModuleEnabled }}
- name: LICENSE_TOKEN
  valueFrom:
    secretKeyRef:
      name: "{{ default .Values.secretName .Values.server.licenseTokenSecret.secretName }}"
      key: {{ default "license_token" .Values.server.licenseTokenSecret.secretKey }}
{{- end }}

- name: FF_MULTIPLE_EMAILS_MODULE_ENABLED
  value: {{ .Values.featureFlags.multipleEmailsModuleEnabled | quote }}

- name: FF_GATEKEEPER_MODULE_ENABLED
  value: {{ .Values.featureFlags.gatekeeperModuleEnabled | quote }}

- name: FF_BILLING_INTEGRATION_ENABLED
  value: {{ .Values.featureFlags.billingIntegrationEnabled | quote }}

- name: FF_WORKSPACES_MULTI_REGION_ENABLED
  value: {{ .Values.featureFlags.workspacesMultiRegionEnabled | quote }}

- name: FF_FORCE_ONBOARDING
  value: {{ .Values.featureFlags.forceOnboarding | quote }}

- name: FF_RETRY_ERRORED_PREVIEWS_ENABLED
  value: {{ .Values.featureFlags.retryErroredPreviewsEnabled | quote }}

{{- if .Values.featureFlags.billingIntegrationEnabled }}
- name: STRIPE_API_KEY
  valueFrom:
    secretKeyRef:
      name: "{{ default .Values.secretName .Values.billing.secretName }}"
      key: {{ .Values.billing.stripeApiKey.secretKey }}

- name: STRIPE_ENDPOINT_SIGNING_KEY
  valueFrom:
    secretKeyRef:
      name: "{{ default .Values.secretName .Values.billing.secretName }}"
      key: {{ .Values.billing.stripeEndpointSigningKey.secretKey }}

- name: WORKSPACE_TEAM_SEAT_STRIPE_PRODUCT_ID
  value: {{ .Values.billing.workspaceTeamSeatStripeProductId }}

- name: WORKSPACE_MONTHLY_TEAM_SEAT_GBP_STRIPE_PRICE_ID
  value: {{ .Values.billing.workspaceMonthlyTeamSeatGbpStripePriceId }}

- name: WORKSPACE_MONTHLY_TEAM_SEAT_USD_STRIPE_PRICE_ID
  value: {{ .Values.billing.workspaceMonthlyTeamSeatUsdStripePriceId }}

- name: WORKSPACE_YEARLY_TEAM_SEAT_GBP_STRIPE_PRICE_ID
  value: {{ .Values.billing.workspaceYearlyTeamSeatGbpStripePriceId }}

- name: WORKSPACE_YEARLY_TEAM_SEAT_USD_STRIPE_PRICE_ID
  value: {{ .Values.billing.workspaceYearlyTeamSeatUsdStripePriceId }}

- name: WORKSPACE_TEAM_UNLIMITED_SEAT_STRIPE_PRODUCT_ID
  value: {{ .Values.billing.workspaceTeamUnlimitedSeatStripeProductId }}

- name: WORKSPACE_MONTHLY_TEAM_UNLIMITED_SEAT_GBP_STRIPE_PRICE_ID
  value: {{ .Values.billing.workspaceMonthlyTeamUnlimitedSeatGbpStripePriceId }}

- name: WORKSPACE_MONTHLY_TEAM_UNLIMITED_SEAT_USD_STRIPE_PRICE_ID
  value: {{ .Values.billing.workspaceMonthlyTeamUnlimitedSeatUsdStripePriceId }}

- name: WORKSPACE_YEARLY_TEAM_UNLIMITED_SEAT_GBP_STRIPE_PRICE_ID
  value: {{ .Values.billing.workspaceYearlyTeamUnlimitedSeatGbpStripePriceId }}

- name: WORKSPACE_YEARLY_TEAM_UNLIMITED_SEAT_USD_STRIPE_PRICE_ID
  value: {{ .Values.billing.workspaceYearlyTeamUnlimitedSeatUsdStripePriceId }}

- name: WORKSPACE_PRO_SEAT_STRIPE_PRODUCT_ID
  value: {{ .Values.billing.workspaceProSeatStripeProductId }}

- name: WORKSPACE_MONTHLY_PRO_SEAT_GBP_STRIPE_PRICE_ID
  value: {{ .Values.billing.workspaceMonthlyProSeatGbpStripePriceId }}

- name: WORKSPACE_MONTHLY_PRO_SEAT_USD_STRIPE_PRICE_ID
  value: {{ .Values.billing.workspaceMonthlyProSeatUsdStripePriceId }}

- name: WORKSPACE_YEARLY_PRO_SEAT_GBP_STRIPE_PRICE_ID
  value: {{ .Values.billing.workspaceYearlyProSeatGbpStripePriceId }}

- name: WORKSPACE_YEARLY_PRO_SEAT_USD_STRIPE_PRICE_ID
  value: {{ .Values.billing.workspaceYearlyProSeatUsdStripePriceId }}

- name: WORKSPACE_PRO_UNLIMITED_SEAT_STRIPE_PRODUCT_ID
  value: {{ .Values.billing.workspaceProUnlimitedSeatStripeProductId }}

- name: WORKSPACE_MONTHLY_PRO_UNLIMITED_SEAT_GBP_STRIPE_PRICE_ID
  value: {{ .Values.billing.workspaceMonthlyProUnlimitedSeatGbpStripePriceId }}

- name: WORKSPACE_MONTHLY_PRO_UNLIMITED_SEAT_USD_STRIPE_PRICE_ID
  value: {{ .Values.billing.workspaceMonthlyProUnlimitedSeatUsdStripePriceId }}

- name: WORKSPACE_YEARLY_PRO_UNLIMITED_SEAT_GBP_STRIPE_PRICE_ID
  value: {{ .Values.billing.workspaceYearlyProUnlimitedSeatGbpStripePriceId }}

- name: WORKSPACE_YEARLY_PRO_UNLIMITED_SEAT_USD_STRIPE_PRICE_ID
  value: {{ .Values.billing.workspaceYearlyProUnlimitedSeatUsdStripePriceId }}

{{- end }}

{{- if (or .Values.featureFlags.automateModuleEnabled .Values.featureFlags.workspacesSsoEnabled) }}
- name: ENCRYPTION_KEYS_PATH
  value: {{ .Values.server.encryptionKeys.path }}
{{- end }}

{{- if .Values.featureFlags.automateModuleEnabled }}
- name: SPECKLE_AUTOMATE_URL
  value: {{ .Values.server.speckleAutomateUrl }}
{{- end }}

- name: ONBOARDING_STREAM_URL
  value: {{ .Values.server.onboarding.stream_url }}
- name: ONBOARDING_STREAM_CACHE_BUST_NUMBER
  value: {{ .Values.server.onboarding.stream_cache_bust_number | quote }}

- name: SESSION_SECRET
  valueFrom:
    secretKeyRef:
      name: "{{ default .Values.secretName .Values.server.sessionSecret.secretName }}"
      key: {{ default "session_secret" .Values.server.sessionSecret.secretKey }}

- name: FILE_SIZE_LIMIT_MB
  value: {{ .Values.file_size_limit_mb | quote }}

- name: FILE_IMPORT_TIME_LIMIT_MIN
  value: {{ (or .Values.file_import_time_limit_min .Values.fileimport_service.time_limit_min) | quote }}

- name: MAX_PROJECT_MODELS_PER_PAGE
  value: {{ .Values.server.max_project_models_per_page | quote }}

- name: MAX_OBJECT_SIZE_MB
  value: {{ .Values.server.max_object_size_mb | quote }}

- name: MAX_OBJECT_UPLOAD_FILE_SIZE_MB
  value: {{ .Values.server.max_object_upload_file_size_mb | quote }}

  {{- if .Values.server.migration.movedFrom }}
- name: MIGRATION_SERVER_MOVED_FROM
  value: {{ .Values.server.migration.movedFrom }}
  {{- end }}

  {{- if .Values.server.migration.movedTo }}
- name: MIGRATION_SERVER_MOVED_TO
  value: {{ .Values.server.migration.movedTo }}
  {{- end }}

{{- if .Values.server.asyncRequestContextEnabled }}
- name: ASYNC_REQUEST_CONTEXT_ENABLED
  value: {{ .Values.server.asyncRequestContextEnabled | quote }}
{{- end}}

# *** Gendo render module ***
- name: FF_GENDOAI_MODULE_ENABLED
  value: {{ .Values.featureFlags.gendoAIModuleEnabled | quote }}

{{- if .Values.featureFlags.gendoAIModuleEnabled }}
- name: GENDOAI_KEY
  valueFrom:
    secretKeyRef:
      name: {{ default .Values.secretName .Values.server.gendoAI.key.secretName }}
      key: {{ .Values.server.gendoAI.key.secretKey }}

- name: GENDOAI_API_ENDPOINT
  value: {{ .Values.server.gendoAI.apiUrl | quote }}

- name: GENDOAI_CREDIT_LIMIT
  value: {{ .Values.server.gendoAI.creditLimit | quote }}

- name: RATELIMIT_GENDO_AI_RENDER_REQUEST
  value: {{ .Values.server.gendoAI.ratelimiting.renderRequest | quote }}

- name: RATELIMIT_GENDO_AI_RENDER_REQUEST_PERIOD_SECONDS
  value: {{ .Values.server.gendoAI.ratelimiting.renderRequestPeriodSeconds | quote }}

- name: RATELIMIT_BURST_GENDO_AI_RENDER_REQUEST
  value: {{ .Values.server.gendoAI.ratelimiting.burstRenderRequest | quote }}

- name: RATELIMIT_GENDO_AI_RENDER_REQUEST_BURST_PERIOD_SECONDS
  value: {{ .Values.server.gendoAI.ratelimiting.burstRenderRequestPeriodSeconds | quote }}
{{- end }}

# *** Preview service ***
{{- if .Values.preview_service.enabled }}
- name: PREVIEW_SERVICE_USE_PRIVATE_OBJECTS_SERVER_URL
  value: "true"
{{- if .Values.preview_service.puppeteer.timeoutMilliseconds }}
- name: PREVIEW_SERVICE_TIMEOUT_MILLISECONDS
  value: {{ .Values.preview_service.puppeteer.timeoutMilliseconds | quote }}
{{- end }}
{{- if .Values.featureFlags.retryErroredPreviewsEnabled }}
- name: PREVIEW_SERVICE_MAX_QUEUE_BACKPRESSURE
  value: {{ .Values.preview_service.maxQueueBackpressure | quote }}
- name: PREVIEW_SERVICE_RETRY_PERIOD_MINUTES
  value: {{ .Values.preview_service.retryPeriodMinutes | quote }}
{{- end }}
{{- end }}

# *** Redis ***
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: {{ default .Values.secretName .Values.redis.connectionString.secretName }}
      key: {{ default "redis_url" .Values.redis.connectionString.secretKey }}


{{- if .Values.preview_service.dedicatedPreviewsQueue }}
- name: PREVIEW_SERVICE_REDIS_URL
  valueFrom:
    secretKeyRef:
      name: {{ default .Values.secretName .Values.redis.previewServiceConnectionString.secretName }}
      key: {{ default "preview_service_redis_url" .Values.redis.previewServiceConnectionString.secretKey }}
{{- end }}

{{- if (and .Values.featureFlags.nextGenFileImporterEnabled (not .Values.featureFlags.backgroundJobsEnabled)) }}
- name: FILEIMPORT_SERVICE_RHINO_REDIS_URL
  valueFrom:
    secretKeyRef:
      name: {{ default .Values.secretName .Values.redis.fileImportService.rhino.connectionString.secretName }}
      key: {{ default "fileimport_service_rhino_redis_url" .Values.redis.fileImportService.rhino.connectionString.secretKey }}

- name: FILEIMPORT_SERVICE_RHINO_QUEUE_NAME
  value: {{ .Values.redis.fileImportService.rhino.queueName | quote }}

- name: FILEIMPORT_SERVICE_IFC_REDIS_URL
  valueFrom:
    secretKeyRef:
      name: {{ default .Values.secretName .Values.redis.fileImportService.ifc.connectionString.secretName }}
      key: {{ default "fileimport_service_ifc_redis_url" .Values.redis.fileImportService.ifc.connectionString.secretKey }}

- name: FILEIMPORT_SERVICE_IFC_QUEUE_NAME
  value: {{ .Values.redis.fileImportService.ifc.queueName | quote }}
{{- end }}

# *** PostgreSQL Database ***
- name: POSTGRES_URL
  valueFrom:
    secretKeyRef:
      name: {{ default .Values.secretName .Values.db.connectionString.secretName }}
      key: {{ default "postgres_url" .Values.db.connectionString.secretKey }}
- name: POSTGRES_MAX_CONNECTIONS_SERVER
  value: {{ .Values.db.maxConnectionsServer | quote }}
- name: POSTGRES_CONNECTION_CREATE_TIMEOUT_MILLIS
  value: {{ .Values.db.connectionCreateTimeoutMillis | quote }}
- name: POSTGRES_CONNECTION_ACQUIRE_TIMEOUT_MILLIS
  value: {{ .Values.db.connectionAcquireTimeoutMillis | quote }}

{{- if .Values.db.knexAsyncStackTracesEnabled }}
- name: KNEX_ASYNC_STACK_TRACES_ENABLED
  value: {{ .Values.db.knexAsyncStackTracesEnabled | quote }}
{{- end}}

{{- if .Values.db.knexImprovedTelemetryStackTraces }}
- name: KNEX_IMPROVED_TELEMETRY_STACK_TRACES
  value: {{ .Values.db.knexImprovedTelemetryStackTraces | quote }}
{{- end}}

- name: PGSSLMODE
  value: "{{ .Values.db.PGSSLMODE }}"

{{- if .Values.db.useCertificate }}
- name: NODE_EXTRA_CA_CERTS
  value: "/postgres-certificate/ca-certificate.crt"
{{- end }}

{{- if .Values.server.fileUploads.enabled }}
{{ else }}
- name: DISABLE_FILE_UPLOADS
  value: "true"
{{ end }}

{{- if .Values.server.adminOverrideEnabled }}
- name: ADMIN_OVERRIDE_ENABLED
  value: "true"
{{- end }}

{{- if .Values.server.weeklyDigestEnabled }}
- name: WEEKLY_DIGEST_ENABLED
  value: "true"
{{- end }}

{{- if (quote .Values.server.monitoring.mp.enabled) }}
- name: ENABLE_MP
  value: {{ .Values.server.monitoring.mp.enabled | quote }}
{{- end }}

- name: NODE_TLS_REJECT_UNAUTHORIZED
  value: {{ .Values.tlsRejectUnauthorized | quote }}

{{- if (or .Values.s3.configMap.enabled .Values.s3.endpoint) }}
# *** S3 Object Storage ***
{{- $s3values := ((include "server.s3Values" .) | fromJson ) }}
- name: S3_ENDPOINT
  value: {{ $s3values.endpoint }}
{{- if $s3values.publicEndpoint }}
- name: S3_PUBLIC_ENDPOINT
  value: {{ $s3values.publicEndpoint }}
{{- end }}
- name: S3_ACCESS_KEY
  value: {{ $s3values.access_key }}
- name: S3_BUCKET
  value: {{ $s3values.bucket }}
- name: S3_SECRET_KEY
  valueFrom:
    secretKeyRef:
      name: {{ default .Values.secretName .Values.s3.secret_key.secretName }}
      key: {{ default "s3_secret_key" .Values.s3.secret_key.secretKey }}
- name: S3_CREATE_BUCKET
  value: "{{ .Values.s3.create_bucket }}"
- name: S3_REGION
  value: "{{ .Values.s3.region }}"

{{- end }}

# *** Authentication ***

# Local Auth
- name: STRATEGY_LOCAL
  value: "{{ .Values.server.auth.local.enabled }}"

{{- if .Values.server.auth.google.enabled }}
# Google Auth
- name: STRATEGY_GOOGLE
  value: "true"
- name: GOOGLE_CLIENT_ID
  value: {{ .Values.server.auth.google.client_id }}
- name: GOOGLE_CLIENT_SECRET
  valueFrom:
    secretKeyRef:
      name: {{ default .Values.secretName .Values.server.auth.google.clientSecret.secretName }}
      key: {{ default "google_client_secret" .Values.server.auth.google.clientSecret.secretKey }}
{{- end }}

{{- if .Values.server.auth.github.enabled }}
# Github Auth
- name: STRATEGY_GITHUB
  value: "true"
- name: GITHUB_CLIENT_ID
  value: {{ .Values.server.auth.github.client_id }}
- name: GITHUB_CLIENT_SECRET
  valueFrom:
    secretKeyRef:
      name: {{ default .Values.secretName .Values.server.auth.github.clientSecret.secretName }}
      key: {{ default "github_client_secret" .Values.server.auth.github.clientSecret.secretKey }}
{{- end }}

{{- if .Values.server.auth.azure_ad.enabled }}
# AzureAD Auth
- name: STRATEGY_AZURE_AD
  value: "true"
- name: AZURE_AD_ORG_NAME
  value: {{ .Values.server.auth.azure_ad.org_name }}
- name: AZURE_AD_IDENTITY_METADATA
  value: {{ .Values.server.auth.azure_ad.identity_metadata }}
- name: AZURE_AD_ISSUER
  value: {{ .Values.server.auth.azure_ad.issuer }}
- name: AZURE_AD_CLIENT_ID
  value: {{ .Values.server.auth.azure_ad.client_id }}
- name: AZURE_AD_CLIENT_SECRET
  valueFrom:
    secretKeyRef:
      name: {{ default .Values.secretName .Values.server.auth.azure_ad.clientSecret.secretName }}
      key: {{ default "azure_ad_client_secret" .Values.server.auth.azure_ad.clientSecret.secretKey }}
{{- end }}


{{- if .Values.server.auth.oidc.enabled }}
# OpenID Connect Auth
- name: STRATEGY_OIDC
  value: "true"
- name: OIDC_NAME
  value: {{ .Values.server.auth.oidc.name }}
- name: OIDC_DISCOVERY_URL
  value: {{ .Values.server.auth.oidc.discovery_url }}
- name: OIDC_CLIENT_ID
  value: {{ .Values.server.auth.oidc.client_id }}
- name: OIDC_CLIENT_SECRET
  valueFrom:
    secretKeyRef:
      name: {{ default .Values.secretName .Values.server.auth.oidc.clientSecret.secretName }}
      key: {{ default "oidc_client_secret" .Values.server.auth.oidc.clientSecret.secretKey }}
{{- end }}



{{- if .Values.server.email.enabled }}
# *** Email ***
- name: EMAIL
  value: "true"
- name: EMAIL_HOST
  value: "{{ .Values.server.email.host }}"
- name: EMAIL_PORT
  value: "{{ .Values.server.email.port }}"
- name: EMAIL_USERNAME
  value: "{{ .Values.server.email.username }}"
- name: EMAIL_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ default .Values.secretName .Values.server.email.password.secretName }}
      key: {{ default "email_password" .Values.server.email.password.secretKey }}
- name: EMAIL_FROM
  value: "{{ .Values.server.email.from }}"
- name: EMAIL_VERIFICATION_TIMEOUT_MINUTES
  value: {{ .Values.server.email.verificationTimeoutMinutes | quote }}
{{- end }}

{{- if .Values.server.mailchimp.enabled }}
# *** Newsletter ***
- name: MAILCHIMP_ENABLED
  value: "true"
- name: MAILCHIMP_API_KEY
  valueFrom:
    secretKeyRef:
      name: {{ default .Values.secretName .Values.server.mailchimp.apikey.secretName }}
      key: {{ .Values.server.mailchimp.apikey.secretKey }}
- name: MAILCHIMP_SERVER_PREFIX
  value: "{{ .Values.server.mailchimp.serverPrefix}}"

- name: MAILCHIMP_NEWSLETTER_LIST_ID
  value: "{{ .Values.server.mailchimp.newsletterListId}}"

- name: MAILCHIMP_ONBOARDING_LIST_ID
  value: "{{ .Values.server.mailchimp.onboardingListId}}"
{{- end }}

{{- if .Values.server.monitoring.apollo.enabled }}
# Monitoring - Apollo
- name: APOLLO_GRAPH_ID
  value: {{ .Values.server.monitoring.apollo.graph_id }}
- name: APOLLO_SCHEMA_REPORTING
  value: "true"
- name: APOLLO_GRAPH_VARIANT
  valueFrom:
    fieldRef:
      fieldPath: metadata.namespace
- name: APOLLO_SERVER_ID
  valueFrom:
    fieldRef:
      fieldPath: metadata.name
- name: APOLLO_SERVER_PLATFORM
  value: "kubernetes/deployment"
- name: APOLLO_KEY
  valueFrom:
    secretKeyRef:
      name: {{ default .Values.secretName .Values.server.monitoring.apollo.key.secretName }}
      key: {{ default "apollo_key" .Values.server.monitoring.apollo.key.secretKey }}
{{- end }}

# Rate Limiting
- name: RATELIMITER_ENABLED
  value: "{{ .Values.server.ratelimiting.enabled }}"

{{- if .Values.server.ratelimiting.all_requests }}
- name: RATELIMIT_ALL_REQUESTS
  value: "{{ .Values.server.ratelimiting.all_requests }}"
{{- end }}
{{- if .Values.server.ratelimiting.burst_all_requests }}
- name: RATELIMIT_BURST_ALL_REQUESTS
  value: "{{ .Values.server.ratelimiting.burst_all_requests }}"
{{- end }}
{{- if .Values.server.ratelimiting.user_create }}
- name: RATELIMIT_USER_CREATE
  value: "{{ .Values.server.ratelimiting.user_create }}"
{{- end }}
{{- if .Values.server.ratelimiting.burst_user_create }}
- name: RATELIMIT_BURST_USER_CREATE
  value: "{{ .Values.server.ratelimiting.burst_user_create }}"
{{- end }}
{{- if .Values.server.ratelimiting.stream_create }}
- name: RATELIMIT_STREAM_CREATE
  value: "{{ .Values.server.ratelimiting.stream_create }}"
{{- end }}
{{- if .Values.server.ratelimiting.burst_stream_create }}
- name: RATELIMIT_BURST_STREAM_CREATE
  value: "{{ .Values.server.ratelimiting.burst_stream_create }}"
{{- end }}
{{- if .Values.server.ratelimiting.commit_create }}
- name: RATELIMIT_COMMIT_CREATE
  value: "{{ .Values.server.ratelimiting.commit_create }}"
{{- end }}
{{- if .Values.server.ratelimiting.burst_commit_create }}
- name: RATELIMIT_BURST_COMMIT_CREATE
  value: "{{ .Values.server.ratelimiting.burst_commit_create }}"
{{- end }}
{{- if .Values.server.ratelimiting.post_getobjects_streamid }}
- name: RATELIMIT_POST_GETOBJECTS_STREAMID
  value: "{{ .Values.server.ratelimiting.post_getobjects_streamid }}"
{{- end }}
{{- if .Values.server.ratelimiting.burst_post_getobjects_streamid }}
- name: RATELIMIT_BURST_POST_GETOBJECTS_STREAMID
  value: "{{ .Values.server.ratelimiting.burst_post_getobjects_streamid }}"
{{- end }}
{{- if .Values.server.ratelimiting.post_diff_streamid }}
- name: RATELIMIT_POST_DIFF_STREAMID
  value: "{{ .Values.server.ratelimiting.post_diff_streamid }}"
{{- end }}
{{- if .Values.server.ratelimiting.burst_post_diff_streamid }}
- name: RATELIMIT_BURST_POST_DIFF_STREAMID
  value: "{{ .Values.server.ratelimiting.burst_post_diff_streamid }}"
{{- end }}
{{- if .Values.server.ratelimiting.post_objects_streamid }}
- name: RATELIMIT_POST_OBJECTS_STREAMID
  value: "{{ .Values.server.ratelimiting.post_objects_streamid }}"
{{- end }}
{{- if .Values.server.ratelimiting.burst_post_objects_streamid }}
- name: RATELIMIT_BURST_POST_OBJECTS_STREAMID
  value: "{{ .Values.server.ratelimiting.burst_post_objects_streamid }}"
{{- end }}
{{- if .Values.server.ratelimiting.get_objects_streamid_objectid }}
- name: RATELIMIT_GET_OBJECTS_STREAMID_OBJECTID
  value: "{{ .Values.server.ratelimiting.get_objects_streamid_objectid }}"
{{- end }}
{{- if .Values.server.ratelimiting.burst_get_objects_streamid_objectid }}
- name: RATELIMIT_BURST_GET_OBJECTS_STREAMID_OBJECTID
  value: "{{ .Values.server.ratelimiting.burst_get_objects_streamid_objectid }}"
{{- end }}
{{- if .Values.server.ratelimiting.get_objects_streamid_objectid_single }}
- name: RATELIMIT_GET_OBJECTS_STREAMID_OBJECTID_SINGLE
  value: "{{ .Values.server.ratelimiting.get_objects_streamid_objectid_single }}"
{{- end }}
{{- if .Values.server.ratelimiting.burst_get_objects_streamid_objectid_single }}
- name: RATELIMIT_BURST_GET_OBJECTS_STREAMID_OBJECTID_SINGLE
  value: "{{ .Values.server.ratelimiting.burst_get_objects_streamid_objectid_single }}"
{{- end }}
{{- if .Values.server.ratelimiting.post_graphql }}
- name: RATELIMIT_POST_GRAPHQL
  value: "{{ .Values.server.ratelimiting.post_graphql }}"
{{- end }}
{{- if .Values.server.ratelimiting.burst_post_graphql }}
- name: RATELIMIT_BURST_POST_GRAPHQL
  value: "{{ .Values.server.ratelimiting.burst_post_graphql }}"
{{- end }}
{{- if .Values.server.ratelimiting.get_auth }}
- name: RATELIMIT_GET_AUTH
  value: "{{ .Values.server.ratelimiting.get_auth }}"
{{- end }}
{{- if .Values.server.ratelimiting.burst_get_auth }}
- name: RATELIMIT_BURST_GET_AUTH
  value: "{{ .Values.server.ratelimiting.burst_get_auth }}"
{{- end }}


{{- if .Values.openTelemetry.tracing.url }}
# OpenTelemetry
- name: OTEL_TRACE_URL
  value: {{ .Values.openTelemetry.tracing.url | quote }}
{{- end }}
{{- if .Values.openTelemetry.tracing.key }}
- name: OTEL_TRACE_KEY
  value: {{ .Values.openTelemetry.tracing.key | quote }}
{{- end }}
{{- if .Values.openTelemetry.tracing.value }}
- name: OTEL_TRACE_VALUE
  value: {{ .Values.openTelemetry.tracing.value | quote }}
{{- end }}


{{- if .Values.featureFlags.workspacesMultiRegionEnabled }}
# Multi-region
- name: MULTI_REGION_CONFIG_PATH
  value: "/multi-region-config/multi-region-config.json"
{{- end }}

{{- if .Values.featureFlags.nextGenFileImporterEnabled }}
- name: FF_NEXT_GEN_FILE_IMPORTER_ENABLED
  value: {{ .Values.featureFlags.nextGenFileImporterEnabled | quote }}
{{- end }}

{{- if .Values.featureFlags.rhinoFileImporterEnabled }}
- name: FF_RHINO_FILE_IMPORTER_ENABLED
  value: {{ .Values.featureFlags.rhinoFileImporterEnabled  | quote }}
{{- end }}

{{- if .Values.featureFlags.backgroundJobsEnabled }}
- name: FILEIMPORT_QUEUE_POSTGRES_URL
  valueFrom:
    secretKeyRef:
      name: {{ default .Values.secretName .Values.ifc_import_service.db.connectionString.secretName }}
      key: {{ default "fileimport_queue_postgres_url" .Values.ifc_import_service.db.connectionString.secretKey }}
{{- end }}
- name: FILE_UPLOAD_URL_EXPIRY_MINUTES
  value: {{ .Values.file_upload_url_expiry_minutes | quote }}
{{- end }}
