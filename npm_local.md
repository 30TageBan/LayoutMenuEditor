# NPM (nginx-proxy-manager) – Docker-Integration (Netz: npm_local)

## Ziel
Den Angular Build als Container bereitstellen und per **nginx-proxy-manager** (NPM) über eine Domain bereitstellen.

## Empfohlen: gemeinsames Docker-Netzwerk `npm_local`
Der Editor wird in dasselbe externe Docker-Netzwerk gehängt wie NPM.

### docker-compose.yml (Portainer Stack)
Im Repo ist das bereits passend vorbereitet (`docker-compose.yml`):
- kein `ports:`
- `expose: 8080`
- `networks: npm_local`

### NPM Proxy Host
In NPM → **Proxy Hosts** → **Add Proxy Host**:
- **Domain Names**: z.B. `editor.deine-domain.tld`
- **Scheme**: `http`
- **Forward Hostname**: `layout-menu-editor`
- **Forward Port**: `8080`
- **Websockets**: aus (nicht nötig)
- **Block Common Exploits**: kann an bleiben
- **SSL**: optional Let’s Encrypt

## SPA Routing
Ist im Container durch `nginx.conf` bereits korrekt:
- `try_files $uri $uri/ /index.html;`

## Troubleshooting
- **502 Bad Gateway**: 
  - Prüfen, ob beide Container wirklich im Netzwerk `npm_local` sind
  - Prüfen, ob NPM auf Port `8080` forwardet
- **Assets 404**: Prüfen, ob `src/index.html` `<base href="/">` hat (ist so)
