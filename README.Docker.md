# Docker / Portainer / nginx-proxy-manager (npm_local)

## Warum sehe ich die Nginx-Default-Seite?
Das passiert fast immer, wenn **nicht** deine `index.html` nach `/usr/share/nginx/html` kopiert wurde.
In Angular 17+ (hier Angular 21) liegt der Build Output standardmäßig unter:

- `dist/LayoutMenuEditor/browser/index.html`

Der Container muss also genau diesen Ordner nach `/usr/share/nginx/html` kopieren.

## Portainer Stack (empfohlen, Netzwerk: npm_local)
`docker-compose.yml` ist im Repo bereits passend.

### Voraussetzungen
- nginx-proxy-manager Container ist im Docker Netzwerk `npm_local`
- Netzwerk `npm_local` existiert

### Deploy
1. In Portainer: **Stacks → Add stack**
2. **Build method: Repository** (oder bind mount auf den Projektordner).
   - Wenn du den Stack nur im Web-Editor einfügst, hat Portainer keinen Build-Context und findet kein Dockerfile.
3. Deploy.

## NPM Proxy Host
- Forward Hostname: `layout-menu-editor`
- Forward Port: `8080`

## Debugging
### 1) Prüfen, ob die App im Container liegt
Shell in den Container:
- `ls -la /usr/share/nginx/html`
  - muss `index.html`, `main-*.js`, `styles-*.css` zeigen

### 2) Prüfen, ob Nginx config aktiv ist
- `cat /etc/nginx/conf.d/default.conf`
  - muss `try_files $uri $uri/ /index.html;` enthalten

### 3) Caching
Wenn du nach einem neuen Deploy weiterhin „alte“ Dateien bekommst:
- Browser Hard Reload
- oder temporär in NPM Cache aus

