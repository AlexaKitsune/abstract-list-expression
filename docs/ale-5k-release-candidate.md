# ALE-5K — Preparación del Release Candidate 0.1.0

Fecha: 2026-10-27. No se publicó el paquete ni se crearon commits o tags.

## Veredicto

# CONDITIONAL

El candidato local 0.1.0 pasó en Node 22.23.4, tiene su política de Node declarada, un lockfile sincronizado y un tarball que se instaló y probó fuera del checkout. No es un artefacto de release listo para publicar aún: el árbol Git está sucio y no hay revisión inmutable que identifique el tarball; las consultas npm autenticadas no llegaron al registro por DNS, por lo que npm whoami, el owner/access status y la versión publicada no se confirmaron en esta sesión. El contexto de ALE-5K informa que la cuenta propietaria y el acceso ya fueron comprobados; el informe separa ese dato proporcionado de una verificación directa de esta ejecución.

## 1. Entorno y política de Node

Node y npm usados en pruebas:

- Node.js v22.23.4
- npm 10.9.9
- PATH explícito: /opt/homebrew/opt/node@22/bin antes del PATH integrado.

La política ahora es engines.node >=22.0.0. La suite, campañas y smoke externo probaron la versión concreta 22.23.4; Node 22.0.0 no se probó directamente. La declaración expresa la política de soporte, no una prueba de cada versión patch.

Node 24.21.0 no pudo arrancar en este entorno: dyld no encontró libsimdjson.33.dylib. La terminal también seleccionaba Node 24 al resolver npm sin PATH explícito. Se corrigió el PATH para toda ejecución del candidato y se utilizó Node 22.23.4. El fallo de carga del binario Node 24 es del entorno, no una regresión ALE. Node 24 había pasado las pruebas registradas en ALE-5I.

## 2. Pruebas

Con Node 22.23.4:

- Suite posterior a la preparación de versión: 81 aprobadas, 0 fallidas, 0 pendientes.
- Suite completa también pasó antes del cambio de metadata, en la misma versión.
- Current: semillas 1243488294, 1, 3735928559 y 8675309; 10.000 valores × siete opciones cada una = 280.000 round-trips, sin fallos.
- Next: 10.000 valores × siete opciones = 70.000 round-trips, sin fallos; profundidad 4/8/16/32, 3.612 round-trips sin fallos.
- Numérica current: 99.937 valores finitos binary64 comprobados, sin fallos.
- Numérica next: 100.000 valores exactos con Object.is y estabilidad canónica, sin fallos.
- Profundidad current: 3.612 round-trips en profundidades 4/8/16/32.
- Robustez: fuzz determinista de 1.000 fuentes en cada dialecto; cero excepciones inesperadas, mutaciones de prototipo o ejecución de contenido.
- Conformidad portable: fixtures y ejemplos normativos ejecutados dentro de la suite.
- git diff --check y node --check: pasaron.

Las campañas se ejecutaron antes del cambio de versión, sobre el mismo código runtime. Después del cambio de versión/engines se repitió npm test y volvió a pasar. No se alteró gramática, semántica ni API.

## 3. Cambios de versión y documentación

Se actualizaron:

- package.json: version 0.1.0, descripción v0.1.0 y engines.node >=22.0.0.
- package-lock.json: package raíz y metadata de engines sincronizados.
- CHANGELOG.md: release candidate 0.1.0, marcado no publicado.
- README.md: Node 22.0.0 mínimo declarado; Node 22.23.4 como versión probada y aclaración de que Node 22.0.0 no fue ejecutado.
- ale.js: comentario de encabezado v0.1.0 release candidate.
- docs/specification.md: estado para el candidato local; se mantienen referencias históricas a que el contrato se estabilizó bajo 0.0.2.

No se modificaron los informes históricos ALE-4A a ALE-5J. No se cambió current como default, legacy ni el estado experimental de next; ESM sigue siendo la interfaz soportada.

## 4. Paquete e instalación independiente

Se ejecutaron npm pack --dry-run --json y npm pack con Node 22.23.4. Después se instaló el tarball offline en /private/tmp/ale-5h-consumer, fuera del repositorio, y se ejecutó el smoke test importando desde @alexa.kitsune/ale.

El smoke test externo pasó con Node 22.23.4 y npm ls --all --depth=0 mostró solo @alexa.kitsune/ale@0.1.0. Se comprobaron los dialectos current/legacy/next, semántica exponent-like, opciones de stringify, error ALEParseError y claves propias __proto__, constructor y prototype. Las exportaciones son parseALE y stringifyALE mediante ESM.

El tarball tiene 10 archivos:

- CHANGELOG.md, LICENSE, README.md, ale.js y package.json.
- conformance/README.md y conformance/ale-conformance.json.
- docs/specification.md, docs/ale-5b1-results.md y docs/ale-5f-results.md.

Contiene la licencia MIT aprobada (copyright 2026 Alexa N C), documentación y fixtures. No incluye node_modules, tests/, benchmarks/, .git ni .DS_Store. El escaneo de patrones comunes de secretos, tokens y rutas locales no encontró coincidencias. npm ls confirmó que no se requieren dependencias runtime.

Hashes del candidato:

- SHA-256 tarball: 3bda540c6b377ee619bff7f461e2a7bbad4a2079518b692a81a26919d74e6aa1
- npm shasum: b8fd941a6298989a450223b2e1b38f2e4bdf7fa7
- npm integrity: sha512-SBVw+ygojNTq8rZjIjEaSQ+Hd/m6/OXQljjluGnyCnMFKBZNrLG5XIGa810lYIH7qvvL57x3oeyIfO4IxZfTNw==
- Tamaño: 38.650 bytes comprimido; 137.176 bytes desempaquetado.
- SHA-256 de LICENSE: cdf6240126cf5f23b05a0500d4d36c98a3169ddda0fce383a637745490c503aa
- SHA-256 de conformance/ale-conformance.json: 99415c2f4970e04016f57fff027df6c841d8da765bde63dd1268dd59055903e5

Los hashes identifican el tarball local construido desde el working tree actual. No son un hash ligado a commit.

## 5. Estado npm

La consulta directa por npm CLI se intentó con Node/npm 22, sin imprimir ni inspeccionar credenciales:

- npm whoami: ENOTFOUND para registry.npmjs.org.
- npm view @alexa.kitsune/ale version dist-tags: ENOTFOUND.
- npm access get status @alexa.kitsune/ale: ENOTFOUND.

La búsqueda pública de npm lista @alexa.kitsune/ale como un paquete público en 0.0.2 asociado al perfil alexa.kitsune: [ficha pública del paquete](https://www.npmjs.com/package/@alexa.kitsune/ale). El contexto proporcionado para ALE-5K indica que la cuenta alexa.kitsune ya inició sesión, figura como propietaria y el paquete tiene acceso público. Esos datos no pudieron confirmarse mediante la API en esta ejecución, debido a DNS restringido.

Antes de publicar, la propietaria debe repetir online npm whoami, npm view @alexa.kitsune/ale version dist-tags y npm access get status @alexa.kitsune/ale. No se publicó ni cambió el acceso. No se leyó ni expuso ningún token.

## 6. Git y archivos propuestos

HEAD permanece en 848f0c28aac7303e4de597c4371f475f5d74f7b5. El working tree está sucio y contiene cambios acumulados ALE-1–5K, tanto modificados como no rastreados; no se ejecutó git add, commit, push ni tag. Por ello el tarball no corresponde a una revisión identificable.

Se corrigió .gitignore para conservar en Git los informes históricos ALE-4A, 4C, 4D y semantic-contract.md, que antes quedaban ignorados por docs/*. Los .DS_Store continúan ignorados. Los informes históricos no se modificaron.

Para el primer commit se propone revisar e incluir:

- .gitignore, ale.js, package.json y package-lock.json.
- README.md, CHANGELOG.md, CONTRIBUTING.md y LICENSE.
- tests/ y conformance/.
- docs/specification.md, docs/semantic-contract.md, informes ALE-4A a ALE-5K.
- benchmarks/ale-5b, ale-5b1, ale-5c, ale-5e y ale-5f, conservando corpus, runners y resultados deterministas como material reproducible; se excluyen del tarball npm.

Mensaje de commit propuesto: feat: prepare ALE 0.1.0 release candidate.

No se ejecutó. Tras revisar y crear un commit limpio, se debe regenerar el tarball desde esa revisión y comprobar que produce los mismos contenidos y resultados. La etiqueta futura propuesta es v0.1.0 sobre el commit de release ya versionado; no se creó.

## 7. Riesgos y checklist de publicación

- [ ] Repetir las consultas npm autenticadas cuando registry.npmjs.org sea accesible; corroborar identidad, propietario, versión actual y visibilidad.
- [ ] Crear una revisión Git limpia de los archivos aprobados; regenerar y guardar el hash desde esa revisión.
- [ ] Confirmar que el tarball generado desde el commit limpio coincide con el candidato auditado.
- [ ] Publicar solo tras aprobación explícita; esta fase no publicó.
- [ ] Mantener current como default, legacy para compatibilidad, next experimental y ESM como interfaz soportada.
- [ ] Node 22.23.4 pasó; Node 22.0.0 no se probó directamente.

## Conclusión

El candidato local 0.1.0 está preparado, probado en Node 22.23.4 e instalable desde tarball. Para considerarlo READY para publicación faltan la verificación online de la cuenta/acceso npm y una revisión Git limpia que identifique el artefacto. No se publicó.
