# Riuna Helm Chart
This Helm chart deploys Riuna, a self-hosted project and task management platform.
## Introduction
This chart bootstraps a Riuna deployment on a Kubernetes cluster using the Helm package manager. It deploys both the API backend and Web frontend components, along with a PostgreSQL database, with optional ingress or Gateway API resources.
## Prerequisites
- Kubernetes 1.23+
- Helm 3.2.0+
- PV provisioner support in the underlying infrastructure (if persistence is enabled)
## Quick Start
### Basic Installation
Install directly from GHCR:
```bash
helm install riuna oci://ghcr.io/kiim12m/charts/riuna \
  --namespace riuna \
  --create-namespace
# Access locally
kubectl port-forward svc/riuna-riuna 5173:5173 -n riuna
```
Open [http://localhost:5173](http://localhost:5173) and you're ready to go.
### Production Setup with Ingress
For real deployments, you'll want proper ingress:
```bash
helm install riuna oci://ghcr.io/kiim12m/charts/riuna \
  --namespace riuna \
  --create-namespace \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set "ingress.hosts[0].host=pm.yourcompany.com"
```
### Production Setup with Gateway API
If your cluster already has Gateway API CRDs and a `Gateway` configured, you can expose Riuna with an `HTTPRoute`:
```bash
helm install riuna oci://ghcr.io/kiim12m/charts/riuna \
  --namespace riuna \
  --create-namespace \
  --set gateway.enabled=true \
  --set "gateway.parentRefs[0].name=main-gateway" \
  --set "gateway.parentRefs[0].namespace=gateway-system" \
  --set "gateway.parentRefs[0].sectionName=https" \
  --set "gateway.hostnames[0]=pm.yourcompany.com"
```
## Installing the Chart
To install the published chart with the release name `my-riuna`:
```bash
helm install my-riuna oci://ghcr.io/kiim12m/charts/riuna
```
To install from a local checkout instead:
```bash
helm install my-riuna ./charts/riuna
```
The command deploys Riuna on the Kubernetes cluster with default configuration. The [Parameters](#parameters) section lists the parameters that can be configured during installation.
## Uninstalling the Chart
To uninstall/delete the `my-riuna` deployment:
```bash
helm uninstall my-riuna
```
## Parameters
### Global parameters
| Name                     | Description                                                                                                        | Value       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------- |
| `nameOverride`           | String to partially override the fullname template (will maintain the release name)                                | `""`        |
| `fullnameOverride`       | String to fully override the fullname template                                                                     | `""`        |
| `replicaCount`           | Number of replicas (ignored if autoscaling is enabled)                                                             | `1`         |
### Autoscaling parameters
| Name                                | Description                                                                                                        | Value       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------- |
| `autoscaling.enabled`               | Enable autoscaling for the deployment                                                                              | `false`     |
| `autoscaling.minReplicas`           | Minimum number of replicas                                                                                         | `1`         |
| `autoscaling.maxReplicas`           | Maximum number of replicas                                                                                         | `10`        |
| `autoscaling.targetCPUUtilizationPercentage` | Target CPU utilization percentage                                                                         | `80`        |
When CPU autoscaling is enabled, set `riuna.resources.requests.cpu`; Kubernetes cannot calculate CPU utilization without a CPU request.
### PostgreSQL Database parameters
| Name                                | Description                                                                                                        | Value                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `postgresql.enabled`                | Deploy PostgreSQL as part of this chart                                                                           | `true`                          |
| `postgresql.image.repository`       | PostgreSQL image repository                                                                                        | `postgres`                      |
| `postgresql.image.tag`              | PostgreSQL image tag                                                                                               | `16-alpine`                     |
| `postgresql.image.pullPolicy`       | PostgreSQL image pull policy                                                                                      | `IfNotPresent`                  |
| `postgresql.auth.database`          | PostgreSQL database name                                                                                           | `riuna`                         |
| `postgresql.auth.username`          | PostgreSQL username                                                                                                | `riuna_user`                    |
| `postgresql.auth.password`          | PostgreSQL password                                                                                                | `riuna_password`                |
| `postgresql.auth.existingSecret`    | Name of existing secret containing PostgreSQL credentials                                                          | `""`                            |
| `postgresql.persistence.enabled`    | Enable persistence for PostgreSQL data                                                                             | `true`                          |
| `postgresql.persistence.size`       | PostgreSQL PVC size                                                                                                | `8Gi`                           |
| `postgresql.persistence.storageClass` | PostgreSQL PVC storage class                                                                                     | `""`                            |
| `postgresql.persistence.accessMode` | PostgreSQL PVC access mode                                                                                         | `ReadWriteOnce`                 |
| `postgresql.service.type`           | PostgreSQL service type                                                                                            | `ClusterIP`                     |
| `postgresql.service.port`           | PostgreSQL service port                                                                                            | `5432`                          |
| `postgresql.resources`              | Resource requests and limits for PostgreSQL container                                                              | `{}`                            |
### Riuna application parameters
| Name                                | Description                                                                                                        | Value                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `riuna.image.repository`            | Riuna image repository                                                                                             | `ghcr.io/kiim12m/riuna`        |
| `riuna.image.tag`                   | Riuna image tag. Defaults to `Chart.appVersion` when empty                                                         | `""`                            |
| `riuna.image.pullPolicy`            | Riuna image pull policy                                                                                            | `IfNotPresent`                  |
| `riuna.service.type`                | Riuna service type                                                                                                 | `ClusterIP`                     |
| `riuna.service.port`                | Riuna service port                                                                                                 | `5173`                          |
| `riuna.service.targetPort`          | Riuna container port                                                                                               | `5173`                          |
| `riuna.env`                         | Environment variables for the Riuna container                                                                      | See `values.yaml`               |
| `riuna.env.clientUrl`               | Public URL of the Riuna instance. **Required for any non-localhost deployment**; sets `RIUNA_CLIENT_URL`. Omitting this causes "invalid origin" errors on login. Note: this key is case-sensitive (`clientUrl`, not `clientURL`). | `""` |
| `riuna.env.corsOrigins`             | Allowed CORS origins as a comma-separated string or YAML list                                                      | `[]`                            |
| `riuna.env.authSecret`              | Required Better Auth secret (minimum 32 characters), ignored if existingSecret is enabled                           | `""` |
| `riuna.env.existingSecret.enabled`  | Whether to use an existing secret for `AUTH_SECRET`                                                                | `false`                         |
| `riuna.env.existingSecret.name`     | Name of the existing secret containing `AUTH_SECRET`                                                               | `""`                            |
| `riuna.env.existingSecret.key`      | Key in the existing secret that contains `AUTH_SECRET`                                                             | `auth-secret`                   |
| `riuna.env.disableRegistration`     | Disable new user registration                                                                                      | `false`                         |
| `riuna.env.disablePasswordRegistration` | Disable password-based account creation while keeping social/OIDC registration available                        | `false`                         |
| `riuna.env.disableEmailOtpSignIn`   | Use email/password sign-in instead of verification codes when SMTP is configured                                   | `false`                         |
| `riuna.env.database.external.enabled` | Use external PostgreSQL database (set postgresql.enabled to false)                                               | `false`                         |
| `riuna.env.database.external.host`  | External PostgreSQL host                                                                                           | `""`                            |
| `riuna.env.database.external.port`  | External PostgreSQL port                                                                                           | `5432`                          |
| `riuna.env.database.external.database` | External PostgreSQL database name                                                                               | `riuna`                         |
| `riuna.env.database.external.username` | External PostgreSQL username                                                                                    | `riuna_user`                    |
| `riuna.env.database.external.password` | External PostgreSQL password                                                                                    | `""`                            |
| `riuna.env.database.external.existingSecret.enabled` | Use an existing secret for the external database connection URI                             | `false`                         |
| `riuna.env.database.external.existingSecret.name` | Name of the secret containing the database connection URI                                    | `""`                            |
| `riuna.env.database.external.existingSecret.passwordKey` | Key in the secret whose value is a full PostgreSQL connection URI                       | `postgres_uri`                  |
| `riuna.extraEnv`                    | Additional Kubernetes EnvVar entries appended to the Riuna container                                               | `[]`                            |
| `riuna.resources`                   | Resource requests and limits for the Riuna container (optional, disabled by default)                               | `{}`                            |
| `podSecurityContext`                | Security context applied at the Pod level                                                                          | `{}`                            |
| `securityContext`                   | Security context applied at the container level                                                                    | `{}`                            |
### Ingress parameters
| Name                                | Description                                                                                                        | Value                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `ingress.enabled`                   | Enable ingress                                                                                                     | `false`                         |
| `ingress.className`                 | Ingress class name                                                                                                 | `""`                            |
| `ingress.annotations`               | Ingress annotations                                                                                                | `{}`                            |
| `ingress.hosts`                     | Ingress hosts configuration                                                                                        | See `values.yaml`               |
| `ingress.tls`                       | Ingress TLS configuration                                                                                          | `[]`                            |
### Gateway API parameters
| Name                                | Description                                                                                                        | Value                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `gateway.enabled`                   | Enable Gateway API `HTTPRoute` creation                                                                            | `false`                         |
| `gateway.annotations`               | Annotations added to the `HTTPRoute`                                                                               | `{}`                            |
| `gateway.labels`                    | Extra labels added to the `HTTPRoute`                                                                              | `{}`                            |
| `gateway.parentRefs`                | Parent Gateway listener references for attaching the `HTTPRoute`                                                   | `[]`                            |
| `gateway.hostnames`                 | Hostnames exposed by the `HTTPRoute`                                                                               | `[]`                            |
| `gateway.rules`                     | Gateway API routing rules mapping paths to the chart services                                                      | See `values.yaml`               |
## Configuration Examples
### Minimal Configuration
```yaml
# values.yaml
riuna:
  env:
    authSecret: "your-secure-auth-secret-at-least-32-characters"
    clientUrl: "https://your-domain.com"
ingress:
  enabled: true
  className: nginx
  annotations: {}
  hosts:
    - host: your-domain.com
      paths:
        - path: /
          pathType: Prefix
          service: riuna
          port: 5173
```
### Production Configuration with TLS
```yaml
# values.yaml
replicaCount: 1
# PostgreSQL configuration
postgresql:
  auth:
    password: "your-secure-db-password"
  persistence:
    size: 20Gi
    storageClass: "managed-premium"
  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 100m
      memory: 128Mi
# Riuna configuration
riuna:
  resources:
    limits:
      cpu: 1000m
      memory: 1Gi
    requests:
      cpu: 200m
      memory: 256Mi
  env:
    authSecret: "your-secure-auth-secret-at-least-32-characters"
    clientUrl: "https://your-domain.com"
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
  hosts:
    - host: your-domain.com
      paths:
        - path: /
          pathType: Prefix
          service: riuna
          port: 5173
  tls:
    - secretName: riuna-tls
      hosts:
        - your-domain.com
```
### Production Configuration with Traefik
If you're running Traefik as your ingress controller (common in self-hosted clusters), configure the ingress directly rather than through the chart's built-in ingress support:
```yaml
# values.yaml
riuna:
  env:
    authSecret: "your-secure-auth-secret-at-least-32-characters"
    clientUrl: "https://riuna.your-domain.com"
```
```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: riuna-ingress
  namespace: riuna
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: traefik
  rules:
    - host: riuna.your-domain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: riuna-riuna
                port:
                  number: 5173
  tls:
    - hosts:
        - riuna.your-domain.com
      secretName: riuna-tls
```
### Using External PostgreSQL Database
If you prefer to use an external PostgreSQL database instead of the bundled one:
```yaml
# values.yaml
# Disable bundled PostgreSQL
postgresql:
  enabled: false
riuna:
  env:
    authSecret: "your-secure-auth-secret-at-least-32-characters"
    database:
      external:
        enabled: true
        host: "your-postgres-host.com"
        port: 5432
        database: "riuna"
        username: "riuna_user"
        password: "your-db-password"
```
### Using an Existing Secret for Sensitive Data
For production environments, it's recommended to store sensitive data like the auth secret and database credentials in Kubernetes Secrets:
When `postgresql.auth.existingSecret` is used with bundled PostgreSQL, the password is expanded by Kubernetes into `DATABASE_URL` at runtime and must be URL-safe. If your password contains reserved URI characters such as `@`, `:`, `/`, `#`, `%`, or spaces, use an external database and provide the complete connection URI through `riuna.env.database.external.existingSecret`.
```bash
# Create a Secret for sensitive data
kubectl create secret generic riuna-secrets \
  --namespace riuna \
  --from-literal=auth-secret="your-secure-auth-secret-at-least-32-characters" \
  --from-literal=postgres-password="your-secure-db-password"
```
Then reference these secrets in your values:
```yaml
# values.yaml
postgresql:
  auth:
    existingSecret: "riuna-secrets"
    secretKeys:
      userPasswordKey: "postgres-password"
riuna:
  env:
    existingSecret:
      enabled: true
      name: "riuna-secrets"
      key: "auth-secret"
```
#### Using an Existing Secret with External PostgreSQL
When using an external database, the secret must contain a full PostgreSQL connection URI rather than just the password. Any special characters in the password (such as `@`, `:`, `/`) must be [percent-encoded](https://developer.mozilla.org/en-US/docs/Glossary/Percent-encoding).
```bash
# Create the secret with a full connection URI
kubectl create secret generic riuna-secrets \
  --namespace riuna \
  --from-literal=auth-secret="your-secure-auth-secret-at-least-32-characters" \
  --from-literal=postgres_uri="postgresql://riuna_user:your-password@your-host:5432/riuna"
```
```yaml
# values.yaml
postgresql:
  enabled: false

riuna:
  env:
    clientUrl: "https://riuna.your-domain.com"
    existingSecret:
      enabled: true
      name: "riuna-secrets"
      key: "auth-secret"
    database:
      external:
        enabled: true
        host: "your-postgres-host.com"
        port: 5432
        database: "riuna"
        username: "riuna_user"
        password: ""
        existingSecret:
          enabled: true
          name: "riuna-secrets"
          passwordKey: postgres_uri
```
## Database Management
### PostgreSQL Configuration
The chart deploys PostgreSQL 16 (Alpine) by default with the following configuration:
- Database name: `riuna`
- Username: `riuna_user`
- Default password: `riuna_password` (change this in production!)
- Persistent storage: 8Gi (configurable)
The bundled PostgreSQL deployment is intended for development, trials, and small self-hosted installs. For production environments, use an external managed PostgreSQL database by setting `postgresql.enabled=false` and configuring `riuna.env.database.external`.
Bundled PostgreSQL credentials are only applied when PostgreSQL initializes an empty data directory. If a PVC already exists, changing `postgresql.auth.password` or `postgresql.auth.existingSecret` updates the Pod environment but does not rotate the password inside the existing database. For local retesting with a new password, uninstall the release and delete the test PVC before reinstalling:
```bash
helm uninstall riuna -n riuna-test
kubectl delete pvc riuna-postgresql-data -n riuna-test --ignore-not-found
```
To preserve data, rotate the password inside PostgreSQL first, then update the Helm values to match.
### Backup and Recovery
For production deployments, consider implementing regular database backups:
```bash
# Example backup command
kubectl exec -it deployment/my-riuna-postgresql -- pg_dump -U riuna_user riuna > riuna-backup.sql
```
### Migration from SQLite
If you're migrating from a previous SQLite-based installation, you'll need to:
1. Export your data from SQLite
2. Deploy the new PostgreSQL-based chart
3. Import your data into PostgreSQL

See `docs/copias-de-seguridad.md` in the main repo for Riuna's own backup and restore procedure.
## Troubleshooting
### "invalid origin" error on login
Riuna's API validates the `Origin` header on every request against `RIUNA_CLIENT_URL`. If `clientUrl` is not set (or is set incorrectly), every login attempt fails with this error.

Set `clientUrl` to the URL users access Riuna from:
```yaml
riuna:
  env:
    clientUrl: "https://riuna.your-domain.com"
```

> **Note:** The key is `clientUrl` (camelCase). `clientURL` (all-caps) is silently ignored; the env var will be empty and login will fail with no helpful error.

### Pods crash immediately after upgrading to use `existingSecret`
If pods enter `CrashLoopBackOff` after switching to an existing secret for the external database, the connection URI in the secret is likely wrong. Check what the pod is actually using:
```bash
kubectl get secret riuna-secrets -n riuna \
  -o jsonpath='{.data.postgres_uri}' | base64 -d
```
Common causes:
- Wrong password
- Password contains special characters that need percent-encoding (e.g. `p@ss` → `p%40ss`)
- Incorrect host, port, or database name in the URI

### PodSecurity warnings on install/upgrade
On clusters with Pod Security Admission enabled, you may see warnings like `would violate PodSecurity "restricted:latest"`. The chart exposes `podSecurityContext` and `securityContext` to address these. See the [Security](#security) section for recommended values.
## Architecture
This chart deploys the following components:
1. **Riuna application**: Serves the web UI and API from the combined Riuna image
2. **PostgreSQL Database**: Stores all application data with proper relational integrity
The Riuna application and PostgreSQL run in separate pods for resource isolation and simpler database lifecycle management.
## Production Environment
For production deployments, you should:
1. Set secure values for `AUTH_SECRET` and PostgreSQL passwords
2. Use an Ingress controller to expose the application
3. Configure TLS for secure access
4. Set appropriate resource limits and requests
5. Enable persistent storage with appropriate storage classes
6. Consider using external PostgreSQL for better scalability
```yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
  hosts:
    - host: your-domain.com
      paths:
        - path: /
          pathType: Prefix
          service: riuna
          port: 5173
  tls:
    - secretName: riuna-tls
      hosts:
        - your-domain.com
```
## Using Gateway API
As an alternative to Ingress, the chart can create an `HTTPRoute` for the Kubernetes Gateway API:
```yaml
# values.yaml
gateway:
  enabled: true
  parentRefs:
    - name: main-gateway
      namespace: gateway-system
      sectionName: https
  hostnames:
    - riuna.example.com
```
By default the chart creates one Gateway API rule:
1. `/` goes to the Riuna service
If you need custom matching or multiple backend references, override `gateway.rules` directly. Each `backendRefs` entry follows the same pattern as ingress and uses the chart-specific `service` field (`riuna`), which is expanded to the release-specific Service name.
## Security
For production deployments, consider the following security recommendations:
1. Use secure `AUTH_SECRET` and PostgreSQL passwords, preferably stored in Kubernetes Secrets
2. Enable TLS for ingress or Gateway API
3. Enable and set resource limits to prevent resource exhaustion
4. Use a dedicated storage class for the PostgreSQL database
5. Consider using a network policy to restrict traffic between components
6. Regularly update PostgreSQL and application images
### Pod Security Context
On clusters with Pod Security Admission enforcement, set the following to satisfy the `restricted` policy:
```yaml
riuna:
    podSecurityContext:
        runAsNonRoot: true
        seccompProfile:
            type: RuntimeDefault

    securityContext:
        allowPrivilegeEscalation: false
        capabilities:
            drop: ["ALL"]
```
### Registration Control
By default, user registration is enabled. To disable new user registration:
```yaml
riuna:
  env:
    disableRegistration: true
```
This will prevent new users from registering while still allowing existing users to log in. The registration option will be hidden from the login page.
